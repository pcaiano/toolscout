// Shared by static-page preparation and the dynamic opportunity-page template.
export const GA4_SCRIPT = '<script defer src="/ga4-consent.js" data-toolscout-ga4="G-9VR80SYYH7"></script>';

export function withGa4(html) {
  if (/\bsrc=["']\/ga4-consent\.js["']/i.test(html)) return html;
  return html.replace(/<\/head>/i, `${GA4_SCRIPT}</head>`);
}
