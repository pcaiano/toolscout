import { automationBoundary } from './affiliate-coverage-engine.js';

const CANDIDATE_PATHS=['/affiliates','/affiliate','/affiliate-program','/partners','/partner-program','/referral','/referrals'];
const BLOCK_PATTERNS=[/captcha/i,/sign[ -]?in/i,/log[ -]?in/i,/create account/i,/terms (?:and|&) conditions/i,/tax/i,/payment/i];
const PROGRAM_PATTERNS=[/affiliate program/i,/partner program/i,/referral program/i,/earn (?:up to|commission)/i,/commission/i];

function safePublicOrigin(url){try{const u=new URL(url);if(u.protocol!=='https:')return null;const h=u.hostname.toLowerCase();if(h==='localhost'||h.endsWith('.local')||/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h))return null;return u.origin;}catch{return null;}}

export function classifyProgramPage({url,status,body=''}){
  if(status<200||status>=400)return {found:false,confidence:0};
  const text=String(body).slice(0,200000);
  const program=PROGRAM_PATTERNS.some(r=>r.test(text));
  if(!program)return {found:false,confidence:0};
  const blocked=BLOCK_PATTERNS.some(r=>r.test(text));
  const network=/partnerstack/i.test(text)?'PartnerStack':/impact\.com|impact radius/i.test(text)?'Impact':/dub\.co|powered by dub/i.test(text)?'Dub':'Direct';
  return {found:true,confidence:blocked?78:88,program_url:url,application_url:url,network,automation_mode:blocked?'human':'research',blocker:blocked?'authentication_terms_or_manual_declaration_detected':null};
}

export async function discoverOfficialProgram(tool,{fetchImpl=fetch,timeoutMs=6000}={}){
  const origin=safePublicOrigin(tool?.sourceUrl||tool?.url||'');
  if(!origin)return {tool_slug:tool?.slug,status:'research_required',found:false,reason:'unsafe_or_missing_official_origin'};
  const evidence=[];
  for(const path of CANDIDATE_PATHS){
    const url=origin+path;
    const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    try{
      const res=await fetchImpl(url,{method:'GET',redirect:'follow',headers:{'User-Agent':'ToolScout-AffiliateCoverageEngine/1.0 (+https://trytoolscout.org)'},signal:ctrl.signal});
      const finalUrl=res.url||url;
      if(!safePublicOrigin(finalUrl))continue;
      const body=await res.text();
      const c=classifyProgramPage({url:finalUrl,status:res.status,body});
      evidence.push({url:finalUrl,status:res.status,matched:c.found});
      if(c.found)return {tool_slug:tool.slug,status:'program_exists',found:true,...c,evidence};
    }catch(e){evidence.push({url,status:0,error:String(e?.name||'fetch_error').slice(0,80)});}finally{clearTimeout(timer);}
  }
  return {tool_slug:tool.slug,status:'research_required',found:false,confidence:20,automation_mode:'research',evidence};
}

export function planCoverageAction(record,discovery){
  if(discovery?.found){
    const enriched={...record,status:'program_exists',network:discovery.network,program_url:discovery.program_url,application_url:discovery.application_url,blocker:discovery.blocker};
    const boundary=automationBoundary(enriched);
    return {...enriched,automation_mode:discovery.automation_mode||boundary.mode,next_action:boundary.mode==='human'?'Human intervention required':'Qualify public programme terms and eligibility'};
  }
  return {...record,automation_mode:'research',next_action:'Continue official programme discovery'};
}
