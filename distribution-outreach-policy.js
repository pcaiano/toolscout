// Outbound partnership/editorial outreach must target complementary publishers and communities,
// not software-discovery businesses that compete directly with ToolScout.
// This policy does NOT block legitimate self-service listing/submission routes on those sites.
export const COMPETITIVE_OUTREACH_POLICY_VERSION='competitive-outreach-v1';

const KNOWN_COMPETITOR_HOSTS=new Set([
  'bestofai.com',
  'bestofai.io',
  'dynamite-ai.com'
]);

const COMPETITIVE_DISCOVERY_TYPE_RE=/(?:^|_)(?:ai|software|tool|app)_?directory(?:_|$)|directory_syndication|discovery_directory|recommendation_directory/i;
const COMPETITIVE_DISCOVERY_NAME_RE=/\b(best of ai|dynamite ai|ai tools? directory|software directory|tool directory|software discovery|ai tool discovery)\b/i;

export function normalizeOutreachHost(value){
  try{
    const raw=String(value||'').trim();
    if(!raw)return '';
    if(raw.includes('://'))return new URL(raw).hostname.toLowerCase().replace(/^www\./,'');
    return raw.toLowerCase().replace(/^www\./,'').split('/')[0];
  }catch{return String(value||'').trim().toLowerCase().replace(/^www\./,'').split('/')[0]}
}

export function competitiveOutreachExclusion({domain='',surface_type='',surfaceType='',surface_name='',surfaceName='',source_url='',action_url=''}={}){
  const host=normalizeOutreachHost(domain||source_url||action_url);
  const type=String(surface_type||surfaceType||'').toLowerCase();
  const name=String(surface_name||surfaceName||'');
  const signal=`${name} ${host}`;

  if(KNOWN_COMPETITOR_HOSTS.has(host)){
    return {excluded:true,reason:'known_competitive_discovery_surface',host,policy:COMPETITIVE_OUTREACH_POLICY_VERSION};
  }
  if(COMPETITIVE_DISCOVERY_TYPE_RE.test(type)){
    return {excluded:true,reason:'competitive_discovery_business_model',host,policy:COMPETITIVE_OUTREACH_POLICY_VERSION};
  }
  if(COMPETITIVE_DISCOVERY_NAME_RE.test(signal)&&!/(publisher|media|journal|community|resource)/i.test(type)){
    return {excluded:true,reason:'competitive_discovery_brand_signal',host,policy:COMPETITIVE_OUTREACH_POLICY_VERSION};
  }
  return {excluded:false,reason:null,host,policy:COMPETITIVE_OUTREACH_POLICY_VERSION};
}

export function isCompetitiveOutreachTarget(row){
  return competitiveOutreachExclusion(row).excluded;
}
