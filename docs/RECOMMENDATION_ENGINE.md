# ToolScout Recommendation Engine

## Goal

Turn a natural-language need into an intent-aware ranking of tools without requiring a paid AI API.

## Pipeline

1. Normalize the query.
2. Detect one or more intent profiles using keyword signals.
3. Build a set of weighted criteria from the detected intent.
4. Score each tool against the criteria.
5. Apply a small confidence adjustment for free-plan and category matches.
6. Return the top three matches with an explanation of why each matched.
7. Record an anonymous outbound-click event when the user chooses a tool.

## Principles

- Commission must never be a ranking criterion.
- Missing data is neutral, not negative.
- Recommendations should be explainable.
- The system must work without an LLM.
- A future LLM can improve intent extraction, but the scoring layer remains deterministic and auditable.

## Intent examples

### Best Free CRM
- category match: high
- free plan: very high
- price: high
- ease of use: medium

### CRM for Small Business
- category match: high
- simplicity: high
- price: high
- automation: medium

### Tools for Agencies
- agency suitability: high
- automation: high
- integrations: high
- collaboration: medium

## Future signals

The next version can add structured answers from the user (budget, team size, required integrations, experience level) so the engine does not rely only on text matching.
