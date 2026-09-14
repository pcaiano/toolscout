# Google Analytics 4

ToolScout Web uses Measurement ID `G-9VR80SYYH7`, Web Stream ID `15775395660`, and URL `https://trytoolscout.org`. The owner confirmed Enhanced Measurement is enabled. The property reporting time zone and currency have not been independently verified.

## Installation

`ga4-consent.js` loads Google's tag only after explicit analytics consent (basic consent mode). Advertising storage, advertising user data and personalization remain denied. The tag runs only on the public production hostname. Owner-marked visits, private dashboards, embeds and operational routes are excluded.

The public banner has equally accessible accept and reject choices. The choice is remembered locally for 180 days. The persistent Analytics settings button permits withdrawal and clears GA first-party cookies. Withdrawal in one tab is applied in other open tabs. If local storage is unavailable, the current page still works but cannot remember the choice across navigation.

`scripts/unify-public-nav.mjs` includes the loader once on each public static HTML page during deployment preparation. The dynamic opportunity template in `seo-page.js` uses the same helper. Run preparation after all static generators and before uploading assets. Existing Google Analytics Enhanced Measurement settings remain account-controlled. This change does not add custom recommendation, revenue or affiliate conversion events.

The initial page configuration removes fragments and arbitrary query parameters, retaining only conventional campaign parameters with restricted characters. Referrer query strings are removed. Existing first-party ToolScout operational tracking is separate and unchanged; the privacy page explains this distinction.

## Verification and release

Run `node --test tests/ga4-consent.test.mjs`. The tests use a simulated browser DOM to check consent transitions, exclusions, cookie removal, script/config deduplication, campaign parameters, static preparation and the dynamic template. They do not prove receipt by Google or replace visual browser inspection.

Before deployment, verify Worker `toolscout` and D1 `toolscout` / `cac6bc3c-d838-4edd-ba29-597030afb397`. Run `node scripts/unify-public-nav.mjs` on the complete current repository before the existing Worker deployment procedure. No schema, binding, route or cron changes are needed.

Release status at preparation on 2026-09-14: not deployed. GitHub deployment workflows are in conservation mode until 2026-10-01; the local Cloudflare authentication check could not refresh the existing session. Do not restore the suspended workflows to deploy this change. Browser verification and a real GA4 Realtime/DebugView receipt remain pending.

After deployment, check the loader on the homepage, a tool profile, a guide, a comparison and the privacy page. In a fresh non-owner browser session, confirm no Google Analytics request before acceptance or after rejection. Accept analytics and verify the Google script and a page-view request for `G-9VR80SYYH7`; then withdraw consent and verify collection stops. Confirm the visit in GA4 Realtime. Do not claim historical data or infer revenue from visits.
