import http from "node:http";

const PORT = Number(process.env.PORT || 10000);
const USER_AGENT = "ToolScoutPRMediaResearch/1.0 (+https://trytoolscout.org)";

const COMMON_PATHS = [
  "/",
  "/about", "/about-us", "/aboutus", "/who-we-are",
  "/contact", "/contact-us", "/contacto", "/kontakt", "/contatti",
  "/team", "/staff", "/masthead", "/authors", "/editorial",
  "/press", "/press-room", "/newsroom",
  "/impressum", "/redaktion", "/redacao", "/redazione"
];

const LINK_HINTS = /(about|team|staff|masthead|author|editor|contact|press|newsroom|impressum|redaktion|redacao|redazione|kontakt|contacto)/i;
const GOOD_LOCAL = /(editor|editorial|editors|news|newsroom|press|presse|prensa|tips|story|stories|pitch|redacao|redacao|redaktion|redazione|redaccion|redaccion|redac|redactie|desk|journalist|reporter|tech|technology|startup|saas|ai|software)/i;
const BAD_LOCAL = /(noreply|no-reply|donotreply|support|helpdesk|help|billing|invoice|privacy|legal|abuse|sales|advertis|adinquir|^ads?$|career|jobs|recruit|^hr$|customer|customerservice|shop|store|orders|webmaster|finance|membership|ombudsman|reader|aboservice|jobanzeigen|werben|relay|accounts?|corrections?|bugs?)/i;
const ROLE_WORDS = /(editor|reporter|journalist|writer|correspondent|producer|news|editorial|press|technology|software|saas|startup|artificial intelligence|\bai\b|developer|cloud|cyber|security|enterprise|data|digital)/i;

function json(res, status, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  res.end(data);
}

function normalizeDomain(v) {
  let s = String(v || "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(":")[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return null;
  if (/^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(s)) return null;
  return s;
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/&#46;|&period;/gi, ".")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripHtml(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function decodeCfEmail(hex) {
  try {
    if (!hex || hex.length < 4 || hex.length % 2) return null;
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out.includes("@") ? out : null;
  } catch {
    return null;
  }
}

function extractLinks(html, base) {
  const out = new Set();
  for (const m of String(html || "").matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(decodeEntities(m[1]), base);
      if (u.hostname.replace(/^www\./, "") !== new URL(base).hostname.replace(/^www\./, "")) continue;
      if (!LINK_HINTS.test(u.pathname)) continue;
      u.hash = "";
      u.search = "";
      out.add(u.toString());
    } catch {}
  }
  return [...out];
}

function inferName(local, context) {
  const ctx = String(context || "")
    .replace(/\bmailto:\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const nameRole = ctx.match(/\b([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’-]+){1,3})\s*[-–—|,:]\s*(Editor|Reporter|Journalist|Writer|Correspondent|Producer|News Editor|Managing Editor|Editor-in-Chief|Technology Editor|Tech Editor)\b/i);
  if (nameRole) return nameRole[1].trim();

  const cleanLocal = local.replace(/^(editorial|editor|editors|news|newsroom|press|presse|prensa|tips|contact|info|hello|redacao|redaktion|redazione|redaccion)$/i, "");
  if (!cleanLocal) return "";
  const parts = cleanLocal.split(/[._-]+/).filter(x => /^[a-z][a-z'-]{1,}$/i.test(x));
  if (parts.length >= 2 && parts.length <= 4) {
    return parts.map(x => x[0].toUpperCase() + x.slice(1)).join(" ");
  }
  return "";
}

function classify(email, context, sourcePath) {
  const local = email.split("@")[0].toLowerCase();
  const good = GOOD_LOCAL.test(local);
  const bad = BAD_LOCAL.test(local);
  const editorialContext = ROLE_WORDS.test(context) || /(editor|press|news|team|staff|author|masthead|redaktion|redacao|redazione)/i.test(sourcePath);
  let score = 0;
  if (good) score += 4;
  if (editorialContext) score += 3;
  if (/^(info|contact|hello)$/i.test(local)) score += 1;
  if (bad) score -= 8;
  if (/@gmail\.com$|@protonmail\.com$|@outlook\.com$|@hotmail\.com$/i.test(email)) score -= 1;

  let kind = "professional";
  if (/^(press|presse|prensa|tips|news|newsroom|editorial|editors|redacao|redaktion|redazione|redaccion)/i.test(local)) kind = "editorial_role_inbox";
  else if (bad) kind = "non_editorial";
  else if (good || editorialContext) kind = "editorial_person_or_desk";

  return {
    score,
    kind,
    relevant: score >= 3 && !bad,
    confidence: score >= 6 ? "high" : score >= 3 ? "medium" : "low"
  };
}


function looksLikePersonName(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length < 4 || s.length > 70) return false;
  if (/\b(editorial|team|staff|contact|about|news|press|home|author|authors|contributors|privacy|terms|advertise|subscribe)\b/i.test(s)) return false;
  if (/^(editor|reporter|journalist|writer|producer|strategist|outreach|case study|marketing|press|news)\b/i.test(s)) return false;
  const parts = s.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return false;
  return parts.every(p => /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.\-]+$/.test(p) || /^[A-Z]{2,}$/.test(p));
}

function extractAuthorLinks(html, base) {
  const out = new Map();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of String(html || "").matchAll(re)) {
    let u;
    try { u = new URL(decodeEntities(m[1]), base); } catch { continue; }
    const baseHost = new URL(base).hostname.replace(/^www\./, "");
    if (u.hostname.replace(/^www\./, "") !== baseHost) continue;
    if (!/(\/author\/|\/authors\/|\/profile\/|\/people\/|\/contributors?\/|\/staff\/|\/team\/|\/by\/)/i.test(u.pathname)) continue;
    const name = stripHtml(m[2]).replace(/\s+/g, " ").trim();
    if (!looksLikePersonName(name)) continue;
    u.hash = ""; u.search = "";
    const key = u.toString();
    if (!out.has(key)) out.set(key, {url:key, name});
  }
  return [...out.values()];
}

function extractPeopleFromText(html, url, domain) {
  const text = stripHtml(html);
  const out = [];
  const role = "(?:Editor(?:-in-Chief| in Chief)?|Managing Editor|Executive Editor|News Editor|Technology Editor|Tech Editor|Senior Editor|Reporter|Senior Reporter|Journalist|Writer|Senior Writer|Correspondent|Producer|Editorial Director|Editorial Lead|Staff Writer|Contributor)";
  const re = new RegExp("\\b([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})\\s*(?:[-–—|,:]|\\bis\\b)?\\s*(" + role + ")\\b", "gi");
  const seen = new Set();
  for (const m of text.matchAll(re)) {
    const name = m[1].replace(/\s+/g, " ").trim();
    const job = m[2].replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!looksLikePersonName(name) || seen.has(key)) continue;
    seen.add(key);
    out.push({domain, name, role:job, source_url:url});
  }
  return out.slice(0, 80);
}

function extractContacts(html, url, domain) {
  const raw = decodeEntities(String(html || ""));
  const text = stripHtml(raw);
  const emails = new Set();

  for (const m of raw.matchAll(/mailto:([^"'?\s<>]+)/gi)) emails.add(m[1].trim());
  for (const m of raw.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) emails.add(m[0].trim());
  for (const m of raw.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) {
    const decoded = decodeCfEmail(m[1]);
    if (decoded) emails.add(decoded);
  }
  for (const m of raw.matchAll(/email-protection#([0-9a-f]+)/gi)) {
    const decoded = decodeCfEmail(m[1]);
    if (decoded) emails.add(decoded);
  }

  const out = [];
  for (let email of emails) {
    email = email.replace(/[),.;:]+$/g, "").toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    const emailDomain = email.split("@")[1].toLowerCase();
    if (/^(example\.com|company\.com|sentry\.io)$/.test(emailDomain)) continue;
    if (/^[a-f0-9]{24,}@/i.test(email)) continue;
    const idx = text.toLowerCase().indexOf(email.toLowerCase());
    const context = idx >= 0 ? text.slice(Math.max(0, idx - 220), Math.min(text.length, idx + email.length + 220)) : "";
    const c = classify(email, context, new URL(url).pathname);
    if (!c.relevant) continue;
    const local = email.split("@")[0];
    const name = inferName(local, context);
    out.push({
      domain,
      name,
      email,
      type: c.kind,
      confidence: c.confidence,
      score: c.score,
      context: context.slice(0, 420),
      source_url: url
    });
  }
  return out;
}

async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": USER_AGENT,
        "accept": "text/html,application/xhtml+xml"
      }
    });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.includes("text/html")) return { ok: false, status: r.status, url: r.url || url, html: "" };
    const html = (await r.text()).slice(0, 2_000_000);
    return { ok: true, status: r.status, url: r.url || url, html };
  } catch (e) {
    return { ok: false, status: 0, url, html: "", error: String(e?.name || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function crawlDomain(domain) {
  const seeds = new Set(COMMON_PATHS.map(p => `https://${domain}${p}`));
  const fetched = [];
  const contacts = [];
  const people = [];
  const authorLinks = new Map();

  function absorbPage(page) {
    fetched.push(page.url);
    contacts.push(...extractContacts(page.html, page.url, domain));
    people.push(...extractPeopleFromText(page.html, page.url, domain));
    for (const a of extractAuthorLinks(page.html, page.url)) {
      if (!authorLinks.has(a.url)) authorLinks.set(a.url, a);
    }
  }

  const first = await fetchPage(`https://${domain}/`);
  if (first.ok) {
    absorbPage(first);
    for (const u of extractLinks(first.html, first.url).slice(0, 14)) seeds.add(u);
  }

  const urls = [...seeds].filter(u => !fetched.includes(u)).slice(0, 18);
  let cursor = 0;
  const workers = Array.from({ length: 5 }, async () => {
    while (cursor < urls.length) {
      const i = cursor++;
      const page = await fetchPage(urls[i]);
      if (!page.ok) continue;
      absorbPage(page);
    }
  });
  await Promise.all(workers);

  const authorTargets = [...authorLinks.values()].slice(0, 35);
  cursor = 0;
  const authorWorkers = Array.from({ length: 6 }, async () => {
    while (cursor < authorTargets.length) {
      const i = cursor++;
      const target = authorTargets[i];
      const page = await fetchPage(target.url);
      if (!page.ok) {
        people.push({domain, name:target.name, role:"Journalist / Author", source_url:target.url});
        continue;
      }
      absorbPage(page);
      if (!people.some(p => p.name.toLowerCase() === target.name.toLowerCase())) {
        people.push({domain, name:target.name, role:"Journalist / Author", source_url:page.url});
      }
    }
  });
  await Promise.all(authorWorkers);

  const bestContacts = new Map();
  for (const c of contacts) {
    const key = c.email.toLowerCase();
    const prev = bestContacts.get(key);
    if (!prev || c.score > prev.score) bestContacts.set(key, c);
  }

  const bestPeople = new Map();
  for (const p of people) {
    if (!p.name) continue;
    const key = p.name.toLowerCase();
    if (!bestPeople.has(key)) bestPeople.set(key, p);
  }

  return {
    domain,
    pages_fetched: [...new Set(fetched)].length,
    contacts: [...bestContacts.values()].sort((a, b) => b.score - a.score),
    people: [...bestPeople.values()].slice(0, 120)
  };
}

async function discoverMuckrackOutlet(outletSlug, outletDomain) {
  const url = "https://muckrack.com/media-outlet/" + outletSlug;
  const page = await fetchPage(url);
  if (!page.ok) return { outlet_slug: outletSlug, outlet_domain: outletDomain, status: page.status || 0, journalists: [] };
  return {
    outlet_slug: outletSlug,
    outlet_domain: outletDomain,
    status: page.status,
    journalists: parseMuckrackJournalists(page.html, outletSlug, outletDomain)
  };
}

async function discoverMuckrackMany(entries) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: 3 }, async () => {
    while (cursor < entries.length) {
      const i = cursor++;
      results[i] = await discoverMuckrackOutlet(entries[i].slug, entries[i].domain);
    }
  });
  await Promise.all(workers);
  return results;
}

async function crawlMany(domains) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: 3 }, async () => {
    while (cursor < domains.length) {
      const i = cursor++;
      results[i] = await crawlDomain(domains[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (u.pathname === "/health") {
    return json(res, 200, { ok: true, service: "toolscout-pr-media-crawler", version: 1 });
  }

  if (u.pathname === "/crawl") {
    const raw = (u.searchParams.get("domains") || "").split(",").map(normalizeDomain).filter(Boolean);
    const domains = [...new Set(raw)].slice(0, 20);
    if (!domains.length) return json(res, 400, { error: "Pass ?domains=example.com,example.org (max 20)" });

    const started = Date.now();
    const results = await crawlMany(domains);
    const contacts = results.flatMap(r => r.contacts);
    return json(res, 200, {
      ok: true,
      domains_requested: domains.length,
      domains_with_contacts: results.filter(r => r.contacts.length).length,
      contacts_found: contacts.length,
      elapsed_ms: Date.now() - started,
      results
    });
  }

  return json(res, 200, {
    service: "ToolScout PR Media Crawler",
    endpoints: {
      health: "/health",
      crawl: "/crawl?domains=techcrunch.com,venturebeat.com"
    },
    note: "Extracts only public professional editorial/press emails from public publisher pages."
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ToolScout PR Media Crawler listening on ${PORT}`);

  const startupDomains = [...new Set(
    String(process.env.BATCH_DOMAINS || "")
      .split(",")
      .map(normalizeDomain)
      .filter(Boolean)
  )].slice(0, 40);

  if (startupDomains.length) {
    (async () => {
      const batchId = process.env.BATCH_ID || new Date().toISOString();
      const started = Date.now();
      console.log("PR_CRAWL_BATCH_START " + JSON.stringify({batch_id: batchId, domains: startupDomains}));
      try {
        const results = await crawlMany(startupDomains);
        const contacts = results.flatMap(r => r.contacts);
        const people = results.flatMap(r => r.people || []);
        for (const result of results) {
          console.log("PR_CRAWL_DOMAIN_RESULT " + JSON.stringify({batch_id: batchId, ...result}));
        }
        console.log("PR_CRAWL_BATCH_RESULT " + JSON.stringify({
          batch_id: batchId,
          domains_requested: startupDomains.length,
          domains_with_contacts: results.filter(r => r.contacts.length).length,
          domains_with_people: results.filter(r => (r.people || []).length).length,
          contacts_found: contacts.length,
          people_found: people.length,
          elapsed_ms: Date.now() - started
        }));
      } catch (err) {
        console.error("PR_CRAWL_BATCH_ERROR " + JSON.stringify({
          batch_id: batchId,
          error: String(err?.stack || err)
        }));
      }
    })();
  }

  const muckrackEntries = String(process.env.MUCKRACK_OUTLETS || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => {
      const parts = x.split("|").map(y => y.trim());
      const domain = normalizeDomain(parts[1] || parts[0]);
      const slug = (parts[0] || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/.]/)[0].toLowerCase();
      return { slug, domain };
    })
    .filter(x => x.slug && x.domain)
    .slice(0, 40);

  if (muckrackEntries.length) {
    (async () => {
      const batchId = process.env.MUCKRACK_BATCH_ID || new Date().toISOString();
      console.log("PR_MUCKRACK_BATCH_START " + JSON.stringify({batch_id: batchId, outlets: muckrackEntries}));
      try {
        const results = await discoverMuckrackMany(muckrackEntries);
        const journalists = results.flatMap(r => r.journalists);
        console.log("PR_MUCKRACK_BATCH_RESULT " + JSON.stringify({
          batch_id: batchId,
          outlets_requested: muckrackEntries.length,
          outlets_with_results: results.filter(r => r.journalists.length).length,
          journalists_found: journalists.length,
          results
        }));
      } catch (err) {
        console.error("PR_MUCKRACK_BATCH_ERROR " + JSON.stringify({batch_id: batchId, error: String(err?.stack || err)}));
      }
    })();
  }
});
