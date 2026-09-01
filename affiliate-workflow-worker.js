import base from './revenue-worker.js';

const OWNER_EMAIL='pcaiano@gmail.com';
const ALLOWED_STATUSES=new Set(['active','approved_needs_link','submitted','appeal_pending','needs_info','ready_to_apply','program_exists','research_required','paused','rejected','no_program']);

async function isOwner(request,ctx){
  const email=request.headers.get('Cf-Access-Authenticated-User-Email')||request.headers.get('cf-access-authenticated-user-email')||'';
  if(email.toLowerCase()===OWNER_EMAIL)return true;
  try{if(!ctx?.access)return false;const identity=await ctx.access.getIdentity();return String(identity?.email||'').toLowerCase()===OWNER_EMAIL;}catch{return false;}
}
async function assetJson(request,env,path,fallback){try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback;}catch{return fallback;}}
function pipelineStatus(value){if(value==='active')return 'active';if(value==='submitted')return 'submitted';if(value==='appeal_pending')return 'appeal_pending';if(value==='ready_to_apply')return 'ready_to_apply';if(value==='program_exists')return 'program_exists';if(value==='paused_for_new_affiliates')return 'paused';if(value==='no_affiliate_program')return 'no_program';return 'research_required';}
async function workflowSnapshot(request,env){
  const [tools,pipeline,affiliate,rows]=await Promise.all([
    assetJson(request,env,'/data/tools.json',[]),
    assetJson(request,env,'/data/affiliate-pipeline.json',{verified_programs:[]}),
    assetJson(request,env,'/data/affiliate.json',{}),
    env.DB.prepare('SELECT tool_slug,status,submitted_at,response_at,affiliate_url,notes,updated_at FROM affiliate_workflow').all()
  ]);
  const pmap=new Map((pipeline.verified_programs||[]).map(x=>[x.slug,x]));
  const smap=new Map((rows.results||[]).map(x=>[x.tool_slug,x]));
  const items=tools.map(t=>{
    const p=pmap.get(t.slug)||null,a=affiliate[t.slug]||{},s=smap.get(t.slug)||null;
    const active=Boolean(a.enabled&&a.url);
    const status=s?.status||(active?'active':p?pipelineStatus(p.status):'research_required');
    return {slug:t.slug,name:t.name,category:t.category,status,program_url:p?.source||null,application_url:p?.application_url||p?.source||null,commission:p?.commission_note||(t.commission!=='Pending verification'?t.commission:null),requirements:Array.isArray(p?.requirements)?p.requirements:[],form_guidance:p?.form_guidance||null,next_action:p?.next_action||null,affiliate_url:s?.affiliate_url||(active?a.url:null),submitted_at:s?.submitted_at||null,response_at:s?.response_at||null,notes:s?.notes||null,updated_at:s?.updated_at||p?.last_verified||t.lastVerified||null};
  });
  return {tools:items,networkConstraints:pipeline.network_constraints||[],externalPrograms:pipeline.external_programs_not_in_catalog||[],applicationPack:{applicant:'Pedro Caiano',website:'https://trytoolscout.org',project:'ToolScout — an independent software discovery and recommendation platform.',promotion_method:'Editorial recommendations, intent-based software comparisons, SEO landing pages and contextual links inside ToolScout. Affiliate relationships never influence recommendation ranking.',audience:'Small businesses, consultants, agencies, creators, sales and marketing teams, and software buyers researching tools for specific workflows.',why_join:'ToolScout helps high-intent software buyers narrow a large market to a small set of relevant tools. I want to monetize qualified outbound referrals while keeping recommendations independent and transparent.',traffic_note:'Early-stage product. Traffic is growing through organic search, launch platforms, evergreen directories and direct discovery. I do not claim unsupported traffic volumes.',disclosure:'Affiliate relationships are disclosed publicly and do not alter ToolScout recommendation scores.'}};
}
async function updateWorkflow(request,env,slug){
  let body={};try{body=await request.json();}catch{return Response.json({error:'invalid_json'},{status:400});}
  const status=body.status&&ALLOWED_STATUSES.has(String(body.status))?String(body.status):null;
  const notes=body.notes===undefined?null:String(body.notes).slice(0,4000);
  const affiliateUrl=body.affiliate_url===undefined?null:String(body.affiliate_url).slice(0,2000);
  if(!status&&notes===null&&affiliateUrl===null)return Response.json({error:'no_valid_fields'},{status:400});
  const existing=await env.DB.prepare('SELECT status,submitted_at,response_at,affiliate_url,notes FROM affiliate_workflow WHERE tool_slug=?').bind(slug).first();
  const nextStatus=status||existing?.status||'research_required';
  const submittedAt=['submitted','appeal_pending'].includes(nextStatus)&&!existing?.submitted_at?new Date().toISOString():existing?.submitted_at||null;
  const responseAt=['approved_needs_link','active','rejected','needs_info'].includes(nextStatus)&&!existing?.response_at?new Date().toISOString():existing?.response_at||null;
  await env.DB.prepare(`INSERT INTO affiliate_workflow(tool_slug,status,submitted_at,response_at,affiliate_url,notes,updated_at) VALUES(?,?,?,?,?,?,datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status=excluded.status,submitted_at=excluded.submitted_at,response_at=excluded.response_at,affiliate_url=excluded.affiliate_url,notes=excluded.notes,updated_at=datetime('now')`).bind(slug,nextStatus,submittedAt,responseAt,affiliateUrl??existing?.affiliate_url??null,notes??existing?.notes??null).run();
  return Response.json({ok:true,tool_slug:slug,status:nextStatus});
}
export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  const privateRoute=url.pathname==='/affiliate-workflow.html'||url.pathname==='/affiliate-workflow'||url.pathname==='/api/affiliate-workflow'||url.pathname.startsWith('/api/affiliate-workflow/');
  if(privateRoute){
    if(!(await isOwner(request,ctx)))return new Response(url.pathname.startsWith('/api/')?JSON.stringify({error:'unauthorized'}):'Private access required',{status:401,headers:{'Content-Type':url.pathname.startsWith('/api/')?'application/json':'text/plain','Cache-Control':'no-store'}});
    if((url.pathname==='/affiliate-workflow.html'||url.pathname==='/affiliate-workflow')&&request.method==='GET')return env.ASSETS.fetch(new Request(new URL('/affiliate-workflow.html',request.url)));
    if(url.pathname==='/api/affiliate-workflow'&&request.method==='GET')return Response.json(await workflowSnapshot(request,env),{headers:{'Cache-Control':'private, no-store'}});
    if(url.pathname.startsWith('/api/affiliate-workflow/')&&request.method==='POST'){const slug=url.pathname.slice('/api/affiliate-workflow/'.length).toLowerCase().replace(/[^a-z0-9-]/g,'');if(!slug)return Response.json({error:'invalid_slug'},{status:400});return updateWorkflow(request,env,slug);}
    return new Response('Method not allowed',{status:405});
  }
  return base.fetch(request,env,ctx);
},async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx);}};
