# ToolScout 2.0 Motion System

Status: approved design direction, 2026-10-05.

## Principle

Every motion must make ToolScout feel faster, clearer or more responsive. Otherwise, remove it.

Motion is not decoration. It is part of the product promise:

Input -> Response -> Resolution

This complements the existing brand behaviours:

Noise -> Signal -> Decision

Evidence -> Interpretation -> Recommendation

## Motion character

ToolScout motion should feel:

- quick
- precise
- quiet
- editorial
- responsive
- intentional

It must not feel:

- playful for its own sake
- cinematic
- bouncy
- gamified
- ornamental
- like an AI landing-page effect

## Global timing tokens

Use a small timing scale.

```css
:root {
  --motion-instant: 90ms;
  --motion-fast: 140ms;
  --motion-base: 180ms;
  --motion-deliberate: 260ms;
  --motion-ease: cubic-bezier(.2,.7,.2,1);
  --motion-ease-out: cubic-bezier(.16,1,.3,1);
}
```

Default interactive feedback should use `--motion-fast` or `--motion-base`.

Do not introduce long transitions unless the transition genuinely carries information between states.

## Navigation

Page and section transitions:

- fade from 0 to 1
- translate Y from 6-12 px to 0
- 140-220 ms
- no full-screen wipes
- no long horizontal slides
- no content that waits for animation before becoming usable

Navigation must feel immediate. The user action should be acknowledged in the same frame or with visible response inside roughly 100 ms.

## Cards and links

Hover and focus:

- border or contrast changes first
- optional translate Y of 1-2 px
- optional scale up to 1.005 for compact controls only
- no bounce
- no large shadow growth
- no 3D tilt

Pressed state:

- 70-100 ms
- translate Y back to 0 or scale to 0.99 where appropriate

Focus state remains visible independently of motion.

## Hero recommendation transition

When the user submits an intent, avoid a generic spinner.

Recommended sequence:

1. Immediate acknowledgement
   - input contracts slightly
   - submit control confirms action
   - 90-140 ms

2. Interpretation
   - surface 2-4 extracted criteria
   - example: `small team · sales pipeline · automation`
   - 140-180 ms

3. Matching
   - criteria settle into a stable line
   - shortlist begins to reveal
   - 180-260 ms

4. Resolution
   - final recommendation cards appear
   - first result slightly precedes the rest
   - total perceived transition should normally stay below ~900 ms if data is already available

Do not fake processing time. If results are ready immediately, finish quickly.

## Scan -> Focus -> Decision pattern

Use motion to embody the ToolScout mark and product logic.

Where several criteria or options are present:

- begin in a neutral state
- identify the criteria that actually differentiate the choice
- reduce emphasis on noise
- increase emphasis on the decisive 2-3 signals
- settle into the final recommendation

The visual change should take 180-320 ms and remain understandable with motion disabled.

## Comparison pages

When a user changes either tool:

- update the two product identities immediately
- crossfade the editorial verdict
- update the evidence table without sliding the whole page
- highlight changed rows for 180-260 ms
- preserve scroll position

Do not animate every cell independently.

## What's New / Software Pulse

Dynamic means fresh content first, motion second.

Default:

- no compulsory auto-rotating carousel
- lead story changes on explicit interaction or content refresh
- crossfade + 6 px vertical movement
- 160-220 ms
- secondary headlines update without large layout shifts

If automatic rotation is ever enabled:

- minimum 7 seconds per story
- pause on hover and keyboard focus
- stop when the tab is hidden
- respect `prefers-reduced-motion`
- never rotate while the user is reading or interacting with the module

## Vendor logos

When logos enter a shortlist or comparison:

- opacity 0 -> 1
- scale 0.97 -> 1
- 140-180 ms
- no spin
- no bounce
- no glow

Logos identify products. ToolScout motion remains the dominant system.

## Expand / collapse

FAQ, evidence, methodology and pricing details:

- use height/clip + opacity
- 160-220 ms
- keep the heading/control anchored
- do not move unrelated page regions more than necessary

## Mobile

Mobile motion is shorter and more direct.

- prefer 120-180 ms
- avoid hover-dependent meaning
- taps receive immediate visual acknowledgement
- sheets and filters may translate 8-16 px plus fade
- avoid horizontal carousels for editorial reading surfaces

## Loading and latency

Use motion to explain real state, never to disguise slowness.

Preferred status language:

- Interpreting your need
- Matching the decision criteria
- Building your shortlist

Avoid:

- Thinking...
- AI magic...
- Long generic spinners

If an operation is likely to exceed one second, keep the interface informative and stable.

## Reduced motion

All non-essential movement must collapse under:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

The interface must preserve state, hierarchy and meaning without animation.

## Performance guardrails

- animate `transform` and `opacity` where possible
- avoid animating layout-heavy properties across large regions
- avoid continuous animation loops
- no video or canvas effects for ordinary UI feedback
- motion must not delay Largest Contentful Paint
- defer non-essential animation until after first render
- keep cumulative layout shift negligible

## Definition of done

A redesigned surface is not motion-complete unless:

1. interaction feedback is visible immediately
2. transitions remain below the timing budget
3. content is usable before animation completes
4. motion clarifies state or hierarchy
5. reduced-motion mode preserves the experience
6. mobile uses shorter timing
7. no decorative continuous motion exists
8. navigation, recommendation, comparison and Software Pulse each have a defined transition state
