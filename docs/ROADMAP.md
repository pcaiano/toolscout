# ToolScout — execution roadmap

## North star
Build an automated recommendation engine that helps users choose AI/software tools and monetizes high-intent outbound clicks through legitimate affiliate relationships.

## Stage 1 — Foundation
- [x] Curated tool database
- [x] Deterministic matching/scoring
- [x] Tools directory
- [x] Side-by-side comparison
- [x] Sitemap
- [x] Affiliate-ready outbound links
- [x] Click event tracking
- [x] Intent-specific scoring profiles
- [x] First-class session schema prepared (`sessions` migration; activation follows the next Worker rollout)

## Stage 2 — Search demand
Prioritize useful, high-intent pages rather than mass-generated pages:
- [x] Best CRM for small business
- [x] Best free CRM
- [x] Best AI marketing tools
- [x] Best SEO tools
- [x] Best tools for agencies

Every page must contain original comparison logic, useful filters, transparent criteria, and links to primary sources.

## Stage 3 — Automation
- [x] Scheduled source checks / maintenance framework
- [ ] Detect pricing/feature changes
- [ ] Flag records requiring manual verification
- [x] Generate/update only pages whose underlying data changed
- [x] Keep an audit trail with verification dates

## Stage 4 — Monetization
- [x] Apply to selected official affiliate programs
- [x] Store affiliate URLs only after approval
- [x] Track outbound clicks by tool and intent
- [x] Clearly disclose affiliate relationships
- [ ] Measure click-through rate and revenue per visitor with reliable external session data
- [ ] Connect vendor-side conversions/commission data where programmes expose it

## Stage 5 — Growth loop
Visitor -> intent -> recommendation -> outbound click -> affiliate conversion -> identify winning intent -> improve scoring/page -> attract more qualified traffic.

### Current operating priority
1. Activate first-class session tracking in production.
2. Connect Google Analytics 4 and Google Search Console.
3. Expand affiliate coverage where observed demand/clicks already exist.
4. Use Opportunity Matrix rankings to drive SEO and distribution.
5. Reach first 100 external sessions, 100 external clicks, 10 monetized clicks, and first commission.

## €0 rule
No paid domain, hosting, ads, paid AI API, or premium SaaS until the project demonstrates demand or generates revenue. Free infrastructure is acceptable only within published provider limits.
