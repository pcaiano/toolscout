# ToolScout redesign tooling

Status: bootstrap prepared 2026-10-05.

## Purpose

This tooling is for the visual and UX redesign of the existing ToolScout site. It must improve presentation without replacing the current architecture or regressing existing URLs, canonicals, indexation, structured data, editorial content, affiliate routing, analytics, or verified backlinks.

## Selected stack

Project-scoped Codex skills:

1. `design-taste-frontend` for visual direction and anti-generic frontend decisions.
2. `redesign-existing-projects` for an audit-first redesign of an existing site.
3. `image-to-code` for implementing an approved visual reference faithfully.
4. `web-design-guidelines` for accessibility, UX, interaction, and interface-quality review.

Existing project MCP tools remain part of the redesign workflow:

- Context7 for current library and API documentation.
- Chrome DevTools for live browser inspection and desktop/mobile verification.

Figma is optional but recommended for editable design exploration and handoff. It is an account-connected plugin and therefore requires the owner to complete the connection in ChatGPT/Codex.

## Reproducible sources

The bootstrap intentionally pins the upstream skill sources used for this redesign preparation.

- Leonxlnx/taste-skill: `ce26fc25c0e5e8cab638f883de62d9a86ee5e45b`
- vercel-labs/agent-skills: `063bee94c3f4df8453406c830b0a7df0f2860278`
- skills CLI: `1.5.26`

The pinned versions should be reviewed before any future upgrade.

## Install

From the repository root:

```bash
bash scripts/setup-redesign-tooling.sh
```

The skills are installed only for this repository under `.agents/skills/`.

Restart Codex after the first install so project skills are discovered at startup.

## Verify

```bash
node scripts/verify-redesign-tooling.mjs
```

The verification confirms the four project skills and the two existing MCP servers.

## Deliberately not added

Playwright CLI is not added at this stage because ToolScout already has a project-scoped Chrome DevTools MCP and a mandatory browser-verification policy in `AGENTS.md`. Adding a second browser automation layer now would be redundant. Playwright can be added later if screenshot baselines, traces, or repeatable end-to-end tests become useful.

Large design-skill collections are also not installed by default. The redesign should use a small, deliberate set of instructions rather than many competing visual systems.

## Redesign guardrails

Before changing production-facing UI:

1. Capture the current desktop and mobile baseline.
2. Preserve public URL and canonical contracts.
3. Preserve structured data and SEO metadata unless a specific SEO change is approved.
4. Preserve editorial copy and affiliate routing unless a content or commerce change is separately approved.
5. Prefer visual-system changes over framework migration.
6. Verify changed surfaces in desktop and mobile-sized viewports.
7. Do not call the redesign complete from repository state alone. Verify the deployed public experience.
