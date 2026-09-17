# ToolScout Visitor Integrity Audit - 2026-09-17

## Reason for audit

The Command Center showed dozens of Browser Guard human sessions while Unique Human Visitors remained at 0 today / 1 in the last 24 hours. The two metrics were not using the same canonical human proof.

## Production evidence before correction

Read-only D1 audit at 2026-09-17 17:36 UTC:

- Browser Guard: 39 distinct allowed sessions today, 40 in the last 24 hours.
- Browser Guard fingerprints: 28 distinct fingerprints today.
- Raw first-party visitor tracker: 55 distinct visitor IDs today and 252 in the last 24 hours. This raw population is not itself canonical human traffic because it is less strict than Browser Guard.
- Confirmed visitor table: 0 visitors today and 1 in the last 24 hours.
- Guard-to-confirmed linkage: 0 of 39 Browser Guard sessions today and 0 of 40 in the last 24 hours were linked to confirmed visitor IDs.

This proved that the Command Center Unique Human Visitors metric was undercounting. The old confirmed visitor path required the legacy funnel `page_confirmed` event, while canonical human sessions had already moved to Browser Guard `traffic_guard_events decision='allowed'`.

## Canonical correction

Production entry point: `visitor-integrity-worker.js`.

Canonical human session:

`traffic_guard_events decision='allowed'`

Canonical unique human visitor:

`a stable anonymous first-party visitor ID linked to at least one Browser Guard allowed ToolScout session`

The visitor ID is mirrored from the existing `toolscout_visitor_v1` first-party localStorage identity into a secure SameSite first-party cookie so that server-side Browser Guard session evidence can be linked without third-party analytics.

A Browser Guard accepted page confirmation links the session to the first-party visitor ID. A verified same-origin `/go/` outbound can also create the link for a fast human navigation that leaves before the normal Browser Guard delay.

Owner, blocked automation, known bots and synthetic traffic remain excluded.

## No historical backfill

The previous 39 sessions from 2026-09-17 cannot be linked retrospectively to exact visitor IDs with defensible certainty because the old schema did not store that relationship. They must not be guessed or reconstructed from IP/fingerprint heuristics.

A new exact visitor tracking window began at 2026-09-17 17:38:44 UTC. Until enough time passes, today, last-24-hours and month-to-date unique visitor windows are intentionally partial.

## Operational rule

Do not compare a complete Browser Guard session window with a partial unique visitor window as if both had the same coverage. When reporting Unique Human Visitors, preserve the tracking start and coverage flags. Raw `visitor_events` can be used only as a diagnostic signal, never as the canonical human visitor count.

The public health endpoint exposes `visitorIntegrity` with the new tracking start, unique visitor totals, Browser Guard session totals, linked-session totals and coverage state so future undercounting is detectable rather than silent.
