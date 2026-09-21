import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const fail=m=>{console.error('FAIL:',m);process.exitCode=1};

const funnel=read('funnel-worker.js');
const catalog=read('catalog-autonomy-worker.js');
const orchestrator=read('distribution-orchestrator-worker.js');
const affiliate=read('affiliate-coverage-cycle-worker.js');
const affiliateEntry=read('affiliate-coverage-entry-worker.js');
const dynamic=read('dynamic-worker.js');
const command=read('growth-command-center-v2-worker.js');
const analytics=read('analytics-v2.html');
const wrangler=read('wrangler.toml');
const seoController=read('scripts/run-organic-growth-controller-v4.mjs');
const seoApply=read('scripts/apply-organic-growth-actions.mjs');
const seoWorkflow=read('.github/workflows/seo-engine-v2.yml');
const seoFetch=read('scripts/fetch-shared-growth-directives.mjs');
const content=read('content-engine-intelligence-worker.js');
const network=read('distribution-network-worker.js');
const contact=read('distribution-contact-worker.js');
const sender=read('distribution-sender-worker.js');
const supervisor=read('growth-supervisor.js');
const distPriority=read('distribution-priority-worker.js');
const seoSupervisorExecutor=read('.github/workflows/growth-brain-seo-executor.yml');
const executionContract=read('growth-execution-contract.js');
const architectureEscalation=read('growth-architecture-escalation.js');
const impact=read('distribution-impact-worker.js');
const visitorAccuracy=read('visitor-accuracy-worker.js');
const trafficIntegrity=read('traffic-integrity-worker.js');
const trafficLive=read('traffic-integrity-live-worker.js');
const trafficGuard=read('traffic-integrity-guard-worker.js');
const funnelModel=read('funnel-model.js');
const rndPolicy=read('data/growth-rnd-policy.json');
const humanGate=read('human-gate-contract.js');
const humanAction=read('human-action-entry-worker.js');
const distributionAuto=read('distribution-autonomous-worker.js');
const discovery=read('distribution-discovery-worker.js');

if(!funnel.includes("import base from './catalog-autonomy-worker.js'"))fail('Catalog Autonomy is not in the live Worker chain.');
if(!orchestrator.includes("'affiliate'")||!orchestrator.includes("'catalog_tool'")||!orchestrator.includes("'catalog_category'"))fail('Shared growth brain is missing Affiliate or Catalog opportunity types.');
if(!affiliate.includes('affiliate_application_packs')||!affiliate.includes('affiliate_route_verification'))fail('Affiliate 2.1 autonomous application/route state is missing.');
if(!dynamic.includes('d1AffiliateRoute')||!dynamic.includes("X-ToolScout-Health-Check"))fail('D1-backed production affiliate route is missing.');
if(!affiliateEntry.includes('/api/affiliate-replies/ingest')||!affiliateEntry.includes('AFFILIATE_REPLY_INGEST_TOKEN_SHA256'))fail('Secure affiliate email reconciliation is missing.');
if(!catalog.includes('catalog_runtime_state')||!catalog.includes('catalog_runtime_candidates')||!catalog.includes('confirmed_broken'))fail('Runtime Catalog Growth/Quality state is missing.');
if(!catalog.includes('rankingEligible:false')||!catalog.includes('comparisonEligible:false'))fail('Runtime catalog admission is not isolated from editorial ranking.');
if(!command.includes('data-widget="catalog-growth"')||!command.includes("version:'2.1'"))fail('Command Center does not expose Catalog Growth and Affiliate 2.1.');
if(!analytics.includes('Application packs')||!analytics.includes('Production verified routes'))fail('Affiliate autonomy metrics are not rendered in the Command Center.');
for(const route of ['/api/growth/*','/api/affiliate-coverage*','/api/affiliate-replies*','/api/catalog-autonomy*'])if(!wrangler.includes(route))fail('Worker routing missing '+route);
if(!supervisor.includes('BACKLINK_BOOTSTRAP_REFERRING_DOMAIN_FLOOR')||!supervisor.includes('backlink_acquisition')||!supervisor.includes('verified_referring_domains'))fail('Growth Brain is not supervising backlink acquisition as a primary SEO authority objective.');
if(!supervisor.includes('BACKLINK_ATTEMPT_MIN_24H=6')||!supervisor.includes('BACKLINK_STAGNATION_HOURS=72')||!supervisor.includes('expand_authority_routes_and_execute')||!supervisor.includes('rotate_authority_channel_mix_and_execute'))fail('Backlink acquisition lacks throughput and stagnation supervision.');
if(!orchestrator.includes('authorityUrgencyBoost')||!orchestrator.includes('backlink_throughput_gap')||!orchestrator.includes('backlink_stagnating'))fail('Growth opportunity priority does not react to authority-loop underperformance.');
if(!distributionAuto.includes('authority_pipeline_replenishment')||!distributionAuto.includes('authorityLoopState')||!distributionAuto.includes('AUTHORITY_RECOVERY_COOLDOWN_HOURS'))fail('Authority acquisition cannot autonomously replenish discovery after throughput gaps.');
if(!sender.includes('authority_handoff_no_output')||!sender.includes('authority_replenishment_scheduled')||!sender.includes('replenishAuthorityPipeline'))fail('No-output sender runs are still silent or do not replenish authority discovery.');
if(!discovery.includes('editorial_resource')||!discovery.includes('partner_resource')||!discovery.includes('community_resource')||!discovery.includes('backlink:94'))fail('Authority discovery is not diversified beyond generic directories.');
if(!orchestrator.includes("'backlink_reference_outreach'")||!orchestrator.includes('backlink_quality_only')||!orchestrator.includes('paid_links_allowed:false'))fail('Growth opportunities do not generate quality backlink outreach actions.');
if(!executionContract.includes("backlink_reference_outreach:'make_sender'")||!executionContract.includes("verify_backlink_acquisition:'distribution_autonomous'"))fail('Backlink acquisition actions are not bound to real executors.');
if(!sender.includes('vendor_reference_v22')||!sender.includes('do not request reciprocal links')||!sender.includes('do not pay for ranking links'))fail('Vendor outreach does not enforce legitimate backlink acquisition policy.');
if(!orchestrator.includes("'news_update'")||!orchestrator.includes('/api/growth/search-directives'))fail("What's New or shared SEO directives are missing from the growth brain.");
if(!catalog.includes('software_news_candidates')||!catalog.includes('software_news_sources'))fail("What's New official-source watcher is missing.");
if(!content.includes("subject_type IN ('tool','news_update')"))fail("Content Engine is not consuming What's New growth opportunities.");
if(!seoFetch.includes('/api/growth/search-directives')||!seoController.includes('shared_growth_directives_required')||!seoApply.includes('organic_growth_actions_not_authorized_by_shared_brain'))fail('SEO execution is not gated by shared-growth-v3 directives.');
if(!seoWorkflow.includes('fetch-shared-growth-directives.mjs'))fail('SEO workflow does not fetch runtime growth directives.');
if(!orchestrator.includes('growth_rnd_experiments')||!orchestrator.includes("mission:'rnd_audit'"))fail('Autonomous Growth R&D audit is missing.');
if(!command.includes('rnd_items:growthRndItems')
  || !command.includes('No action required from you.')
  || !command.includes('rnd_experiment_unbound')
  || !command.includes('rnd_execution_binding_pending')
  || !command.includes('Evidence · hypothesis · action · owner · status · result')
  || !command.includes('contract_bound')
  || !command.includes('source_bound'))fail('Growth R&D Command Center is not execution-aware or owner-clear.');
if(!orchestrator.includes("id:'external-demand-first-v2'")||!orchestrator.includes("strictVerifiedHumanSessions30d:100")||!orchestrator.includes("provenExternalSources:2")||!orchestrator.includes("strictHumansPerProvenSource30d:3")||!orchestrator.includes("externalDemandRemainsPrimary:true"))fail('External-demand-first acquisition policy or its repeatability gate is missing.');

if(!humanGate.includes('human_gate_contract')||!humanGate.includes("status='verification_pending'")||!humanGate.includes("status='resolved'"))fail('Unified Human Gate Contract lifecycle is missing.');
if(!distributionAuto.includes("from './human-gate-contract.js'")||!distributionAuto.includes('openDistributionHumanGate')||!distributionAuto.includes('verifyHumanGateResolutions')||!distributionAuto.includes("status='auth_required',human_required=1"))fail('Distribution Engine is not routing proven human gates through the contract.');
if(!distributionAuto.includes('isMachineOnlyActionUrl')||!distributionAuto.includes('resolveHumanActionUrl')||!distributionAuto.includes("/submit"))fail('Human Gate Contract can still surface machine-only API URLs to the Chairman.');
if(!humanAction.includes('/analytics/api/human-actions/gate')||!humanAction.includes('data-human-gate-done')||!humanAction.includes('auto_resume_queued:true'))fail('Chairman Queue cannot complete a Human Gate Contract and resume autonomous execution.');
if(!network.includes('distribution_contact_route_actions')||!network.includes('materializeRouteActions')||!network.includes('reconcileRouteActions')||!network.includes('closed_loop_routes:true'))fail('Alternate distribution routes are not closed-loop.');
if(!content.includes('Borrowed-audience amplification candidate')||!content.includes('issued_to_content'))fail('Content Engine is not consuming alternate social distribution routes.');
if(!orchestrator.includes('execute_alternate_routes')||!orchestrator.includes('alternate_routes_stalled'))fail('Growth Brain does not consume alternate-route lifecycle state.');
if(!command.includes('Growth Brain verdict')||!command.includes('Growth loop integrity')||!command.includes('orphan_alternate_routes')||!command.includes('stale_growth_actions'))fail('Command Center Growth Brain verdict or closed-loop watchdog is missing.');
if(!command.includes('data-widget="business-pulse"')||!command.includes('Business trajectory')||!command.includes('verified_referring_domains')||!command.includes('authority_throughput_gap')||!command.includes('sender_no_output_24h'))fail('Command Center is not business-first or does not expose authority-loop truth.');
if(!analytics.includes('Show operational detail')||!analytics.includes('data-detail="1"')||!analytics.includes('Business truth first'))fail('Command Center operational detail is not subordinated to the business view.');
if(!orchestrator.includes('recheck_affiliate_program_on_evidence_or_cadence')||!orchestrator.includes("if(!actions.length)actions.push('reconcile_affiliate_state')"))fail('Affiliate opportunities can still become active without a next action.');
if(!orchestrator.includes('refresh_catalog_profile_for_observed_search_demand')||!orchestrator.includes("if(!actions.length)continue;"))fail('Non-actionable catalog rows can still be promoted to active Growth opportunities.');
if(!command.includes('NOT EXISTS (')||!command.includes("c.started_at>f.started_at"))fail('Growth watchdog does not distinguish recovered failures from unresolved failures.');
if(!content.includes("u.searchParams.set('ts_action',\`\${briefId}:\${channel}\`)"))fail('Content Engine action IDs do not match channel-specific growth_action_events.');
if(!impact.includes('maturedBrowserConfirmedSessions')||!impact.includes('legacyChannelId'))fail('Growth effectiveness attribution watchdog or legacy attribution recovery is missing.');
if(!command.includes('growth_actions_no_human_impact')||!command.includes('effectiveness_status'))fail('Growth effectiveness cannot surface silent underperformance.');
for(const [name,source] of [['visitor accuracy',visitorAccuracy],['confirmed visitor',trafficIntegrity],['late visitor retry',trafficLive],['browser guard',trafficGuard]])if(!source.includes("'ts_action','ts_growth','ts_channel'")||!source.includes("join('&'),300"))fail(name+' tracker drops Growth attribution markers.');
if(!funnelModel.includes("{0,299}"))fail('Funnel source validator is too short for Growth attribution markers.');
if(!network.includes("row.opportunity_slug||"))fail('Alternate route backfill can diverge from runtime opportunity IDs.');
if(!network.includes('verified_human_impact')||!network.includes('verified_placement')||network.includes("next='verified_impact'"))fail('Route placement and strict-human impact are not separated.');
if(!command.includes('External executions · 7d')||!command.includes('internal_cycles_7d')||!command.includes("surface_slug<>'indexnow'"))fail('Command Center still counts internal Growth activity as autonomous execution.');
if(!contact.includes('fallback_exhausted')||!contact.includes('COMMON_CONTACT_PATHS'))fail('Vendor contact dead ends are not bounded and closed.');
if(!contact.includes('PUBLIC_HANDOFF_SHA256')||!sender.includes('contact_refresh')||!sender.includes('/api/distribution/vendor-amplification/contact-scan'))fail('External sender does not refresh executable contacts before leasing candidates.');
if(!sender.includes("outreach_sent_at>=datetime('now','-30 days')")||!sender.includes("prior.tool_slug=v.tool_slug")||!sender.includes("prior.contact_email"))fail('Vendor outreach dedupe window is missing.');
if(!orchestrator.includes('vendor_execution_available')||!orchestrator.includes("if(!actions.length)continue;"))fail('Non-executable vendor dead ends can still become active Growth opportunities.');
if(!supervisor.includes("const NORTH_STAR='strict_verified_human_sessions'")||!supervisor.includes("runGrowthSupervisorAudit")||!supervisor.includes("growth_supervisor_state")||!supervisor.includes("correct_all_acquisition_engines"))fail('Growth Brain self-audit supervisor is missing or not human-traffic driven.');
if(!orchestrator.includes("mission:'self_audit'")||!orchestrator.includes("/api/growth/supervisor/public")||!orchestrator.includes("growthSupervisorDirective"))fail('Growth Supervisor is not wired into the runtime Growth Brain.');
if(!distPriority.includes("growth_supervisor_state")||!distPriority.includes("exploration_slots")||!distPriority.includes("priority_boost"))fail('Distribution priorities do not obey Growth Supervisor corrections.');
if(!content.includes("growth_supervisor_state")||!content.includes("supervisorSearchFirst")||!content.includes("Growth Supervisor"))fail('Content Engine does not obey Growth Supervisor acquisition corrections.');
if(!seoSupervisorExecutor.includes("/api/growth/supervisor/public")||!seoSupervisorExecutor.includes("run_executor")||!seoSupervisorExecutor.includes("run-organic-growth-controller-v4.mjs"))fail('SEO does not have a supervisor-controlled autonomous correction executor.');
if(!executionContract.includes('growth_execution_contract')||!executionContract.includes('claimExecutorTasks')||!executionContract.includes('reconcileExecutionContracts')||!executionContract.includes('executor_missing'))fail('Central Growth execution contract is missing.');
if(!executionContract.includes('RECONCILE_ACTIVE_LIMIT=16')||!executionContract.includes('RECONCILE_DEFERRED_PROOF_LIMIT=4')||!executionContract.includes('deferredOffset')||executionContract.includes('LIMIT 160'))fail('Growth execution reconciliation is not bounded and rotating.');
if(!executionContract.includes('seoReport=null')||!executionContract.includes('if(!seoReport)seoReport=await assetJson'))fail('Growth execution reconciliation does not cache shared SEO proof data within a cycle.');
if(!orchestrator.includes('/api/growth/execution/core-recover')||!orchestrator.includes("mode:'protected_core_recovery_v1'"))fail('Protected Growth core recovery handoff is missing.');
if(executionContract.includes("(status='pending' AND claim_deadline"))fail('Queued pending work is still incorrectly treated as an execution failure.');
if(!executionContract.includes("queued_awaiting_executor_capacity")||!executionContract.includes("last_result='claim_sla_missed' AND attempts=0"))fail('Growth execution contract does not recover false queue stalls.');
for(const legacyAction of ['run_catalog_freshness_verification','run_catalog_quality_control','regenerate_verified_profiles'])if(orchestrator.includes(legacyAction))fail('Legacy catalog build action is still emitted by the Growth Brain: '+legacyAction);
if(!orchestrator.includes('catalog-freshness:${slug}:${freshnessEpoch}')||!orchestrator.includes("JSON.stringify(['verify_first_party_sources'])"))fail('Recurring runtime catalog freshness contract is missing or is not routed to the bounded catalog executor.');
if(!executionContract.includes("g.subject_type='search'")||!executionContract.includes("THEN 'seo_github'"))fail('Unmapped search actions are not automatically routed to the SEO executor.');
if(!orchestrator.includes('runGrowthExecutionContractCycle')||!orchestrator.includes("mission:'execution_contract'")||!orchestrator.includes('/api/growth/execution'))fail('Growth execution contracts are not enforced by the runtime loop.');
if(!orchestrator.includes("integrityVersion:'task-specific-bounded-v3'")||!orchestrator.includes('maxInternalLanesPerRun:1')||!orchestrator.includes('externalExecutorsClaimOnly:true'))fail('Growth execution contract is not bounded to one internal lane with external claim-only handoff.');
if(!executionContract.includes("integrityVersion:'task-specific-bounded-v3'")||sender.includes('task-specific-v2')||command.includes("integrity:'task-specific-v2'"))fail('Execution integrity version is inconsistent across runtime surfaces.');
if(orchestrator.includes('const [contacts,network]=await Promise.all'))fail('Growth execution contract still duplicates heavy distribution work inside make_sender preparation.');
{const scheduledCore=orchestrator.lastIndexOf("mission:'execution_contract'");const scheduledBase=orchestrator.lastIndexOf('if(base.scheduled)await base.scheduled(event,env,ctx);');if(scheduledCore<0||scheduledBase<0||scheduledCore>scheduledBase)fail('Growth execution contract still runs after the downstream scheduled chain and can be starved into stale_run_abandoned.');}
if(!supervisor.includes('repair_execution_contract')||!supervisor.includes('missing_executors')||!supervisor.includes("status='stalled'"))fail('Growth Supervisor does not fail on lost or stalled execution contracts.');
if(!architectureEscalation.includes('growth_architecture_incidents')||!architectureEscalation.includes('CODE APPROVAL REQUIRED')||!architectureEscalation.includes('approval_required')||!architectureEscalation.includes('publicEscalationCandidates'))fail('Growth Brain architecture escalation layer is missing.');
if(!orchestrator.includes('/api/growth/architecture-escalations/public-candidates')||!orchestrator.includes('growthEscalationHandoffOk')||!orchestrator.includes('auditArchitectureEscalations'))fail('Growth architecture escalation is not wired into the runtime.');
if(!supervisor.includes('await_code_approval')||!supervisor.includes('growth_architecture_incidents'))fail('Growth Supervisor does not stop and request approval when code or architecture intervention is required.');
{
  const actions=new Set();
  for(const re of [/actions\.push\(([^)]*)\)/g,/actions\.unshift\(([^)]*)\)/g,/const actions=\[([^\]]*)\]/g,/let actions=\[([^\]]*)\]/g]){
    let m;while((m=re.exec(orchestrator)))for(const q of m[1].matchAll(/['"]([^'"]+)['"]/g))actions.add(q[1]);
  }
  const missing=[...actions].filter(action=>!executionContract.includes(action+':'));
  if(missing.length)fail('Growth actions without registered executors: '+missing.join(', '));
}

const rnd=JSON.parse(rndPolicy);if(rnd.mode!=='bounded_autonomy'||!Array.isArray(rnd.hardGates)||!rnd.hardGates.includes('new_paid_spend'))fail('Growth R&D bounded-autonomy guardrails are missing.');

if(!process.exitCode)console.log('PASS: shared autonomous growth brain contract is intact.');
