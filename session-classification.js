export const SESSION_CLASSIFICATIONS = Object.freeze({
  LIKELY_HUMAN: 'likely-human',
  KNOWN_BOT: 'known-bot/crawler',
  SYNTHETIC: 'synthetic/test',
  OWNER: 'owner',
  UNKNOWN: 'unknown/legacy'
});

const SYNTHETIC_UA = /(?:curl|wget|httpie|postmanruntime|insomnia|uptime|healthcheck|github-actions|toolscout production smoke|toolscout healthcheck|synthetic|pingdom|statuscake|better uptime|checkly|k6\/|artillery|lighthouse|pagespeed|headlesschrome)/i;
const KNOWN_BOT_UA = /(?:googlebot|google-inspectiontool|bingbot|duckduckbot|baiduspider|yandexbot|slurp|applebot|petalbot|bytespider|facebookexternalhit|facebot|linkedinbot|twitterbot|discordbot|telegrambot|whatsapp|semrushbot|ahrefsbot|mj12bot|dotbot|rogerbot|screaming frog|dataforseobot|gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic-ai|perplexitybot|cohere-ai|amazonbot)/i;
const PLAUSIBLE_BROWSER_UA = /mozilla\/5\.0/i;
const BROWSER_ENGINE_UA = /(?:chrome|crios|firefox|fxios|safari|edg|opr)\//i;

export function isOwnerRequest(request) {
  return (request.headers.get('Cookie') || '').split(';').some(part => part.trim() === 'toolscout_owner=1');
}

export function classifySessionRequest(request) {
  if (isOwnerRequest(request)) return SESSION_CLASSIFICATIONS.OWNER;
  const userAgent = request.headers.get('User-Agent') || '';
  if (SYNTHETIC_UA.test(userAgent)) return SESSION_CLASSIFICATIONS.SYNTHETIC;
  if (KNOWN_BOT_UA.test(userAgent)) return SESSION_CLASSIFICATIONS.KNOWN_BOT;
  if (PLAUSIBLE_BROWSER_UA.test(userAgent) && BROWSER_ENGINE_UA.test(userAgent)) return SESSION_CLASSIFICATIONS.LIKELY_HUMAN;
  return SESSION_CLASSIFICATIONS.UNKNOWN;
}

export function isSyntheticRequest(request) {
  return classifySessionRequest(request) === SESSION_CLASSIFICATIONS.SYNTHETIC;
}

export const SESSION_UPSERT_SQL = `INSERT INTO sessions
  (session_id,source,owner_flag,classification,first_seen_at,last_seen_at)
  VALUES (?,?,?,?,datetime('now'),datetime('now'))
  ON CONFLICT(session_id) DO UPDATE SET
    last_seen_at=datetime('now'),
    owner_flag=MAX(owner_flag,excluded.owner_flag),
    classification=CASE
      WHEN excluded.classification='owner' THEN 'owner'
      WHEN sessions.classification='owner' THEN 'owner'
      WHEN excluded.classification='synthetic/test' THEN 'synthetic/test'
      WHEN sessions.classification='synthetic/test' THEN 'synthetic/test'
      WHEN excluded.classification='known-bot/crawler' THEN 'known-bot/crawler'
      WHEN sessions.classification='known-bot/crawler' THEN 'known-bot/crawler'
      WHEN sessions.classification='unknown/legacy' THEN 'unknown/legacy'
      ELSE excluded.classification
    END`;
