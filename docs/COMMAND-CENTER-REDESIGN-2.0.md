# ToolScout 2.0 — Command Center Redesign

Status: implementation branch
Branch: `redesign-2-command-center`
Date: 2026-10-05

## Goal

The Command Center is part of the ToolScout 2.0 redesign. It must feel like the private operating system of the business, not a collection of engineering widgets.

The public brand and the private operating surface share the same design language:

- graphite / carbon / off-white / Signal Lime
- strong editorial hierarchy
- restrained borders
- minimal card chrome
- fast, precise motion
- information density without visual noise

The Command Center has a different purpose from the public site: decision support for the owner.

## Primary questions

The first screen must answer, in order:

1. Is ToolScout attracting real demand?
2. Is Google visibility improving?
3. Is traffic becoming commercially useful?
4. Is authority growing?
5. Is editorial output current and gaining traction?
6. Is monetization working?
7. What is the Growth Brain doing about the biggest gaps?
8. What needs human action?
9. Is any data source or engine unhealthy?

Internal activity is not success. Operational counters are secondary unless they explain a business result or a failure.

## Command Center information architecture

### 1. Executive pulse

A compact first band with current business truth:

- Visitors / users today
- Sessions 24h
- Google clicks 28d
- Google impressions 28d
- Average position
- Outbound clicks 24h
- Monetized outbound 24h
- Referring domains
- Confirmed revenue when available

Each metric must state its canonical source.

Unavailable means unavailable, never zero.

### 2. Google Analytics explorer

One large analytical surface, not several disconnected cards.

Report tabs:

- Overview
- Acquisition
- Landing pages
- Geography
- Devices
- Engagement

Metric / range controls should behave like an analytics product, not a static report.

Initial supported ranges:

- 7d
- 28d
- MTD
- 30d

Longer ranges can be added when the backend preserves enough history.

The chart area changes without reloading the page.

Reports:

#### Overview

Chart:
- Sessions
- Users

Summary:
- sessions
- users
- new users
- engaged sessions
- engagement rate
- average session duration

#### Acquisition

Table:
- Default channel group
- source / medium
- sessions
- users
- engagement rate

#### Landing pages

Table:
- landing page
- sessions
- users
- engaged sessions
- engagement rate
- average session duration

#### Geography

Table:
- country
- sessions
- users

No mini map. Country list remains the canonical presentation.

#### Devices

Table:
- device category
- sessions
- users
- engaged sessions
- engagement rate

#### Engagement

Chart:
- engagement rate
- engaged sessions
- new users

The Command Center should not attempt to recreate every GA4 report. It should surface the reports that change business decisions.

### 3. Google Search Console explorer

One large analytical surface with report tabs:

- Performance
- Queries
- Pages
- Countries
- Devices
- Indexing
- Opportunities

Performance metric controls:

- Clicks
- Impressions
- CTR
- Average position

The selected metric occupies the main chart. Do not stack several tiny charts when one readable chart can be switched instantly.

Initial supported ranges:

- 7d
- 28d

Later:
- 3 months
- 6 months
- 12 months

when canonical history is stored or queried on demand.

#### Queries

Top search queries with:

- clicks
- impressions
- CTR when available
- average position
- related page when known

#### Pages

Top landing pages from Search Console with:

- clicks
- impressions
- CTR
- average position
- page type

#### Countries / devices

Use first-party GSC data.

#### Indexing

Show:

- indexed
- inspected
- excluded
- index recovery candidates
- inspection coverage
- canonical mismatches
- quota state

Keep indexing separate from performance.

#### Opportunities

Turn the existing search queues into a decision list:

- striking distance
- high impressions / low rank
- protect
- index recovery

Each item should expose the recommended action and its execution state.

### 4. Commercial funnel

Show the business path:

Traffic -> Search / discovery -> Outbound -> Monetized outbound -> Confirmed revenue

Use GA4 for users / sessions and ToolScout server redirect truth for outbound.

Never add GA4 outbound events to server outbound counts.

### 5. Authority

Show current provider truth and history:

- Ahrefs when machine-observed
- SE Ranking when machine-observed
- referring domains
- backlinks
- dofollow
- domain / inlink authority metric
- acquisition attempts
- new independent domains

A stale provider remains visibly stale.

### 6. Editorial authority

Show:

- current publication freshness
- latest What's New story date
- editorial authority portfolio score
- pages below target
- search demand attached to editorial assets
- pages with high impressions but low rank
- publication cadence

The private dashboard should make the editorial strategy measurable.

### 7. Growth Brain

The default owner view should answer:

- What changed?
- What is the Brain doing now?
- Why is it doing it?
- What result does it expect?
- What completed recently?
- What failed?
- What is blocked by a human gate?

Raw engine events remain drill-down detail.

### 8. Needs You

Keep the Chairman Queue prominent but compact.

Only complete, actionable human gates are visible here.

### 9. System Truth

Collapsed by default unless:

- a canonical source is unavailable
- a source is stale beyond policy
- an engine has stalled
- a contract has failed repeatedly
- a human action is required

## Visual hierarchy

The Command Center should use the ToolScout 2.0 system but be denser than the public site.

- dark shell
- off-white analytical surfaces where helpful
- Signal Lime only for live / selected / healthy focus
- red / amber only for real failure or degradation
- no gradient card backgrounds
- fewer rounded containers
- tables and fine dividers for dense data
- large charts get space
- important controls stay near the chart title

## Motion

Follow `docs/MOTION-SYSTEM-2.0.md`.

Report switches:
- 140-180 ms crossfade
- no full-card slide
- preserve chart dimensions to avoid layout jump

Metric toggles:
- selected state responds immediately
- line redraw may animate once, 180-260 ms
- no continuous chart animation

## Existing canonical inputs

Current implementation already has useful foundations:

GA4:
- `/analytics/api/google/acquisition`
- daily sessions / users
- source / medium / channel / landing page
- countries

GSC:
- `data/gsc-daily-trend.json`
- `data/gsc-search-reality.json`
- `reports/gsc-signals.json`
- page-level top queries
- countries
- devices
- indexing truth
- opportunity queues

Commerce:
- `/analytics/api/commerce`

Business truth:
- `/api/command-center-business-truth`

The redesign should extend these contracts rather than introduce a second analytics truth.

## Data extensions in this branch

GA4 acquisition should additionally expose:

- channels
- landing pages
- devices
- daily new users
- daily engaged sessions
- daily engagement rate
- daily average session duration

GSC business truth should additionally expose:

- countries
- devices
- top pages
- page-level top queries
- current search opportunities

## Definition of done

The Command Center redesign is complete only when:

1. the executive pulse gives the business state in one screen
2. GA4 reports can be switched without leaving the dashboard
3. GSC reports and metrics can be switched without leaving the dashboard
4. source freshness is explicit
5. unavailable sources stay unavailable
6. owner traffic is not silently mixed into business truth
7. server outbound remains canonical for outbound
8. authority sources are measured, not manually supplied
9. editorial freshness and search opportunity are visible
10. Growth Brain actions explain why they matter
11. human gates are clearly separated from autonomous work
12. mobile remains usable
13. motion obeys the ToolScout 2.0 motion system
