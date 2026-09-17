import fs from 'node:fs';

const policy=JSON.parse(fs.readFileSync('data/growth-spend-policy.json','utf8'));
const workflow=JSON.parse(fs.readFileSync('data/distribution-workflow.json','utf8'));
const errors=[];

if(policy.mode!=='free_by_default')errors.push('Growth spend policy must remain free_by_default.');
if(policy.globalPaidAcquisitionAllowed!==false)errors.push('Global paid acquisition must remain disabled by default.');
for(const key of ['requireConfirmedVendorRevenue','requireMeasuredEarningsPerMonetizedClick','requireMeasuredRevenuePerHumanSession','requireExpectedValueAboveCost','requireExplicitOwnerApproval']){
  if(policy.unitEconomicsGate?.[key]!==true)errors.push(`Unit economics gate missing ${key}.`);
}
if(policy.unitEconomicsGate?.defaultDecisionWhenEvidenceMissing!=='decline_or_hold')errors.push('Missing evidence must default to decline_or_hold.');

const historical=new Set((policy.historicalExperiments||[]).map(x=>String(x.slug||'')));
const paidSignal=/\b(paid|\$\s*\d|€\s*\d|£\s*\d|premium|fast[- ]?track|priority\+?|featured|backlink upgrade|quick review)\b/i;
const allowedState=/declin|skip|hold|unavailable|free route|free submission|free listing|free account|eligible_free|pending_review|scheduled|live|human_action_required|research_required/i;
const violations=[];
for(const item of workflow.items||[]){
  const text=[item.cost,item.next_action,item.notes,item.blocker,item.free_paid_status,item.status].filter(Boolean).join(' ');
  if(!paidSignal.test(text))continue;
  if(historical.has(String(item.slug||'')))continue;
  if(allowedState.test(text)&&!/\b(buy|purchase|pay now|paid selected|execute paid|upgrade approved)\b/i.test(text))continue;
  violations.push({slug:item.slug||null,status:item.status||null,cost:item.cost||null,reason:'Paid distribution appears executable without a whitelisted historical experiment and a fresh unit economics decision.'});
}
if(violations.length)errors.push(...violations.map(x=>`${x.slug}: ${x.reason}`));

const result={ok:errors.length===0,checkedAt:new Date().toISOString(),mode:policy.mode,historicalExperiments:[...historical],distributionItems:(workflow.items||[]).length,violations,errors};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exit(1);
