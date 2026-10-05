# ToolScout 2.0 Homepage — Editorial Pulse

Status: approved design direction, 2026-10-05.

## Purpose

The ToolScout homepage must communicate that What's New is a first-class editorial product, not a static navigation card.

The redesign keeps the approved Brand Book 2.0 principles:

- Noise -> Signal -> Decision
- graphite / carbon / off-white / Signal Lime
- restrained vendor identity
- editorial asymmetry and deliberate negative space
- no marketplace / directory visual language
- no pay-to-rank cues

## Product rule

The What's New area on the homepage MUST be data-driven.

It must read from the existing first-party editorial feed:

`/data/software-updates.json`

Do not duplicate current stories in homepage HTML as a second source of truth.

The component should surface the newest buyer-relevant stories automatically as the editorial dataset changes.

## Component: Software Pulse

Replace a generic static "What's New" card with a compact live editorial module.

### Desktop state

The module should show:

1. `WHAT'S NEW · LIVE` label with a small Signal Lime status dot.
2. Current lead story:
   - vendor/tool identity when available
   - update type
   - published date
   - editorial headline
   - one-line buyer-relevance summary
3. Two quieter secondary headlines from the same feed.
4. Clear `View all What's New ->` action.
5. Optional `Software Trends Index ->` secondary text link.

Vendor logos may appear as identifiers, but must remain subordinate to ToolScout typography and editorial hierarchy.

### Mobile state

Use a vertical feed:

- label
- lead story
- next two headlines
- one `View all What's New ->` action

Do not use a horizontally clipped carousel on mobile.

## Motion and freshness

Dynamic means fresh content, not constant animation.

Default behavior:

- sort by `publishedAt` descending
- render the latest three eligible updates
- update automatically whenever `software-updates.json` changes
- no mandatory auto-rotation
- if a subtle story rotation is added later, it must pause on hover/focus and respect `prefers-reduced-motion`

The page should remain fully useful with JavaScript disabled or when the feed request fails. Use a credible editorial fallback, never a raw `Loading...` state as the only visible content.

## Editorial hierarchy

The lead story should answer:

- What changed?
- Which product changed?
- Why could a software buyer care?

Do not turn the module into a press-release ticker.

ToolScout editorial selection remains based on buyer relevance. Affiliate status must not affect inclusion, order, visual prominence, or wording.

## Visual system

Signal Lime is reserved for:

- live/freshness indicator
- action/focus
- selected state

Do not use Signal Lime as a news-card background.

Vendor colors belong inside logos only. The surrounding surface stays ToolScout.

Suggested hierarchy:

- lead story: 22–26 px
- secondary stories: 14–16 px
- metadata: 10–11 px uppercase / wide tracking
- fine dividers instead of nested cards

## Existing data contract

The current feed already provides:

- `publishedAt`
- `toolSlug`
- `toolName`
- `label`
- `title`
- `summary`
- `articleUrl`
- `sourceName`
- `sourceUrl`
- `profileUrl`

Use those fields before adding another runtime or data source.

## Definition of done

The redesigned homepage is not complete unless:

1. What's New visibly contains current editorial content, not only a static gateway.
2. The component is fed by the canonical software updates dataset.
3. The lead story and secondary headlines change when the feed changes.
4. Loading/failure states preserve editorial quality.
5. Desktop and mobile remain readable without auto-rotation.
6. Vendor identity is visible but never visually dominant over ToolScout.
7. The full What's New surface remains one click away.


## Motion reference

All homepage interactions, recommendation transitions and Software Pulse changes must follow `docs/MOTION-SYSTEM-2.0.md`.
