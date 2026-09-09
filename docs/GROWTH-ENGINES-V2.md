# ToolScout Growth Engines 2.0

## Objective

Distribution Engine 2.0, Affiliate Coverage Engine 2.0 and the Growth Command Center are the current highest-priority ToolScout operating system.

The economic loop is:

`qualified human traffic -> useful engagement -> monetized outbound -> confirmed revenue`

New nonessential product features should not outrank work that materially improves this loop.

## Closed-loop contract

An engine is operationally autonomous only when it can:

`observe/discover -> prioritize -> execute -> verify -> measure -> learn -> repeat`

A human dependency is an exception, not a normal workflow state.

### Human Gate contract

A Human Gate may enter the Chairman Queue only when all of the following are true:

1. the canonical engine state says human action is currently required;
2. the action is concrete and can be performed now;
3. a direct HTTPS action URL exists and is reachable;
4. the queue states why a human is required;
5. expected impact is exposed;
6. expected human time is exposed;
7. the next machine action is defined.

Resolved, submitted, pending, rejected, skipped, live, verified and otherwise stale states must not remain in the queue. A policy limitation or missing automation capability is an engine problem, not automatically a Chairman task.

The Chairman Queue is a live view of canonical engine state. It is not a parallel task database.

## Distribution Engine 2.0

Primary outcome: incremental likely-human sessions that lead to downstream commercial activity.

Measure:

- engine actions attempted and completed;
- failures, with no silent failure;
- submitted, pending, live and verified surfaces;
- attributed likely-human sessions;
- attributed human outbound;
- attributed monetized outbound;
- confirmed revenue when evidence exists;
- delivery and public-verification lifecycle.

A human-confirmed submission removes the current Human Gate and moves the surface back into engine-owned monitoring. Automatic public verification is expected where a machine-verifiable route exists; otherwise the state must remain explicit rather than being called live.

## Affiliate Coverage Engine 2.0

Primary outcome: monetize observed ToolScout demand, not raw catalog count.

Prioritize by recoverable commercial leakage and human effort. Weighted monetization coverage is the primary coverage metric.

Lifecycle:

`observe demand -> identify leakage -> discover official programme -> qualify -> apply/human gate -> monitor decision -> obtain referral URL -> activate -> production verify -> measure clicks/revenue`

Approval alone is not active coverage. A programme is operationally complete only when its referral route is enabled and verified in production.

## Growth Command Center 2.0

The Command Center is an operational surface, not an activity dashboard.

Required blocks:

- Chairman Queue;
- North Star economic funnel;
- Distribution Engine scorecard;
- Affiliate Coverage Engine scorecard;
- ToolScout Footprint;
- Growth Ledger;
- Revenue & Coverage;
- Engine & Data Health.

Every block is clickable for drill-down, draggable/reorderable and resizable. Owner-selected order and size persist locally between sessions.

The Command Center uses manual refresh and no background polling. It should not create unnecessary D1 read load while left open.

### ToolScout Footprint

Footprint separates states rather than collapsing them:

`discovered -> attempted/submitted -> pending -> live/verified -> traffic observed -> conversion/revenue observed`

Search Console pages with impressions are evidence of Google search visibility. They must not be described as a complete Google index count unless a separate authoritative index-count source exists.

### Growth Ledger

The Growth Ledger merges evidence-backed engine activity and state transitions so productivity can be audited. It should answer:

- what did each engine do?
- what succeeded or failed?
- what became live/verified?
- what human traffic/outbound/revenue followed?

## Failure policy

No silent failures.

Examples that are bugs or engine-health events:

- an expected run did not execute;
- a human action link is unreachable;
- a completed/stale task remains in the Chairman Queue;
- a surface is called live without verification evidence;
- a human dependency exists but is not surfaced as a valid Human Gate;
- an engine claims to resume a downstream step it cannot actually observe or verify.

## Current implementation

Development branch: `growth-engines-v2-command-center`.

The V2 implementation deliberately reuses the existing canonical Affiliate and Distribution state machines and D1 evidence. It does not create a second task store or a parallel interpretation of operational truth.
