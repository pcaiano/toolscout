# ToolScout — Product Hunt Launch Plan

## Scheduled launch
- Date: 2026-09-01
- Launch time: 00:00 PT (08:00 Portugal)
- Product URL: https://trytoolscout.org/
- Maker: Pedro Caiano

## Positioning
ToolScout helps people find the right AI and software tool for the job instead of relying on generic popularity rankings.

Core message:
> Find the right AI & software tool for the job.

Supporting idea:
> Start with the job, constraints and workflow. Then find the fit.

## Launch-day objectives
Primary:
1. Real product usage
2. Qualified visits to ToolScout
3. Searches and recommendation interactions
4. Outbound clicks
5. Qualitative feedback

Secondary:
- Product Hunt followers
- Reviews
- Organic mentions
- New referral sources

Do not optimize for upvotes alone.

## Product Hunt launch copy

### Tagline
Find the right AI & software tool for the job

### Description
ToolScout helps you find the right AI and software tools based on what you actually need to accomplish — not generic rankings. Answer a few questions about your job, budget and workflow, and get a practical recommendation from a curated tool catalog.

### First comment
I built ToolScout because choosing software has become surprisingly difficult.

There are thousands of AI and software products, endless comparison lists, sponsored rankings and “best tools” articles — but the most popular tool isn't necessarily the right one for the job.

The idea behind ToolScout is simple: start with what you're actually trying to accomplish, your constraints and your workflow, then narrow the options down to tools that genuinely fit.

This is an early version, and I'm launching it to learn.

If you try it, I'd especially love to know:
- Did the recommendation feel relevant?
- Were the questions useful?
- What kind of tool or workflow should ToolScout support next?

I'd much rather get honest feedback than a polite upvote.

Thanks for taking a look.

## Launch readiness gate
Before launch, verify rather than change unless a failure is found:
- Production homepage is healthy on trytoolscout.org.
- robots.txt and sitemap.xml are reachable and use the canonical public host.
- Core recommendation/search flow is usable.
- Dynamic SEO pages declare trytoolscout.org canonicals.
- Consolidated SEO pages redirect to their canonical targets.
- /go/* affiliate routing returns redirects for enabled affiliate programs.
- Public analytics/owner surfaces remain protected as intended.
- No public URL leaks the legacy workers.dev hostname.
- GitHub Pages and Worker production workflows are green.
- No new feature work is introduced solely for launch day.

If all checks pass, freeze non-essential engineering until initial launch data has been reviewed.

## Launch-day operating sequence
1. Confirm the Product Hunt listing is live at the scheduled time.
2. Confirm the Product Hunt product link reaches trytoolscout.org.
3. Run the production smoke/health validation without changing infrastructure.
4. Publish the prepared first comment on Product Hunt.
5. Share through approved authentic channels; ask for feedback, not votes.
6. Observe Command Center for external sessions, searches, recommendations and outbound clicks.
7. Record qualitative feedback and recurring failure modes separately from feature ideas.
8. Fix only launch-blocking defects immediately; queue non-critical improvements for evidence-based prioritization.

## Launch-day distribution rules
- Share the launch link publicly through authentic channels.
- Ask for feedback, not upvotes.
- Do not use paid upvote services, vote groups, cold-spam or incentives tied to voting.
- Reply to every substantive Product Hunt comment.
- Prioritize users who actually try ToolScout.
- Record referral traffic and compare it with direct/Product Hunt traffic.

## Distribution sequence
1. Product Hunt launch page
2. Personal LinkedIn post
3. X post/thread if available
4. Relevant existing professional network
5. Existing communities where Pedro already participates
6. Software discovery directories after Product Hunt
7. Useful community discussions and content distribution

## Measurement loop
Product Hunt / referral source
→ external session
→ search
→ recommendation
→ outbound click
→ affiliate-covered click

Use Command Center to identify which intents and acquisition sources deserve reinforcement.

## First 24-hour decision rules
Do not judge the launch on Product Hunt rank alone. Evaluate:
- External sessions and identifiable Product Hunt/referral traffic.
- Search/session rate.
- Recommendation interactions.
- Outbound clicks and clicks/session, while separating internal/test traffic where possible.
- Affiliate-covered versus unmonetized outbound clicks.
- Repeated user feedback about recommendation quality or missing workflows.

Prioritize a change immediately only when it is a production defect, blocks the core recommendation flow, breaks attribution, or prevents monetizable outbound routing. Otherwise collect evidence before changing the product.

## Post-launch
Within 24–48 hours:
- Review Product Hunt comments and qualitative feedback.
- Review external sessions and clicks by source.
- Identify the highest-performing intent/page.
- Fix any high-demand monetization gaps.
- Strengthen pages that demonstrate real demand.
- Capture genuine user feedback as future Product Hunt reviews/testimonials where appropriate.
