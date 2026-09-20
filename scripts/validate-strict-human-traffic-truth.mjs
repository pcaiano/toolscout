import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const fail=m=>{console.error('TRAFFIC_TRUTH_CONTRACT_FAIL:',m);process.exitCode=1};

const guard=read('traffic-integrity-guard-worker.js');
const live=read('traffic-integrity-live-worker.js');
const outbound=read('outbound-integrity-worker.js');
const visitors=read('visitor-integrity-worker.js');
const integrity=read('command-center-integrity-worker.js');
const resilient=read('command-center-resilient-worker.js');
const impact=read('distribution-impact-worker.js');
const orchestrator=read('distribution-orchestrator-worker.js');
const light=read('command-center-light-theme-worker.js');
const ui=read('analytics-v2.html');

if(!guard.includes('traffic_human_evidence'))fail('strict human evidence table missing at collection layer');
if(!guard.includes("'trusted_interaction'"))fail('trusted interaction human evidence gate missing');
if(guard.includes("markStrictHuman(env,request,body,'multi_page_navigation'"))fail('multi page navigation can still promote a session to strict human');
if(!guard.includes("ts_internal_check")||!guard.includes("e.isTrusted"))fail('internal-check exclusion or trusted interaction guard missing');
if(!outbound.includes("'verified_outbound_navigation'"))fail('verified outbound does not promote strict human evidence');
if(!live.includes("canonicalPopulation:'traffic_human_evidence'"))fail('live Traffic Truth is not strict-human canonical');
if(!visitors.includes("traffic_human_evidence h")||!visitors.includes('Strict verified unique human visitors'))fail('visitor KPI is not strict-human gated');
if(!integrity.includes("FROM traffic_human_evidence")||integrity.includes("primaryMetric:'Browser Guard sessions"))fail('canonical Command Center still depends on Browser Guard as human truth');
if(!resilient.includes("version:'strict-human-v1'")||!resilient.includes("traffic_human_evidence"))fail('resilient fallback is not strict-human canonical');
if(!impact.includes("JOIN traffic_human_evidence h"))fail('growth attribution can still learn from browser-only sessions');
if(!orchestrator.includes("LEFT JOIN verified_outbound_events c"))fail('affiliate growth priorities are not using verified outbound truth');
if(!light.includes("trafficTruthVersion = 'strict-human-v1'")||!light.includes("browserValidatedIsDiagnosticOnly = true"))fail('public Command Center contract is missing strict-human truth');
if(!ui.includes('Strict human sessions'))fail('UI still presents ambiguous likely-human traffic as business truth');

if(!process.exitCode)console.log('PASS: strict-human-v1 is canonical across collection, dashboard, attribution and growth learning.');
