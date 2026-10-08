# ToolScout Decision Engine: evidence and editorial quality contract

Status: incremental quality standard, 2026-10-08. This document does not change public URLs, the Finder UI, the monetization ledger, or existing SEO metadata.

## Decision principles

1. **Job before score.** Qualify the actual software category and the task before using feature scores. A high score for generic automation must not cause a CRM to appear as an SEO recommendation.
2. **Must-haves are hard requirements.** Only explicitly declared categories/features or sourced, verified product-to-product integration pairs count as satisfied. Unverified requirements are not silently treated as present. Comparisons of explicitly named products may still report unknown requirements.
3. **Unknown is not zero.** Null/missing scoring data is not a negative grade; it is unverified.
4. **Integration fit is pair-specific.** A general integration score, the word "integrations", or a substring of a product name never proves a connection to the user's stack.
5. **Free-plan availability requires verification.** `freePlanKnown: true` together with `freePlan` is distinguishable from a catalogue guess. Unknown free-plan status must not be labelled as verified.
6. **Independence.** Affiliate payouts, redirects, referral status, and monetization coverage never affect shortlist order or verdicts.
7. **Traceability.** Product facts and editorial claims require dated source evidence. If there is no basis to decide, explain what's missing rather than synthesize confidence.
8. **Backwards compatibility.** The MCP/A2A decision interfaces add evidence fields without renaming canonical profile URLs or introducing a new, conflicting ranking engine.

## Verified product-specific integration format

In `data/tools.json` a product may optionally carry sourced evidence. The status `verified` is usable in decisions only with an exact product name, an HTTPS source and a verification date:

```json
{
  "integrations": [
    {
      "product": "Example App",
      "status": "verified",
      "sourceUrl": "https://vendor.example/docs/integration",
      "verifiedAt": "2026-10-08"
    }
  ]
}
```

This is a **schema example**, not evidence that any live vendor supports this integration. Unsourced or absent records are treated as unknown, never as positive compatibility.

## Editorial review fields for future enrichment

A complete decision-grade record should eventually include:

- A short independent analysis: **best for**, **not for**, strengths, limitations and opportunity costs.
- Pricing tier details, limits and a dated first-party pricing source, with unknowns identified.
- Functional capabilities and verified integration pairs, each with source and date.
- Provenance for every scored dimension; clear distinction between empirical test results, product documentation, and ToolScout editorial judgement.
- Dated changes that can alter a purchasing decision.
- Specific, differentiated comparisons and guides; avoid boilerplate verdicts.
- Category, job, team and budget fit signals that can be explained to both a human and an agent.

Avoid bulk-populating evidence fields with generic AI-generated assertions to increase completeness. If facts have not been verified, leave them unverified.

## Quality gates and rollout

**Gate A: catalog validity.** `python3 scripts/audit_decision_quality.py --json` produces aggregate coverage metrics and per-product missing-field assessments, without changing production.

**Gate B: decision relevance.** Run the Node protocol tests, including category isolation, null-score handling, strict must-haves, free-plan verification, named integration evidence and affiliate neutrality.

**Gate C: editorial proof.** Review a first cohort of 10 high-demand tool profiles and their comparisons for unique analysis, dated sources and non-invented claims before expanding to the full catalog.

**Gate D: deployment verification.** Preserve all existing profile URLs, canonicals, structured data, sitemap entries and affiliate redirect behavior. Test MCP/A2A outputs on staging before merging, then verify the deployed version and monitor errors.

Only after these gates should catalog coverage expand from 127 towards 250, 500 and 1,000+ products. Inclusion in the catalog does not imply automatic ranking eligibility or affiliate coverage.

## Key measurements

- **Data:** percent of records with verifiable price, feature, integration and editorial evidence; stale verification dates; missing decision fields.
- **Recommendation:** mandatory-requirement violations (target zero), irrelevant category leakage (target zero), confidence calibration, sample-based decision quality.
- **Editorial:** source freshness, text uniqueness, usefulness of trade-offs, accuracy of prices and plans.
- **Distribution:** qualified MCP calls, agent referrals, verified strict-human sessions and actual monetized outbound/conversion, kept separate.
