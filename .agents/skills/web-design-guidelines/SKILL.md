---
name: web-design-guidelines
description: Audit ToolScout UI changes against current Vercel Web Interface Guidelines, with emphasis on accessibility, interaction quality, responsive behavior, performance, and clear navigation.
---

# Web Design Guidelines Review

Use this skill for a final review of user-facing ToolScout HTML, CSS, and JavaScript.

1. Fetch the current Vercel Web Interface Guidelines from:
   https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
2. Review only the files and surfaces relevant to the redesign task.
3. Report concrete findings with file paths and the smallest useful line range when available.
4. Prioritize:
   - accessibility and semantic HTML;
   - visible focus and keyboard behavior;
   - touch and mobile interaction;
   - forms and error states;
   - responsive layout;
   - animation and reduced-motion handling;
   - image sizing and loading;
   - navigation state and deep links;
   - performance problems that affect the user experience.
5. Preserve ToolScout's existing URL, canonical, structured-data, analytics, affiliate-routing, and editorial contracts.
6. Treat the current live site and repository contracts as constraints. Do not recommend a framework migration merely to satisfy a stylistic preference.
7. After fixes, use the project Chrome DevTools MCP to verify the changed surface in desktop and mobile-sized viewports, including console and network errors.
