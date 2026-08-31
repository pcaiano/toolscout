export const FUNNEL_EVENT_TYPES = new Set([
  'session_started',
  'recommendation_started',
  'recommendation_completed',
  'recommendation_result_viewed',
  'tool_viewed',
  'outbound_clicked'
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID = /^[A-Za-z0-9_-]{16,80}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const SOURCE = /^[A-Za-z0-9][A-Za-z0-9._:&=/-]{0,99}$/;
const PATH = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?-]{0,199}$/;
const HOST = /^(?=.{1,120}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;

export function parseFunnelEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowed = new Set(['event_id','session_id','event_type','intent_slug','tool_slug','path','source','referrer_host']);
  if (Object.keys(value).some(key => !allowed.has(key))) return null;
  const event = {
    event_id: String(value.event_id || ''),
    session_id: String(value.session_id || ''),
    event_type: String(value.event_type || ''),
    intent_slug: value.intent_slug == null ? null : String(value.intent_slug),
    tool_slug: value.tool_slug == null ? null : String(value.tool_slug),
    path: value.path == null ? null : String(value.path),
    source: String(value.source || 'direct'),
    referrer_host: value.referrer_host == null ? null : String(value.referrer_host).toLowerCase()
  };
  if (!EVENT_ID.test(event.event_id) || !UUID.test(event.session_id) || !FUNNEL_EVENT_TYPES.has(event.event_type)) return null;
  if (event.intent_slug !== null && !SLUG.test(event.intent_slug)) return null;
  if (event.tool_slug !== null && !SLUG.test(event.tool_slug)) return null;
  if (event.path !== null && !PATH.test(event.path)) return null;
  if (!SOURCE.test(event.source)) return null;
  if (event.referrer_host !== null && !HOST.test(event.referrer_host)) return null;
  if (event.event_type === 'outbound_clicked' && !event.tool_slug) return null;
  return event;
}

export function rate(numerator, denominator) {
  const n = Number(numerator || 0), d = Number(denominator || 0);
  return d > 0 ? Number((n / d * 100).toFixed(1)) : null;
}

