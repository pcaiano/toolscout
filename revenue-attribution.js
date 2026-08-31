const CLICK_REF = /^clk_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createClickRef() {
  return `clk_${crypto.randomUUID()}`;
}

export function appendVerifiedSubId(destination, entry, clickRef) {
  const tracking = entry?.tracking?.subId;
  if (!entry?.enabled || !tracking?.supported || !tracking?.parameter || !tracking?.evidenceUrl) {
    return { destination, subId: null };
  }
  if (!CLICK_REF.test(clickRef)) return { destination, subId: null };
  const url = new URL(destination);
  url.searchParams.set(tracking.parameter, clickRef);
  return { destination: url.toString(), subId: clickRef };
}

export function summarizeLedger(rows) {
  const lifecycle = { pending: 0, confirmed: 0, paid: 0, reversed: 0 };
  const attribution = { unattributed: 0, attributed: 0, vendor_confirmed: 0 };
  for (const row of rows || []) {
    if (Object.hasOwn(lifecycle, row.status)) lifecycle[row.status] += 1;
    if (Object.hasOwn(attribution, row.attribution_status)) attribution[row.attribution_status] += 1;
  }
  return { lifecycle, attribution };
}
