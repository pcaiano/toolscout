import http from 'node:http';

const PORT = Number(process.env.PORT || 10000);
const EXPECTED = { pt: 143, en: 234, agents: 65, total: 442 };
const MAILCHIMP_START = new Date('2026-09-30T14:20:00Z');
const MAILCHIMP_END = new Date('2026-09-30T14:55:00Z');

const state = {
  status: 'starting',
  startedAt: new Date().toISOString(),
  finishedAt: null,
  expected: EXPECTED,
  audience: null,
  subscriptionId: null,
  alreadySubscribed: 0,
  updated: 0,
  skippedExplicitOptOut: 0,
  failed: 0,
  failures: [],
  message: null
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function safeError(err) {
  return String(err?.message || err || 'Unknown error').slice(0, 500);
}

async function hubspot(path, options = {}) {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) throw new Error('HUBSPOT_PRIVATE_APP_TOKEN is not configured');

  const url = 'https://api.hubapi.com' + path;
  let lastErr;

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }

    if (res.ok) return body;

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after') || 0);
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 500 * (attempt + 1));
      lastErr = new Error('HubSpot ' + res.status + ': ' + JSON.stringify(body));
      continue;
    }

    throw new Error('HubSpot ' + res.status + ': ' + JSON.stringify(body));
  }

  throw lastErr || new Error('HubSpot request failed after retries');
}

async function getContacts() {
  const props = [
    'email',
    'createdate',
    'categoria_do_contacto',
    'hs_language'
  ].join(',');

  const all = [];
  let after = null;

  do {
    const qs = new URLSearchParams({
      limit: '100',
      archived: 'false',
      properties: props
    });
    if (after) qs.set('after', after);

    const data = await hubspot('/crm/v3/objects/contacts?' + qs.toString());
    all.push(...(data?.results || []));
    after = data?.paging?.next?.after || null;
  } while (after);

  return all;
}

function selectAudience(contacts) {
  const usable = contacts.filter(c => c?.properties?.email);
  const pt = usable.filter(c =>
    c.properties.categoria_do_contacto === 'Cliente' &&
    c.properties.hs_language === 'pt-pt'
  );
  const en = usable.filter(c =>
    c.properties.categoria_do_contacto === 'Cliente' &&
    c.properties.hs_language === 'en'
  );
  const agents = usable.filter(c =>
    c.properties.categoria_do_contacto === 'Agente'
  );

  const ids = new Set([...pt, ...en, ...agents].map(c => c.id));
  const combined = [...pt, ...en, ...agents].filter((c, i, arr) =>
    arr.findIndex(x => x.id === c.id) === i
  );

  if (
    pt.length !== EXPECTED.pt ||
    en.length !== EXPECTED.en ||
    agents.length !== EXPECTED.agents ||
    combined.length !== EXPECTED.total ||
    ids.size !== EXPECTED.total
  ) {
    throw new Error(
      'Audience safety check failed. Current counts: PT=' + pt.length +
      ', EN=' + en.length + ', Agents=' + agents.length +
      ', unique=' + combined.length + '. Expected 143/234/65/442.'
    );
  }

  return { pt, en, agents, combined };
}

function basisFor(contact) {
  const p = contact.properties;
  const created = new Date(p.createdate);

  if (created >= MAILCHIMP_START && created < MAILCHIMP_END) {
    return {
      legalBasis: 'CONSENT_WITH_NOTICE',
      legalBasisExplanation:
        'Migrated from the existing Mailchimp subscribed audience; marketing subscription was recorded before the HubSpot migration.'
    };
  }

  if (p.categoria_do_contacto === 'Agente') {
    return {
      legalBasis: 'LEGITIMATE_INTEREST_OTHER',
      legalBasisExplanation:
        'Existing professional real-estate agent relationship; relevant property-sharing and partnership communications are sent on legitimate interest, with unsubscribe available at any time.'
    };
  }

  return {
    legalBasis: 'LEGITIMATE_INTEREST_PQL',
    legalBasisExplanation:
      'Existing CRM prospect/client relationship for Fine & Country residential real-estate services; relevant marketing communication is sent on legitimate interest, with unsubscribe available at any time.'
  };
}

async function getMarketingDefinition() {
  const defs = await hubspot('/communication-preferences/v4/definitions');
  const matches = (defs?.results || []).filter(d =>
    d.name === 'Marketing Information' &&
    d.communicationMethod === 'Email' &&
    d.isActive !== false
  );

  if (matches.length !== 1) {
    throw new Error('Expected exactly one active Email subscription named Marketing Information; found ' + matches.length);
  }

  return matches[0];
}

async function getStatus(email, subscriptionId) {
  const encoded = encodeURIComponent(email);
  const status = await hubspot(
    '/communication-preferences/v4/statuses/' + encoded + '?channel=EMAIL'
  );
  const relevant = (status?.results || []).find(s =>
    String(s.subscriptionId) === String(subscriptionId)
  ) || null;

  let globalOptOut = false;
  try {
    const wide = await hubspot(
      '/communication-preferences/v4/statuses/' + encoded + '/unsubscribe-all'
    );
    const values = [
      ...(wide?.results || []),
      ...(wide?.wideStatuses || [])
    ];
    globalOptOut = values.some(x => x?.status === 'UNSUBSCRIBED');
  } catch (err) {
    // If this endpoint shape varies, the per-subscription status still protects explicit opt-outs.
  }

  return { relevant, globalOptOut };
}

async function subscribe(contact, subscriptionId) {
  const email = contact.properties.email.trim();
  const current = await getStatus(email, subscriptionId);

  if (current.globalOptOut || current.relevant?.status === 'UNSUBSCRIBED') {
    state.skippedExplicitOptOut++;
    return;
  }

  if (current.relevant?.status === 'SUBSCRIBED') {
    state.alreadySubscribed++;
    return;
  }

  const basis = basisFor(contact);
  const body = {
    subscriptionId: Number(subscriptionId),
    statusState: 'SUBSCRIBED',
    legalBasis: basis.legalBasis,
    legalBasisExplanation: basis.legalBasisExplanation,
    channel: 'EMAIL'
  };

  await hubspot(
    '/communication-preferences/v4/statuses/' + encodeURIComponent(email),
    { method: 'POST', body: JSON.stringify(body) }
  );

  const verify = await getStatus(email, subscriptionId);
  if (verify.relevant?.status !== 'SUBSCRIBED') {
    throw new Error('Post-write verification did not return SUBSCRIBED');
  }

  state.updated++;
}

async function run() {
  if (!process.env.HUBSPOT_PRIVATE_APP_TOKEN) {
    state.status = 'waiting_for_token';
    state.message = 'Add HUBSPOT_PRIVATE_APP_TOKEN in Render. The service will rerun after restart.';
    return;
  }

  try {
    state.status = 'validating';
    const definition = await getMarketingDefinition();
    state.subscriptionId = String(definition.id);

    const contacts = await getContacts();
    const audience = selectAudience(contacts);
    state.audience = {
      pt: audience.pt.length,
      en: audience.en.length,
      agents: audience.agents.length,
      total: audience.combined.length
    };

    state.status = 'running';

    for (let i = 0; i < audience.combined.length; i++) {
      const contact = audience.combined[i];
      try {
        await subscribe(contact, definition.id);
      } catch (err) {
        state.failed++;
        state.failures.push({
          contactId: contact.id,
          error: safeError(err)
        });
      }

      if ((i + 1) % 25 === 0) {
        console.log(JSON.stringify({
          progress: i + 1,
          total: audience.combined.length,
          updated: state.updated,
          alreadySubscribed: state.alreadySubscribed,
          skippedExplicitOptOut: state.skippedExplicitOptOut,
          failed: state.failed
        }));
      }

      await sleep(120);
    }

    state.status = state.failed === 0 ? 'complete' : 'complete_with_errors';
    state.finishedAt = new Date().toISOString();
    state.message =
      'Processed ' + audience.combined.length + ' contacts. ' +
      'Updated=' + state.updated +
      ', alreadySubscribed=' + state.alreadySubscribed +
      ', skippedExplicitOptOut=' + state.skippedExplicitOptOut +
      ', failed=' + state.failed + '.';

    console.log(JSON.stringify(state));
  } catch (err) {
    state.status = 'fatal_error';
    state.finishedAt = new Date().toISOString();
    state.message = safeError(err);
    console.error(JSON.stringify(state));
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, status: state.status }));
    return;
  }

  if (req.url === '/' || req.url === '/status') {
    const publicState = {
      status: state.status,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      expected: state.expected,
      audience: state.audience,
      subscriptionId: state.subscriptionId,
      alreadySubscribed: state.alreadySubscribed,
      updated: state.updated,
      skippedExplicitOptOut: state.skippedExplicitOptOut,
      failed: state.failed,
      message: state.message
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(publicState, null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('HubSpot communication-preferences fixer listening on port ' + PORT);
  run();
});
