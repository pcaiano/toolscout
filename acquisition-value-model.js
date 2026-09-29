// ToolScout 2.0 external acquisition value model.
//
// This module deliberately separates "can we automate this?" from
// "is this surface worth spending acquisition capacity on?".
// Automation potential is diagnostic only and does not increase external value.

export const ACQUISITION_VALUE_MODEL_VERSION=2;
export const MIN_EXTERNAL_VALUE_FOR_RESEARCH=45;
export const HIGH_EXTERNAL_VALUE=70;

const PROTECTED_STATES=new Set(['live','verified','submitted','pending_review','scheduled']);

const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v)||0));
const n=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;

export function protectedDistributionState(row){
  return PROTECTED_STATES.has(String(row?.status||''))||Boolean(row?.live_url);
}

export function strictHumanSessions(row){
  return Math.max(0,n(row?.browser_confirmed_sessions_30d,n(row?.human_sessions_30d,0)));
}

function surfaceTypeAdjustment(surfaceType){
  const value=String(surfaceType||'').toLowerCase();
  if(/publisher|editorial|media|newsletter|community|press/.test(value))return 10;
  if(/vendor|partner|integration/.test(value))return 6;
  if(/directory|listing|registry|catalog/.test(value))return -6;
  if(/mcp|agent/.test(value))return -4;
  return 0;
}

export function expectedHumanValue(row){
  const audience=clamp(row?.audience_fit);
  const authority=clamp(row?.authority);
  const traffic=clamp(row?.traffic_potential);
  const backlink=clamp(row?.backlink_value);
  const acceptance=clamp(row?.acceptance_probability);
  const effort=clamp(row?.effort_cost);

  // External value is driven by audience, authority and referral potential.
  // Ease of automation is intentionally absent from the positive terms.
  const structural=
    audience*0.27+
    authority*0.23+
    traffic*0.25+
    backlink*0.15+
    acceptance*0.10;

  const humans=strictHumanSessions(row);
  const outbound=Math.max(0,n(row?.outbound_clicks_30d));
  const monetized=Math.max(0,n(row?.monetized_outbound_30d));
  const revenue=Math.max(0,n(row?.confirmed_revenue_30d));

  // Real external outcomes override heuristics quickly.
  const proofBoost=
    Math.min(25,humans*8)+
    Math.min(10,outbound*1.5)+
    Math.min(15,monetized*4)+
    (revenue>0?20:0);

  const typeAdjustment=surfaceTypeAdjustment(row?.surface_type);
  const effortPenalty=Math.min(12,effort*0.12);
  const score=Number(clamp(structural+proofBoost+typeAdjustment-effortPenalty).toFixed(2));
  const tier=score>=HIGH_EXTERNAL_VALUE?'high':score>=MIN_EXTERNAL_VALUE_FOR_RESEARCH?'medium':'low';

  const reasons=[];
  if(humans>0)reasons.push(`${humans} verified human session(s)`);
  if(monetized>0)reasons.push(`${monetized} monetized outbound`);
  if(revenue>0)reasons.push('confirmed revenue');
  if(authority>=70)reasons.push('high authority');
  if(traffic>=70)reasons.push('high traffic potential');
  if(audience>=70)reasons.push('strong audience fit');
  if(typeAdjustment>0)reasons.push('editorial/vendor audience surface');
  if(typeAdjustment<0)reasons.push('commodity directory/registry discount');
  if(!reasons.length)reasons.push('heuristic value only');

  return{
    score,
    tier,
    researchEligible:score>=MIN_EXTERNAL_VALUE_FOR_RESEARCH,
    protected:protectedDistributionState(row),
    reason:reasons.join('; '),
    modelVersion:ACQUISITION_VALUE_MODEL_VERSION,
    components:{audience,authority,traffic,backlink,acceptance,effort,humans,outbound,monetized,revenue,typeAdjustment}
  };
}

export function shouldSpendExternalResearch(row){
  const value=expectedHumanValue(row);
  // Never undo or invalidate already-live/verified/submitted outcomes.
  if(value.protected)return{...value,allowed:true,preservationOverride:true};
  return{...value,allowed:value.researchEligible,preservationOverride:false};
}
