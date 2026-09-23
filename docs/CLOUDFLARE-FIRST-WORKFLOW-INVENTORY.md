# ToolScout Cloudflare-first workflow inventory

Generated 2026-09-23. GitHub Actions is not a primary recurring executor. Cloudflare Workers, Cron, D1 and Cloudflare Builds own normal runtime and deploy execution. GitHub workflows stay in Conservation Mode unless explicitly used for fallback, CI, diagnostics or manual recovery.

## Summary

Total workflows inventoried: **59**.

- Cloudflare runtime + CI fallback: 5
- Cloudflare runtime: 26
- CI fallback: 3
- CI/manual publication fallback: 2
- Not required for runtime: 1
- Manual diagnostics: 4
- CI/manual recovery: 3
- CI/manual diagnostics: 9
- Setup only: 1
- Cloudflare Builds / fallback: 4
- Manual fallback: 1

## Mapping

| Workflow | Destination | Runtime decision |
|---|---|---|
| `a2a-production-smoke.yml` | Cloudflare runtime + CI fallback | Machine-readable/API/MCP/A2A surfaces are served by Workers; GitHub workflow remains smoke/CI only. |
| `affiliate-coverage-check.yml` | Cloudflare runtime | Affiliate Coverage Engine and workflow state run from Worker/D1; workflow is fallback/CI only. |
| `affiliate-pipeline-sync.yml` | Cloudflare runtime | Affiliate Coverage Engine and workflow state run from Worker/D1; workflow is fallback/CI only. |
| `api-discovery-check.yml` | Cloudflare runtime + CI fallback | Machine-readable/API/MCP/A2A surfaces are served by Workers; GitHub workflow remains smoke/CI only. |
| `api-discovery-production-smoke.yml` | Cloudflare runtime + CI fallback | Machine-readable/API/MCP/A2A surfaces are served by Workers; GitHub workflow remains smoke/CI only. |
| `ard-catalog-check.yml` | CI fallback | ARD public surfaces are Worker/static assets; workflow is validation/registry fallback only. |
| `ard-registry-propagation-check.yml` | CI fallback | ARD public surfaces are Worker/static assets; workflow is validation/registry fallback only. |
| `ard-registry-propagation.yml` | CI/manual publication fallback | Public machine surfaces are Worker-owned; external registry publication remains explicit CI/manual fallback where required by registry mechanics. |
| `audience-learning-export.yml` | Cloudflare runtime | Audience learning/state is persisted in D1 and exposed through Command Center; export workflow is non-critical fallback. |
| `autonomous-distribution-check.yml` | Cloudflare runtime | Distribution, authority, economic learning, network, submission and verification run from Worker/D1; workflow is fallback/CI only. |
| `business-intelligence-export.yml` | Not required for runtime | Live D1/Command Center observability replaces recurring export/snapshot jobs. Keep only for manual archival diagnostics. |
| `catalog-100.yml` | Cloudflare runtime | Catalog autonomy, freshness and quality run from Worker/D1; workflow is fallback/CI only. |
| `catalog-freshness-coverage.yml` | Cloudflare runtime | Catalog autonomy, freshness and quality run from Worker/D1; workflow is fallback/CI only. |
| `catalog-health.yml` | Cloudflare runtime | Catalog autonomy, freshness and quality run from Worker/D1; workflow is fallback/CI only. |
| `cloudflare-access-diagnostic.yml` | Manual diagnostics | Forensics/diagnostics only. No recurring business dependency. |
| `cloudflare-traffic-forensics.yml` | Manual diagnostics | Forensics/diagnostics only. No recurring business dependency. |
| `command-center-smoke.yml` | CI/manual recovery | Command Center runtime and data are Cloudflare-owned; workflows are smoke/recovery only. |
| `commercial-surface-smoke.yml` | CI/manual diagnostics | Operational source of truth lives in Cloudflare/GA4/D1; workflow retained for smoke, audit or manual recovery, never normal scheduling. |
| `configure-cloudflare-access.yml` | Setup only | One-time/manual Cloudflare Access configuration. Not a recurring business executor. |
| `d1-quota-safe-worker-deploy.yml` | Cloudflare Builds / fallback | Normal deploy uses Cloudflare Workers Builds from repository pushes. GitHub Actions is not the recurring deploy executor. |
| `d1-traffic-forensics.yml` | Manual diagnostics | Forensics/diagnostics only. No recurring business dependency. |
| `deploy-social-image-worker.yml` | Cloudflare Builds / fallback | Normal deploy uses Cloudflare Workers Builds from repository pushes. GitHub Actions is not the recurring deploy executor. |
| `deploy-worker.yml` | Cloudflare Builds / fallback | Normal deploy uses Cloudflare Workers Builds from repository pushes. GitHub Actions is not the recurring deploy executor. |
| `distribution-agenttool-live.yml` | Cloudflare runtime | Distribution, authority, economic learning, network, submission and verification run from Worker/D1; workflow is fallback/CI only. |
| `distribution-economic-learning-check.yml` | Cloudflare runtime | Distribution, authority, economic learning, network, submission and verification run from Worker/D1; workflow is fallback/CI only. |
| `distribution-embed-smoke.yml` | Cloudflare runtime | Distribution, authority, economic learning, network, submission and verification run from Worker/D1; workflow is fallback/CI only. |
| `distribution-engine-check.yml` | Cloudflare runtime | Distribution, authority, economic learning, network, submission and verification run from Worker/D1; workflow is fallback/CI only. |
| `distribution-family-learning-check.yml` | Cloudflare runtime | Distribution, authority, economic learning, network, submission and verification run from Worker/D1; workflow is fallback/CI only. |
| `distribution-impact-check.yml` | Cloudflare runtime | Distribution, authority, economic learning, network, submission and verification run from Worker/D1; workflow is fallback/CI only. |
| `distribution-live-smoke.yml` | Cloudflare runtime | Distribution, authority, economic learning, network, submission and verification run from Worker/D1; workflow is fallback/CI only. |
| `distribution-state-snapshot.yml` | Cloudflare runtime | Distribution, authority, economic learning, network, submission and verification run from Worker/D1; workflow is fallback/CI only. |
| `growth-brain-seo-executor.yml` | Cloudflare runtime | SEO/GSC control plane, runtime corrections, D1 state and IndexNow. GitHub workflow retained only as fallback/manual recovery. |
| `growth-command-center-v2-check.yml` | CI/manual recovery | Command Center runtime and data are Cloudflare-owned; workflows are smoke/recovery only. |
| `gsc-growth-bridge.yml` | Cloudflare runtime | SEO/GSC control plane, runtime corrections, D1 state and IndexNow. GitHub workflow retained only as fallback/manual recovery. |
| `gsc-live-forensics.yml` | Manual diagnostics | Forensics/diagnostics only. No recurring business dependency. |
| `gsc-search-reality.yml` | Cloudflare runtime | SEO/GSC control plane, runtime corrections, D1 state and IndexNow. GitHub workflow retained only as fallback/manual recovery. |
| `healthcheck.yml` | CI/manual diagnostics | Operational source of truth lives in Cloudflare/GA4/D1; workflow retained for smoke, audit or manual recovery, never normal scheduling. |
| `human-actions-check.yml` | CI/manual diagnostics | Operational source of truth lives in Cloudflare/GA4/D1; workflow retained for smoke, audit or manual recovery, never normal scheduling. |
| `human-actions-production-smoke.yml` | CI/manual diagnostics | Operational source of truth lives in Cloudflare/GA4/D1; workflow retained for smoke, audit or manual recovery, never normal scheduling. |
| `hypestar-integration-check.yml` | CI/manual diagnostics | Operational source of truth lives in Cloudflare/GA4/D1; workflow retained for smoke, audit or manual recovery, never normal scheduling. |
| `indexnow-recovery-check.yml` | Cloudflare runtime | IndexNow packaging/execution is owned by Cloudflare Submission Engine; workflow is fallback/diagnostic only. |
| `machine-discovery-integration-check.yml` | Cloudflare runtime + CI fallback | Machine-readable/API/MCP/A2A surfaces are served by Workers; GitHub workflow remains smoke/CI only. |
| `manual-distribution-discovery.yml` | Manual fallback | Cloudflare recursive discovery is primary; this workflow is retained only for explicit recovery/manual discovery. |
| `mcp-production-smoke.yml` | Cloudflare runtime + CI fallback | Machine-readable/API/MCP/A2A surfaces are served by Workers; GitHub workflow remains smoke/CI only. |
| `p0-engines-production-cycle-check.yml` | CI fallback | Runtime cycle is Cloudflare-owned; this check is retained only for manual validation. |
| `p0-engines-production-cycle.yml` | Cloudflare runtime | Primary scheduled engine cycle moved to Cloudflare Cron; GitHub workflow is recovery fallback only. |
| `pages.yml` | Cloudflare Builds / fallback | Normal deploy uses Cloudflare Workers Builds from repository pushes. GitHub Actions is not the recurring deploy executor. |
| `production-smoke.yml` | CI/manual diagnostics | Operational source of truth lives in Cloudflare/GA4/D1; workflow retained for smoke, audit or manual recovery, never normal scheduling. |
| `publish-mcp-registry.yml` | CI/manual publication fallback | Public machine surfaces are Worker-owned; external registry publication remains explicit CI/manual fallback where required by registry mechanics. |
| `recursive-discovery-check.yml` | Cloudflare runtime | Recursive distribution discovery runs in the Worker chain; workflow is fallback/CI only. |
| `recursive-discovery-smoke-check.yml` | Cloudflare runtime | Recursive distribution discovery runs in the Worker chain; workflow is fallback/CI only. |
| `recursive-discovery-smoke.yml` | Cloudflare runtime | Recursive distribution discovery runs in the Worker chain; workflow is fallback/CI only. |
| `repair-command-center.yml` | CI/manual recovery | Command Center runtime and data are Cloudflare-owned; workflows are smoke/recovery only. |
| `seo-engine-v2.yml` | Cloudflare runtime | SEO/GSC control plane, runtime corrections, D1 state and IndexNow. GitHub workflow retained only as fallback/manual recovery. |
| `seo-pages.yml` | Cloudflare runtime | SEO/GSC control plane, runtime corrections, D1 state and IndexNow. GitHub workflow retained only as fallback/manual recovery. |
| `smoke-repair.yml` | CI/manual diagnostics | Operational source of truth lives in Cloudflare/GA4/D1; workflow retained for smoke, audit or manual recovery, never normal scheduling. |
| `sync-pending-affiliate-tools.yml` | Cloudflare runtime | Affiliate Coverage Engine and workflow state run from Worker/D1; workflow is fallback/CI only. |
| `tracking-integrity-smoke.yml` | CI/manual diagnostics | Operational source of truth lives in Cloudflare/GA4/D1; workflow retained for smoke, audit or manual recovery, never normal scheduling. |
| `traffic-truth-audit.yml` | CI/manual diagnostics | Operational source of truth lives in Cloudflare/GA4/D1; workflow retained for smoke, audit or manual recovery, never normal scheduling. |

## Guardrails

- Do not restore pre-conservation scheduled GitHub workflows as primary engines.
- Cloudflare Cron is the normal scheduler; D1 is operational state.
- Cloudflare Workers Builds handles normal Worker deployment from repository pushes.
- GitHub Actions may be used only for fallback, CI, smoke testing, diagnostics or explicit manual recovery.
- A fallback run must use the same execution ledger/single-flight rules so it cannot duplicate a healthy Cloudflare execution.
