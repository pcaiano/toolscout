import http from "node:http";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

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
const BAD_LOCAL = /(noreply|no-reply|donotreply|support|helpdesk|help|billing|invoice|privacy|legal|abuse|sales|advertis|adinquir|^ads?$|career|jobs|recruit|^hr$|customer|customerservice|shop|store|orders|webmaster|finance|membership|ombudsman|reader|aboservice|jobanzeigen|werben|relay|marketing|^newsletter$|publicidad|pubblicita|comercial|reklam|subscriptions?|abonnement|accounts?|corrections?|bugs?)/i;
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
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (match, hex, dec) => {
      const cp = parseInt(hex || dec, hex ? 16 : 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : match;
    })
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
  const parts = []; // Mailbox names are not independent identity evidence.
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


function extractArticleLinks(html, base) {
  const out = new Set();
  const baseHost = new URL(base).hostname.replace(/^www\./, "");
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of String(html || "").matchAll(re)) {
    let u;
    try { u = new URL(decodeEntities(m[1]), base); } catch { continue; }
    if (u.hostname.replace(/^www\./, "") !== baseHost) continue;
    const p = u.pathname;
    if (/\/(about|contact|team|staff|author|authors|profile|people|contributors?|category|tag|topic|privacy|terms|login|signup|subscribe|advertis|jobs?|careers?)\b/i.test(p)) continue;
    const anchor = stripHtml(m[2]).replace(/\s+/g, " ").trim();
    const articleish = /\/20\d{2}\/(?:0?[1-9]|1[0-2])\//.test(p) ||
      (p.split("/").filter(Boolean).length >= 2 && /-[a-z0-9]+-[a-z0-9]+/i.test(p));
    if (!articleish || anchor.length < 20) continue;
    u.hash = ""; u.search = "";
    out.add(u.toString());
    if (out.size >= 20) break;
  }
  return [...out];
}

function extractStructuredPeople(html, url, domain) {
  const out = [];
  const seen = new Set();
  const add = (name, role, profileUrl) => {
    let n = String(name || "").replace(/\s+/g, " ").trim();
    n = n.replace(/\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?$/i, "").trim();
    if (!looksLikePersonName(n)) return;
    const k = n.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({domain, name:n, role:role || "Journalist / Author", source_url:profileUrl || url});
  };

  const scripts = String(html || "").matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { for (const x of node) walk(x); return; }
    if (typeof node !== "object") return;
    for (const key of ["author","creator","editor"]) {
      const v=node[key];
      const vals=Array.isArray(v)?v:[v];
      for(const person of vals){
        if(person && typeof person==="object"){
          add(person.name, person.jobTitle || (key==="editor"?"Editor":"Journalist / Author"), person.url);
        } else if(typeof person==="string") add(person, key==="editor"?"Editor":"Journalist / Author", url);
      }
    }
    for(const v of Object.values(node)) if(v && typeof v==="object") walk(v);
  };
  for(const m of scripts){
    try { walk(JSON.parse(decodeEntities(m[1]))); } catch {}
  }

  const text=stripHtml(html);
  for(const m of text.matchAll(/\b(?:By|Written by|Author:)\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})\b/g)){
    add(m[1],"Journalist / Author",url);
  }
  return out.slice(0,60);
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
  // Public mailto/Cloudflare HTML may hide the address from visible text.
  // Decode only the published value, adjacent to its original anchor context.
  const contextualHtml = raw.replace(/<(?:a|span)\b[^>]*>/gi, tag => {
    const cf = tag.match(/data-cfemail=["']([0-9a-f]+)["']/i) || tag.match(/email-protection#([0-9a-f]+)/i);
    const mailto = tag.match(/href=["']mailto:([^"'?\s<>]+)/i);
    const email = cf ? decodeCfEmail(cf[1]) : mailto ? mailto[1] : "";
    return email ? tag + " " + email + " " : tag;
  });
  const text = stripHtml(contextualHtml);
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
    email = email.split("?")[0].replace(/[),.;:]+$/g, "").toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) continue;
    if (/^u00[0-9a-f]{2}/i.test(email)) continue;
    const emailDomain = email.split("@")[1].toLowerCase();
    if (/^(example\.com|company\.com|sentry\.io)$/.test(emailDomain)) continue;
    if (/^[a-f0-9]{24,}@/i.test(email)) continue;
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(emailDomain)) continue;
    if (/^(samplemail|yourname|youremail|dinemail|test|example)@/i.test(email)) continue;
    const idx = text.toLowerCase().indexOf(email.toLowerCase());
    const context = idx >= 0 ? text.slice(Math.max(0, idx - 220), Math.min(text.length, idx + email.length + 220)) : "";
    const c = classify(email, context, new URL(url).pathname);
    if (!c.relevant) continue;
    const local = email.split("@")[0];
    const name = ""; // A nearby name is not proof of mailbox ownership.
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
  const timer = setTimeout(() => ctrl.abort(), 5500);
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


async function fetchAny(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5500);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": USER_AGENT,
        "accept": "application/json,application/xml,text/xml,text/plain,text/html,*/*"
      }
    });
    if (!r.ok) return { ok: false, status: r.status, url: r.url || url, text: "" };
    const text = (await r.text()).slice(0, 2_000_000);
    return { ok: true, status: r.status, url: r.url || url, text };
  } catch (e) {
    return { ok: false, status: 0, url, text: "", error: String(e?.name || e) };
  } finally {
    clearTimeout(timer);
  }
}

function personNameFromAuthorUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex(x => /^(author|authors|profile|user|users)$/i.test(x));
    let slug = idx >= 0 ? parts[idx + 1] : "";
    if (!slug) return "";
    slug = decodeURIComponent(slug)
      .replace(/[-_]+/g, " ")
      .replace(/\b\d{4,}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!slug || /^(admin|editor|editorial|staff|team|guest|news|redaction|redaktion|redacao)$/i.test(slug)) return "";
    return slug.split(" ").map(x => x ? x[0].toUpperCase() + x.slice(1) : x).join(" ");
  } catch {
    return "";
  }
}

async function discoverPublicAuthorDirectory(domain) {
  const out = [];
  const apiUrl = `https://${domain}/wp-json/wp/v2/users?per_page=100&_fields=name,link,slug`;
  const sitemapUrls = [
    `https://${domain}/wp-sitemap-users-1.xml`,
    `https://${domain}/author-sitemap.xml`,
    `https://${domain}/author-sitemap1.xml`,
    `https://${domain}/author-sitemap_index.xml`
  ];

  const [api, ...maps] = await Promise.all([
    fetchAny(apiUrl),
    ...sitemapUrls.map(fetchAny)
  ]);

  if (api.ok) {
    try {
      const rows = JSON.parse(api.text);
      if (Array.isArray(rows)) {
        for (const row of rows.slice(0, 100)) {
          const name = String(row?.name || "").trim();
          const link = String(row?.link || "").trim();
          if (!name || !link) continue;
          out.push({
            domain,
            name,
            role: "Journalist / Author",
            source_url: link,
            discovery: "wordpress_users_api"
          });
        }
      }
    } catch {}
  }

  for (const sm of maps) {
    if (!sm.ok || !sm.text) continue;
    for (const m of sm.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
      const url = decodeEntities(m[1].trim());
      if (!/(\/author\/|\/authors\/|\/profile\/|\/user\/)/i.test(url)) continue;
      const name = personNameFromAuthorUrl(url);
      if (!name) continue;
      out.push({
        domain,
        name,
        role: "Journalist / Author",
        source_url: url,
        discovery: "public_author_sitemap"
      });
    }
  }

  const best = new Map();
  for (const p of out) {
    const key = p.name.toLowerCase();
    if (!best.has(key)) best.set(key, p);
  }
  return [...best.values()].slice(0, 120);
}

async function crawlDomain(domain) {
  const seeds = new Set(COMMON_PATHS.map(p => `https://${domain}${p}`));
  const fetched = [];
  const contacts = [];
  const people = [];
  function publishProgress() {
    if (isMainThread || !parentPort) return;
    const rankedContacts = [...contacts].sort((a, b) => a.score - b.score || (a.context || "").length - (b.context || "").length);
    const uniqueContacts = [...new Map(rankedContacts.map(c => [c.email.toLowerCase(), c])).values()].slice(0, 150);
    const uniquePeople = [...new Map(people.map(p => [p.name.toLowerCase(), p])).values()].slice(0, 120);
    parentPort.postMessage({progress:true, domain, pages_fetched:new Set(fetched).size, contacts:uniqueContacts, people:uniquePeople});
  }

  try {
    const directoryPeople = await discoverPublicAuthorDirectory(domain);
    people.push(...directoryPeople);
    publishProgress();
  } catch {}
  const authorLinks = new Map();
  const articleLinks = new Set();

  function absorbPage(page) {
    fetched.push(page.url);
    contacts.push(...extractContacts(page.html, page.url, domain));
    people.push(...extractPeopleFromText(page.html, page.url, domain));
    people.push(...extractStructuredPeople(page.html, page.url, domain));
    for (const a of extractAuthorLinks(page.html, page.url)) {
      if (!authorLinks.has(a.url)) authorLinks.set(a.url, a);
    }
    for (const u of extractArticleLinks(page.html, page.url)) articleLinks.add(u);
    publishProgress();
  }

  const first = await fetchPage(`https://${domain}/`);
  if (first.ok) {
    absorbPage(first);
    for (const u of extractLinks(first.html, first.url).slice(0, 14)) seeds.add(u);
  }

  // Actual publisher links outrank guessed paths; include staff/team paths.
  const discovered = first.ok ? extractLinks(first.html, first.url) : [];
  const priority = ["/contact", "/contact-us", "/about", "/about-us", "/team", "/staff", "/masthead", "/authors", "/impressum", "/contacto", "/kontakt", "/contatti"];
  // Owner-selected public author/contact pages are reviewed URL evidence,
  // not guessed email patterns. Only this domain's HTTPS URLs are eligible.
  const configured = String(process.env.PUBLIC_SOURCE_URLS || "").split(",").flatMap(raw => {
    try {
      const u = new URL(raw.trim());
      if (u.protocol !== "https:" || u.username || u.password || u.port || u.hostname.replace(/^www\./, "") !== domain.replace(/^www\./, "")) return [];
      u.hash = "";
      return [u.href];
    } catch { return []; }
  }).slice(0, 16);
  const urls = [...new Set([...configured, ...new Set([...discovered, ...priority.map(p => `https://${domain}${p}`), ...seeds])])]
    .filter(u => !fetched.includes(u)).slice(0, 16);
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

  const articleTargets = [...articleLinks].slice(0, 6);
  cursor = 0;
  const articleWorkers = Array.from({ length: 6 }, async () => {
    while (cursor < articleTargets.length) {
      const i = cursor++;
      const page = await fetchPage(articleTargets[i]);
      if (!page.ok) continue;
      absorbPage(page);
    }
  });
  await Promise.all(articleWorkers);

  const authorTargets = [...authorLinks.values()].slice(0, 20);
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
    if (!prev || c.score > prev.score || (c.score === prev.score && c.context && !prev.context)) bestContacts.set(key, c);
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

async function crawlDomainBounded(domain) {
  return new Promise(resolve => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { domain },
      resourceLimits: { maxOldGenerationSizeMb: 96 }
    });
    let settled = false;
    let partial = {domain, pages_fetched:0, contacts:[], people:[]};
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
      worker.terminate().catch(() => {});
    };
    const timer = setTimeout(() => finish({
      ...partial,
      status: "timeout", error: "domain_budget_exceeded", retry_required: true
    }), 60000);
    worker.on("message", result => {
      if (result.progress) { const {progress, ...data} = result; partial = data; }
      else {
        // An inaccessible publisher is a retry, never a completed discovery.
        const normalized = result?.status === "complete" && !Number(result.pages_fetched)
          ? {...result, status: "retry_required", retry_required: true, error: "zero_pages_fetched"}
          : result;
        finish(normalized);
      }
    });
    worker.once("error", error => finish({
      ...partial,
      status: "failed", error: String(error.message), retry_required: true
    }));
    worker.once("exit", code => {
      if (!settled) finish({
        ...partial,
        status: "failed", error: "worker_exit_" + code, retry_required: true
      });
    });
  });
}

async function crawlMany(domains, onResult = () => {}) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: 3 }, async () => {
    while (cursor < domains.length) {
      const i = cursor++;
      results[i] = await crawlDomainBounded(domains[i]);
      onResult(results[i]);
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

if (isMainThread) server.listen(PORT, "0.0.0.0", () => {
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



  if (String(process.env.JDB_PROBE || "") === "1") {
    (async () => {
      const probeUrl = "https://journalistdb.com/journalists/beat/technology";
      try {
        const page = await fetchPage(probeUrl);
        console.log("PR_JDB_PROBE " + JSON.stringify({
          ok: page.ok,
          status: page.status,
          url: page.url,
          html_length: (page.html || "").length,
          text_sample: stripHtml(page.html || "").slice(0, 12000),
          html_sample: String(page.html || "").slice(0, 12000)
        }));
      } catch (err) {
        console.error("PR_JDB_PROBE_ERROR " + JSON.stringify({error: String(err?.stack || err)}));
      }
    })();
  }

  const seriesDomains = [...new Set(
    String(process.env.SERIES_DOMAINS || "")
      .split(",")
      .map(normalizeDomain)
      .filter(Boolean)
  )].slice(0, 400);

  if (seriesDomains.length) {
    (async () => {
      const seriesId = process.env.SERIES_ID || new Date().toISOString();
      console.log("PR_CRAWL_SERIES_START " + JSON.stringify({series_id: seriesId, domains: seriesDomains.length}));
      let totalContacts = 0;
      let totalPeople = 0;
      let processed = 0;
      let succeeded = 0;
      let retryRequired = 0;
      const uniqueCandidateEmails = new Set();
      for (let offset = 0; offset < seriesDomains.length; offset += 20) {
        const group = seriesDomains.slice(offset, offset + 20);
        const batchId = seriesId + "-" + String(offset / 20 + 1).padStart(2, "0");
        const started = Date.now();
        console.log("PR_CRAWL_BATCH_START " + JSON.stringify({batch_id: batchId, domains: group}));
        try {
          const results = await crawlMany(group, result => {
            console.log("PR_CRAWL_DOMAIN_RESULT " + JSON.stringify({batch_id: batchId, ...result}));
          });
          const contacts = results.flatMap(r => r.contacts || []);
          const people = results.flatMap(r => r.people || []);
          totalContacts += contacts.length;
          totalPeople += people.length;
          processed += group.length;
          succeeded += results.filter(r => r.status === "complete" && r.pages_fetched > 0).length;
          retryRequired += results.filter(r => r.retry_required || r.status !== "complete" || !r.pages_fetched).length;
          for (const contact of contacts) if (contact.email) uniqueCandidateEmails.add(contact.email.toLowerCase());
          console.log("PR_CRAWL_BATCH_RESULT " + JSON.stringify({
            batch_id: batchId,
            domains_requested: group.length,
            domains_with_contacts: results.filter(r => (r.contacts || []).length).length,
            domains_with_people: results.filter(r => (r.people || []).length).length,
            contacts_found: contacts.length,
            people_found: people.length,
            elapsed_ms: Date.now() - started
          }));
        } catch (err) {
          console.error("PR_CRAWL_BATCH_ERROR " + JSON.stringify({batch_id: batchId, error: String(err?.stack || err)}));
        }
      }
      console.log("PR_CRAWL_SERIES_RESULT " + JSON.stringify({
        series_id: seriesId,
        domains_requested: seriesDomains.length,
        domains_processed: processed,
        domains_completed: succeeded,
        domains_retry_required: retryRequired,
        unique_public_email_candidates: uniqueCandidateEmails.size,
        contacts_found: totalContacts,
        people_found: totalPeople
      }));
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

else if (workerData?.domain) {
  // Keep the worker alive while fetch promises settle; the parent enforces 60s.
  const keepAlive = setInterval(() => {}, 1000);
  crawlDomain(workerData.domain).then(result => parentPort.postMessage({...result, status: "complete"})).catch(error => parentPort.postMessage({domain:workerData.domain, pages_fetched:0, contacts:[], people:[], status:"failed", error:String(error.message), retry_required:true})).finally(() => clearInterval(keepAlive));
}
