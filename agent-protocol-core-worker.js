import base from './content-engine-intelligence-worker.js';

const PROTOCOL_VERSION='2026-07-28';
const A2A_VERSION='1.0';
const SERVER_INFO={name:'ToolScout: Software Decision Engine',version:'2.0.0',websiteUrl:'https://trytoolscout.org/'};
const SERVER_META_KEY='io.modelcontextprotocol/serverInfo';
const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name','Access-Control-Allow-Methods':'POST, OPTIONS'};
const A2A_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Accept, A2A-Version','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};

function rpc(id,result,status=200){
  const body={jsonrpc:'2.0',id,result:{...result,_meta:{...(result?._meta||{}),[SERVER_META_KEY]:SERVER_INFO}}};
  return Response.json(body,{status,headers:JSON_HEADERS});
}
function rpcError(id,code,message,data,status=400){
  return Response.json({jsonrpc:'2.0',id:id??null,error:{code,message,...(data===undefined?{}:{data})}},{status,headers:JSON_HEADERS});
}
function a2aError(id,code,message,reason,status=400){
  const data=reason?[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason,domain:'trytoolscout.org'}]:undefined;
  return Response.json({jsonrpc:'2.0',id:id??null,error:{code,message,...(data?{data}:{})}},{status,headers:A2A_HEADERS});
}
function header(request,name){return request.headers.get(name)||''}
function requestMeta(body){return body?.params?._meta||{} }
function cleanMetric(v,n=120){return v==null?null:String(v).replace(/[^A-Za-z0-9._:/ -]/g,'').slice(0,n)||null}
async function logProtocol(env,protocol,operation,{clientName=null,clientVersion=null,success=true,resultCount=null}={}){
  try{await env.DB.prepare(`INSERT INTO agent_protocol_events(event_id,protocol,operation,client_name,client_version,success,result_count,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`).bind(`ape_${crypto.randomUUID()}`,protocol,cleanMetric(operation,80),cleanMetric(clientName),cleanMetric(clientVersion,60),success?1:0,Number.isFinite(resultCount)?resultCount:null).run();}catch{}
}
function validateEnvelope(request,body){
  const version=header(request,'MCP-Protocol-Version');
  const method=header(request,'Mcp-Method');
  const name=header(request,'Mcp-Name');
  const meta=requestMeta(body);
  const bodyVersion=meta['io.modelcontextprotocol/protocolVersion'];
  if(version!==PROTOCOL_VERSION||bodyVersion!==PROTOCOL_VERSION)return {code:-32021,message:'Unsupported protocol version',data:{supported:[PROTOCOL_VERSION]}};
  if(!method||method!==body?.method)return {code:-32020,message:'HeaderMismatch',data:{header:'Mcp-Method',expected:body?.method||null,received:method||null}};
  const principal=body?.method==='tools/call'?String(body?.params?.name||''):'';
  if(principal&&name!==principal)return {code:-32020,message:'HeaderMismatch',data:{header:'Mcp-Name',expected:principal,received:name||null}};
  if(!principal&&name)return {code:-32020,message:'HeaderMismatch',data:{header:'Mcp-Name',expected:null,received:name}};
  return null;
}
function toolDefinitions(){
  const readOnly={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
  return [
    {
      name:'decide_software',
      title:'Decide which software fits',
      description:'Primary ToolScout decision tool. Turn a job, constraints, priorities, budget, team, must-haves, exclusions and existing stack into an evidence-aware shortlist with reasons, trade-offs and uncertainty. Use this instead of catalog search when the user is choosing software.',
      inputSchema:{
        type:'object',additionalProperties:false,required:['job'],
        properties:{
          job:{type:'string',minLength:3,maxLength:500,description:'The concrete job, workflow or outcome the software must support.'},
          constraints:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:160}},
          must_have:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}},
          avoid:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}},
          budget:{type:'string',enum:['free','low','mid','high']},
          team:{type:'string',enum:['solo','small','team','large','agency']},
          priorities:{type:'array',maxItems:6,uniqueItems:true,items:{type:'string',enum:['price','ease','automation','integrations','sales','ai','marketing','seo','research','content','agency']}},
          existing_tools:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}},
          limit:{type:'integer',minimum:2,maximum:5,default:3}
        }
      },
      outputSchema:{type:'object',required:['job','shortlist','decision_basis','affiliate_disclosure'],properties:{job:{type:'string'},shortlist:{type:'array',items:{type:'object'}},decision_basis:{type:'object'},affiliate_disclosure:{type:'string'}}},
      annotations:readOnly
    },
    {
      name:'compare_for_use_case',
      title:'Compare software for a specific use case',
      description:'Compare two to four products for the user\'s actual use case and priorities. Explain advantages, trade-offs, close calls, uncertainty, and what the affordability-leading option may give up.',
      inputSchema:{
        type:'object',additionalProperties:false,required:['tools','use_case'],
        properties:{
          tools:{type:'array',minItems:2,maxItems:4,uniqueItems:true,items:{type:'string',minLength:1,maxLength:120}},
          use_case:{type:'string',minLength:3,maxLength:500},
          must_have:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}},
          budget:{type:'string',enum:['free','low','mid','high']},
          team:{type:'string',enum:['solo','small','team','large','agency']},
          priorities:{type:'array',maxItems:6,uniqueItems:true,items:{type:'string',enum:['price','ease','automation','integrations','sales','ai','marketing','seo','research','content','agency']}},
          existing_tools:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}}
        }
      },
      outputSchema:{type:'object',required:['use_case','tools','verdict','tradeoffs','affiliate_disclosure'],properties:{use_case:{type:'string'},tools:{type:'array',items:{type:'object'}},verdict:{type:'object'},tradeoffs:{type:'array',items:{type:'object'}},cheaper_option_analysis:{type:'object'},affiliate_disclosure:{type:'string'}}},
      annotations:readOnly
    },
    {
      name:'find_alternatives',
      title:'Find better alternatives for a reason',
      description:'Find alternatives to a product because the user dislikes something specific, such as price, complexity, weak automation, poor integrations or another constraint. Returns improvements and what each alternative may sacrifice.',
      inputSchema:{
        type:'object',additionalProperties:false,required:['tool','dislike'],
        properties:{
          tool:{type:'string',minLength:1,maxLength:120},
          dislike:{type:'string',minLength:2,maxLength:300},
          must_have:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}},
          budget:{type:'string',enum:['free','low','mid','high']},
          existing_tools:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}},
          limit:{type:'integer',minimum:1,maximum:5,default:3}
        }
      },
      outputSchema:{type:'object',required:['source','reason','alternatives','affiliate_disclosure'],properties:{source:{type:'object'},reason:{type:'string'},alternatives:{type:'array',items:{type:'object'}},affiliate_disclosure:{type:'string'}}},
      annotations:readOnly
    },
    {
      name:'check_stack_fit',
      title:'Check fit with an existing software stack',
      description:'Assess candidate software against tools the user already uses. Distinguishes verified pair evidence from general integration capability and unknown compatibility instead of inventing integrations.',
      inputSchema:{
        type:'object',additionalProperties:false,required:['candidates','existing_tools'],
        properties:{
          candidates:{type:'array',minItems:1,maxItems:5,uniqueItems:true,items:{type:'string',minLength:1,maxLength:120}},
          existing_tools:{type:'array',minItems:1,maxItems:12,uniqueItems:true,items:{type:'string',minLength:1,maxLength:100}},
          use_case:{type:'string',maxLength:300}
        }
      },
      outputSchema:{type:'object',required:['existing_tools','candidates','evidence_note'],properties:{existing_tools:{type:'array',items:{type:'string'}},candidates:{type:'array',items:{type:'object'}},evidence_note:{type:'string'}}},
      annotations:readOnly
    },
    {
      name:'recent_changes',
      title:'Show recent changes that affect a software decision',
      description:'Return recent ToolScout editorial updates for one to five products, focusing on changes that can alter a buying decision such as pricing, integrations, AI capabilities, security or product direction.',
      inputSchema:{
        type:'object',additionalProperties:false,required:['tools'],
        properties:{
          tools:{type:'array',minItems:1,maxItems:5,uniqueItems:true,items:{type:'string',minLength:1,maxLength:120}},
          limit_per_tool:{type:'integer',minimum:1,maximum:5,default:3}
        }
      },
      outputSchema:{type:'object',required:['tools','changes','evidence_note'],properties:{tools:{type:'array',items:{type:'object'}},changes:{type:'array',items:{type:'object'}},evidence_note:{type:'string'}}},
      annotations:readOnly
    },
    {
      name:'recommend_tools',
      title:'Recommend software with ToolScout',
      description:'Compatibility recommendation tool for a job, persona, budget, team and priority. Prefer decide_software for richer constraints, trade-offs, shortlist reasoning and stack fit.',
      inputSchema:{
        type:'object',additionalProperties:false,required:['q'],
        properties:{
          q:{type:'string',minLength:2,maxLength:300,description:'Natural-language description of the software job or need.'},
          goal:{type:'string',maxLength:40,description:'Optional category or goal hint.'},
          budget:{type:'string',enum:['free','low','mid','high']},
          team:{type:'string',enum:['solo','small','team','large','agency']},
          priority:{type:'string',enum:['ease','automation','integrations','features']},
          limit:{type:'integer',minimum:1,maximum:5,default:3}
        }
      },
      outputSchema:{type:'object',required:['query','count','recommendations','ranking','affiliate_disclosure'],properties:{query:{type:'string'},profile:{type:'object'},intent:{type:['object','null']},count:{type:'integer'},ranking:{type:'string'},affiliate_disclosure:{type:'string'},recommendations:{type:'array',items:{type:'object'}}}},
      annotations:readOnly
    },
    {
      name:'search_tools',
      title:'Look up the ToolScout software catalog',
      description:'Secondary lookup tool for names, categories, features or AI interoperability. Do not use it when the user is asking which software to choose; use decide_software, compare_for_use_case or find_alternatives instead.',
      inputSchema:{
        type:'object',additionalProperties:false,required:['q'],
        properties:{
          q:{type:'string',minLength:2,maxLength:160},
          category:{type:'string',maxLength:60},
          ai_interoperability:{type:'string',enum:['verified','strong','official_mcp']},
          limit:{type:'integer',minimum:1,maximum:10,default:5}
        }
      },
      outputSchema:{type:'object',required:['query','count','results','affiliate_disclosure'],properties:{query:{type:'string'},count:{type:'integer'},results:{type:'array',items:{type:'object'}},affiliate_disclosure:{type:'string'}}},
      annotations:readOnly
    },
    {
      name:'get_tool',
      title:'Get a ToolScout software profile',
      description:'Return ToolScout catalog facts for one software product, including AI interoperability evidence and canonical ToolScout profile and outbound URLs.',
      inputSchema:{type:'object',additionalProperties:false,required:['tool'],properties:{tool:{type:'string',minLength:1,maxLength:120,description:'Tool name or ToolScout slug.'}}},
      outputSchema:{type:'object',required:['tool','affiliate_disclosure'],properties:{tool:{type:'object'},affiliate_disclosure:{type:'string'}}},
      annotations:readOnly
    },
    {
      name:'compare_tools',
      title:'Compare raw software facts',
      description:'Compatibility tool for factual side-by-side catalog data. Prefer compare_for_use_case when a user is making a decision and needs trade-offs or a recommendation.',
      inputSchema:{type:'object',additionalProperties:false,required:['tools'],properties:{tools:{type:'array',minItems:2,maxItems:4,uniqueItems:true,items:{type:'string',minLength:1,maxLength:120}}}},
      outputSchema:{type:'object',required:['count','tools','missing','affiliate_disclosure'],properties:{count:{type:'integer'},tools:{type:'array',items:{type:'object'}},missing:{type:'array',items:{type:'string'}},affiliate_disclosure:{type:'string'}}},
      annotations:readOnly
    },
    {
      name:'get_ai_compatibility',
      title:'Check AI interoperability for software',
      description:'Return ToolScout verified AI interoperability data for one product, including MCP status, public API status and supported AI assistants when present.',
      inputSchema:{type:'object',additionalProperties:false,required:['tool'],properties:{tool:{type:'string',minLength:1,maxLength:120,description:'Tool name or ToolScout slug.'}}},
      outputSchema:{type:'object',required:['tool','ai_integration','evidence_status'],properties:{tool:{type:'object'},ai_integration:{type:'object'},evidence_status:{type:'string'}}},
      annotations:readOnly
    }
  ];
}
function validRecommendArguments(a){
  if(!a||typeof a!=='object'||Array.isArray(a))return 'arguments must be an object';
  if(typeof a.q!=='string'||a.q.trim().length<2||a.q.length>300)return 'q must be a string between 2 and 300 characters';
  const checks=[['budget',['free','low','mid','high']],['team',['solo','small','team','large','agency']],['priority',['ease','automation','integrations','features']]];
  for(const [key,values] of checks)if(a[key]!==undefined&&!values.includes(a[key]))return `${key} is invalid`;
  if(a.limit!==undefined&&(!Number.isInteger(a.limit)||a.limit<1||a.limit>5))return 'limit must be an integer from 1 to 5';
  return null;
}
function validToolArguments(name,a){
  if(!a||typeof a!=='object'||Array.isArray(a))return 'arguments must be an object';
  const validBudget=v=>v===undefined||['free','low','mid','high'].includes(v);
  const validTeam=v=>v===undefined||['solo','small','team','large','agency'].includes(v);
  const validPriorities=v=>v===undefined||(Array.isArray(v)&&v.length<=6&&new Set(v).size===v.length&&v.every(x=>['price','ease','automation','integrations','sales','ai','marketing','seo','research','content','agency'].includes(x)));
  const validStrings=(v,maxItems,maxLen)=>v===undefined||(Array.isArray(v)&&v.length<=maxItems&&v.every(x=>typeof x==='string'&&x.trim()&&x.length<=maxLen));
  if(name==='recommend_tools')return validRecommendArguments(a);
  if(name==='decide_software'){
    if(typeof a.job!=='string'||a.job.trim().length<3||a.job.length>500)return 'job must be a string between 3 and 500 characters';
    if(!validStrings(a.constraints,12,160)||!validStrings(a.must_have,12,100)||!validStrings(a.avoid,12,100)||!validStrings(a.existing_tools,12,100))return 'constraints, must_have, avoid and existing_tools must be valid string arrays';
    if(!validBudget(a.budget)||!validTeam(a.team)||!validPriorities(a.priorities))return 'budget, team or priorities is invalid';
    if(a.limit!==undefined&&(!Number.isInteger(a.limit)||a.limit<2||a.limit>5))return 'limit must be an integer from 2 to 5';
    return null;
  }
  if(name==='compare_for_use_case'){
    if(!Array.isArray(a.tools)||a.tools.length<2||a.tools.length>4||new Set(a.tools.map(x=>String(x).trim().toLowerCase())).size!==a.tools.length)return 'tools must contain 2 to 4 unique tool names or slugs';
    if(a.tools.some(x=>typeof x!=='string'||!x.trim()||x.length>120))return 'each tool must be a non-empty string up to 120 characters';
    if(typeof a.use_case!=='string'||a.use_case.trim().length<3||a.use_case.length>500)return 'use_case must be a string between 3 and 500 characters';
    if(!validStrings(a.must_have,12,100)||!validStrings(a.existing_tools,12,100)||!validBudget(a.budget)||!validTeam(a.team)||!validPriorities(a.priorities))return 'comparison constraints are invalid';
    return null;
  }
  if(name==='find_alternatives'){
    if(typeof a.tool!=='string'||!a.tool.trim()||a.tool.length>120)return 'tool must be a non-empty string up to 120 characters';
    if(typeof a.dislike!=='string'||a.dislike.trim().length<2||a.dislike.length>300)return 'dislike must be a string between 2 and 300 characters';
    if(!validStrings(a.must_have,12,100)||!validStrings(a.existing_tools,12,100)||!validBudget(a.budget))return 'alternative constraints are invalid';
    if(a.limit!==undefined&&(!Number.isInteger(a.limit)||a.limit<1||a.limit>5))return 'limit must be an integer from 1 to 5';
    return null;
  }
  if(name==='check_stack_fit'){
    if(!validStrings(a.candidates,5,120)||!Array.isArray(a.candidates)||!a.candidates.length)return 'candidates must contain 1 to 5 tool names or slugs';
    if(!validStrings(a.existing_tools,12,100)||!Array.isArray(a.existing_tools)||!a.existing_tools.length)return 'existing_tools must contain 1 to 12 software names';
    if(a.use_case!==undefined&&(typeof a.use_case!=='string'||a.use_case.length>300))return 'use_case is invalid';
    return null;
  }
  if(name==='recent_changes'){
    if(!validStrings(a.tools,5,120)||!Array.isArray(a.tools)||!a.tools.length)return 'tools must contain 1 to 5 tool names or slugs';
    if(a.limit_per_tool!==undefined&&(!Number.isInteger(a.limit_per_tool)||a.limit_per_tool<1||a.limit_per_tool>5))return 'limit_per_tool must be an integer from 1 to 5';
    return null;
  }
  if(name==='search_tools'){
    if(typeof a.q!=='string'||a.q.trim().length<2||a.q.length>160)return 'q must be a string between 2 and 160 characters';
    if(a.category!==undefined&&(typeof a.category!=='string'||a.category.length>60))return 'category is invalid';
    if(a.ai_interoperability!==undefined&&!['verified','strong','official_mcp'].includes(a.ai_interoperability))return 'ai_interoperability is invalid';
    if(a.limit!==undefined&&(!Number.isInteger(a.limit)||a.limit<1||a.limit>10))return 'limit must be an integer from 1 to 10';
    return null;
  }
  if(name==='get_tool'||name==='get_ai_compatibility'){
    if(typeof a.tool!=='string'||!a.tool.trim()||a.tool.length>120)return 'tool must be a non-empty string up to 120 characters';
    return null;
  }
  if(name==='compare_tools'){
    if(!Array.isArray(a.tools)||a.tools.length<2||a.tools.length>4)return 'tools must contain between 2 and 4 tool names or slugs';
    if(a.tools.some(x=>typeof x!=='string'||!x.trim()||x.length>120))return 'each tool must be a non-empty string up to 120 characters';
    if(new Set(a.tools.map(x=>x.trim().toLowerCase())).size!==a.tools.length)return 'tools must be unique';
    return null;
  }
  return 'unknown tool';
}
async function callRecommend(args,request,env,ctx){
  const url=new URL('/api/recommend',request.url);
  for(const key of ['q','goal','budget','team','priority','limit'])if(args[key]!==undefined&&args[key]!==null&&String(args[key])!=='')url.searchParams.set(key,String(args[key]));
  const internal=new Request(url.toString(),{method:'GET',headers:{Accept:'application/json'}});
  const response=await base.fetch(internal,env,ctx);
  let data;try{data=await response.json()}catch{return {error:'ToolScout recommendation API returned an invalid response.',status:502}}
  if(!response.ok)return {error:data?.message||data?.error||'Recommendation unavailable.',status:response.status,data};
  return {data};
}
function catalogNormalize(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
async function loadCatalog(request,env){
  const url=new URL('/data/tools.json',request.url);
  const response=await env.ASSETS.fetch(new Request(url.toString(),{method:'GET',headers:{Accept:'application/json'}}));
  if(!response.ok)throw new Error('catalog_unavailable');
  const tools=await response.json();
  if(!Array.isArray(tools))throw new Error('catalog_invalid');
  return tools;
}
function findCatalogTool(tools,value){
  const raw=String(value||'').trim(),needle=catalogNormalize(raw);
  if(!needle)return null;
  const exact=tools.find(t=>String(t?.slug||'').toLowerCase()===raw.toLowerCase()||catalogNormalize(t?.name)===needle);
  if(exact)return exact;
  const partial=tools.filter(t=>catalogNormalize(t?.name).includes(needle)||catalogNormalize(t?.slug).includes(needle));
  return partial.length===1?partial[0]:null;
}
function aiIntegration(tool){
  const ai=tool?.aiIntegration&&typeof tool.aiIntegration==='object'?tool.aiIntegration:{};
  return {
    status:ai.status||'unverified',
    tier:ai.tier||'unknown',
    mcp:ai.mcp||'unknown',
    public_api:ai.publicApi??null,
    assistants:Array.isArray(ai.assistants)?ai.assistants:[],
    summary:ai.summary||'ToolScout has not yet verified this tool\'s current AI interoperability.',
    verified_at:ai.verifiedAt||null
  };
}
function publicTool(tool){
  return {
    slug:tool.slug,
    name:tool.name,
    category:tool.category,
    description:tool.description,
    pricing:tool.pricing,
    free_plan:Boolean(tool.freePlan),
    free_plan_verified:tool.freePlanKnown===true,
    free_plan_status:tool.freePlanKnown===true?(tool.freePlan?'verified_available':'verified_unavailable'):'unverified',
    features:Array.isArray(tool.features)?tool.features:[],
    best_for:Array.isArray(tool.bestFor)?tool.bestFor:[],
    ai_integration:aiIntegration(tool),
    last_verified:tool.lastVerified||null,
    category_review_required:tool.categoryReviewRequired===true,
    editorial_review:tool?.editorialReview&&typeof tool.editorialReview==='object'?{
      angle:tool.editorialReview.angle||null,
      conclusion:tool.editorialReview.summary||null,
      buyer_check:tool.editorialReview.buyerCheck||null,
      strengths:Array.isArray(tool.strengths)?tool.strengths:[],
      limitations:Array.isArray(tool.limitations)?tool.limitations:[],
      tradeoffs:Array.isArray(tool.tradeoffs)?tool.tradeoffs:[],
      reviewed_at:tool.editorialReview.reviewedAt||null,
      evidence_basis:tool.editorialReview.sourceUrl?'manufacturer_documentation_verified_internally':'not_documented',
      evidence_method:tool.editorialReview.method||null,
      verification_status:tool.editorialReview.verificationStatus||'editorial_vendor_documentation',
      evidence_caveat:tool.editorialReview.verificationStatus==='catalog_only'?'Editorial assessment derived from unverified catalog attributes. Confirm capabilities, plans and integrations with the vendor before relying on them.':null,
      hands_on_tested:tool.editorialReview.handsOnTested===true
    }:null,
    profile_url:`https://trytoolscout.org/tools/${encodeURIComponent(tool.slug)}`,
    tool_url:`https://trytoolscout.org/go/${encodeURIComponent(tool.slug)}?source=ai-agent`
  };
}
function catalogSearchScore(tool,args){
  const q=catalogNormalize(args.q),tokens=q.split(' ').filter(Boolean),name=catalogNormalize(tool?.name),slug=catalogNormalize(tool?.slug),category=catalogNormalize(tool?.category);
  const hay=catalogNormalize([tool?.name,tool?.slug,tool?.category,tool?.description,...(tool?.features||[]),...(tool?.bestFor||[])].join(' '));
  let score=0;
  if(name===q||slug===q)score+=100;
  else if(name.includes(q)||slug.includes(q))score+=50;
  if(category===q)score+=30;
  for(const token of tokens)if(token.length>=2&&hay.includes(token))score+=8;
  if(args.category&&category!==catalogNormalize(args.category))return -1;
  const ai=aiIntegration(tool);
  if(args.ai_interoperability==='verified'&&ai.status!=='verified')return -1;
  if(args.ai_interoperability==='strong'&&!(ai.status==='verified'&&ai.tier==='strong'))return -1;
  if(args.ai_interoperability==='official_mcp'&&ai.mcp!=='official')return -1;
  return score;
}
const DECISION_DIMENSIONS=Object.freeze({
  price:['price','pricing','cost','budget','cheap','cheaper','affordable','free','expensive','too expensive'],
  ease:['ease','easy','simple','simplicity','usability','beginner','setup','learning curve','complex','complexity','complicated'],
  automation:['automation','automate','workflow','workflows','automatic'],
  integrations:['integration','integrations','integrate','stack','connect','connector'],
  sales:['sales','crm','pipeline','lead','leads','prospecting'],
  ai:['ai','artificial intelligence','agent','agents','mcp','chatgpt','claude','gemini'],
  marketing:['marketing','campaign','campaigns','email marketing','growth'],
  seo:['seo','search engine','keyword','keywords','organic'],
  research:['research','analysis','analytics','insight','insights'],
  content:['content','writing','newsletter','publishing','creative'],
  agency:['agency','agencies','client','clients']
});
const STOP_WORDS=new Set(['the','and','for','with','that','this','from','into','our','your','you','my','we','software','tool','tools','app','apps','need','want','best','right','which','use','using','to','of','a','an','in','on','or','is','are']);
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function scoreOf(tool,key){const raw=tool?.scores?.[key];if(raw==null||raw==='')return null;const n=Number(raw);return Number.isFinite(n)?clamp(n,0,10):null}
function textTerms(value){return catalogNormalize(value).split(' ').filter(x=>x.length>1&&!STOP_WORDS.has(x))}
function toolHay(tool){return catalogNormalize([tool?.name,tool?.slug,tool?.category,tool?.description,...(tool?.features||[]),...(tool?.bestFor||[])].join(' '))}
function requestedDimensions(args){
  const direct=Array.isArray(args?.priorities)?args.priorities.filter(x=>DECISION_DIMENSIONS[x]):[];
  if(direct.length)return direct;
  const text=catalogNormalize([args?.job,args?.use_case,args?.dislike,...(args?.constraints||[]),...(args?.must_have||[]),...(args?.avoid||[])].join(' '));
  const found=[];
  for(const [key,aliases] of Object.entries(DECISION_DIMENSIONS))if(aliases.some(x=>text.includes(catalogNormalize(x))))found.push(key);
  return found.length?found:['ease','integrations'];
}
function verifiedIntegrationPair(tool,existing){
  // Claims must be tied to a named integration, verification date and primary source.
  // General integration scores and incidental mentions are not pair-level evidence.
  const target=catalogNormalize(existing);
  if(!target||!Array.isArray(tool?.integrations))return null;
  return tool.integrations.find(pair=>{
    if(!pair||typeof pair!=='object'||pair.status!=='verified')return false;
    const name=catalogNormalize(pair.product||pair.tool||pair.name);
    const source=String(pair.sourceUrl||pair.source_url||'');
    const verifiedAt=String(pair.verifiedAt||pair.verified_at||'');
    return name===target&&/^https:\/\//i.test(source)&&/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt);
  })||null;
}
function requirementMatch(tool,requirement){
  // A must-have is evidence of a capability, not loose overlap with marketing text.
  // Only declared category/features or sourced, verified integration pairs
  // may satisfy one. Missing evidence must never be upgraded by fuzzy text matching.
  const needle=catalogNormalize(requirement).replace(/^(?:(?:must|need|needs|require|requires|support|supports|have|has|with)\s+)+/g,'');
  if(!needle)return {matched:false,strength:0};
  const declared=[tool?.category,...(Array.isArray(tool?.features)?tool.features:[])];
  const claims=declared.map(catalogNormalize).filter(Boolean);
  const matched=Boolean(verifiedIntegrationPair(tool,needle))||claims.some(value=>value===needle||(' '+value+' ').includes(' '+needle+' '));
  return {matched,strength:matched?1:0};
}
function budgetSignal(tool,budget){
  const price=scoreOf(tool,'price');
  if(!budget)return {points:0,label:'not specified'};
  if(budget==='free')return tool?.freePlanKnown===true?(tool.freePlan?{points:12,label:'verified catalog free plan'}:{points:-18,label:'verified no free plan'}):{points:0,label:'free-plan status not verified'};
  if(price==null)return {points:0,label:'price fit unverified'};
  if(budget==='low')return {points:(price-5)*3,label:price>=8?'strong affordability signal':price>=6?'moderate affordability signal':'weaker affordability signal'};
  if(budget==='mid')return {points:Math.abs(price-6)<=2?7:2,label:'mid-budget fit estimated from ToolScout price score'};
  return {points:price<=6?6:2,label:'budget is flexible; capability can outweigh price'};
}
function teamSignal(tool,team){
  if(!team)return {points:0,label:null};
  const hay=toolHay(tool),aliases={
    solo:['solo','creator','freelancer','individual'],
    small:['small business','small businesses','small team','startup'],
    team:['team','teams','company','business'],
    large:['enterprise','large','organization','organisation'],
    agency:['agency','agencies','client']
  };
  const matched=(aliases[team]||[team]).some(x=>hay.includes(catalogNormalize(x)));
  return {points:matched?7:0,label:matched?'catalog evidence matches '+team+' context':'team-size fit not explicit in catalog'};
}
function explicitTextMatch(tool,value){
  const needle=catalogNormalize(value);
  if(!needle)return false;
  const fields=[
    tool?.description,
    ...(tool?.features||[]),
    ...(tool?.bestFor||[])
  ].map(catalogNormalize).filter(Boolean);
  return fields.some(field=>field===needle||field.includes(' '+needle+' ')||field.startsWith(needle+' ')||field.endsWith(' '+needle));
}
function constraintEvidence(tool,constraints=[]){
  return (constraints||[]).map(raw=>{
    const constraint=String(raw||'').trim(),norm=catalogNormalize(constraint);
    if(!norm)return {constraint,status:'not_verified',evidence:'Empty constraint cannot be evaluated.'};
    const freeIntent=/\b(?:free|free plan|no cost)\b/.test(norm);
    if(freeIntent){
      if(tool?.freePlanKnown!==true)return {constraint,status:'not_verified',evidence:'Free-plan availability has not been independently verified in the current ToolScout catalog.'};
      return tool.freePlan
        ?{constraint,status:'verified',evidence:'ToolScout catalog has verified free-plan availability.'}
        :{constraint,status:'conflict',evidence:'ToolScout catalog has verified that no free plan is available.'};
    }
    const stripped=norm.replace(/\b(?:must|needs?|need|requires?|require|required|support|supports|with|only|be|have|has)\b/g,' ').replace(/\s+/g,' ').trim();
    const exact=explicitTextMatch(tool,norm)||(stripped&&explicitTextMatch(tool,stripped));
    if(exact)return {constraint,status:'verified',evidence:'The current ToolScout catalog explicitly contains this requirement in product evidence.'};
    return {constraint,status:'not_verified',evidence:'ToolScout does not currently store explicit evidence that this product satisfies the requirement.'};
  });
}
function jobIntentProfile(tools,job){
  const normalized=catalogNormalize(job),categories=[...new Set(tools.map(t=>catalogNormalize(t?.category)).filter(Boolean))];
  const explicitCategories=categories.filter(cat=>{
    const phrase=cat.replace(/\s+/g,' ');
    return normalized===phrase||normalized.startsWith(phrase+' ')||normalized.endsWith(' '+phrase)||normalized.includes(' '+phrase+' ');
  });
  const dimensionTerms=new Set(Object.values(DECISION_DIMENSIONS).flat().flatMap(textTerms));
  const contextTerms=new Set(['small','large','team','teams','company','business','businesses','consultancy','consulting','agency','agencies','solo','startup','startups','workflow','workflows','platform','solution','solutions']);
  const intentTerms=textTerms(job).filter(term=>!dimensionTerms.has(term)&&!contextTerms.has(term));
  // Specific job families outrank incidental mentions of generic words.
  const families=[
    {category:'crm',pattern:/\b(crm|customer relationship management|sales pipeline|manage leads)\b/},
    {category:'seo',pattern:/\b(seo|keyword research|backlink|search engine optimization|organic search)\b/},
    {category:'developer',pattern:/\b(coding|code editor|software development|devops|continuous deployment)\b/},
    {category:'support',pattern:/\b(helpdesk|help desk|customer support|ticketing)\b/},
    {category:'social',pattern:/\b(social media|social scheduling|social publishing)\b/},
    {category:'forms',pattern:/\b(form builder|lead capture form|online forms|survey builder)\b/},
    {category:'analytics',pattern:/\b(product analytics|web analytics|retention analysis|session replay)\b/},
    {category:'website',pattern:/\b(website builder|build a website|site builder)\b/},
    {category:'ecommerce',pattern:/\b(ecommerce|online store|shopping cart)\b/},
    {category:'business',pattern:/\b(project management|task management|collaboration board)\b/},
    {category:'marketing',pattern:/\b(email marketing|marketing automation|newsletter)\b/},
    {category:'sales',pattern:/\b(sales prospecting|cold email|lead database)\b/},
    {category:'ai-research',pattern:/\b(ai research|research assistant|source synthesis)\b/},
    {category:'ai-assistant',pattern:/\b(ai assistant|general ai assistant|chatbot)\b/}
  ];
  const familyMatches=families.filter(x=>x.pattern.test(normalized)).map(x=>x.category);
  return {normalized,explicitCategories:explicitCategories.length?explicitCategories:familyMatches,intentTerms};
}
function matchesJobIntent(tool,profile){
  const category=catalogNormalize(tool?.category),hay=' '+toolHay(tool)+' ';
  if(profile.explicitCategories.length)return profile.explicitCategories.includes(category);
  if(!profile.intentTerms.length)return false;
  return profile.intentTerms.some(term=>category===term||hay.includes(' '+term+' '));
}
function stackAssessment(tool,existingTools=[]){
  const ai=aiIntegration(tool),hay=toolHay(tool),pairs=[];
  for(const existing of existingTools||[]){
    const n=catalogNormalize(existing);
    if(!n)continue;
    const pair=verifiedIntegrationPair(tool,existing);
    if(pair){
      pairs.push({existing_tool:existing,status:'verified',evidence:'Verified named integration with '+existing+'.',verified_at:pair.verifiedAt||pair.verified_at});
      continue;
    }
    const assistant=ai.status==='verified'?(ai.assistants||[]).find(x=>catalogNormalize(x)===n):null;
    if(assistant){pairs.push({existing_tool:existing,status:'verified',evidence:'Verified AI interoperability with '+assistant+'.'});continue}
    if((tool.features||[]).some(x=>catalogNormalize(x)==='integrations')||scoreOf(tool,'integrations')>=8){
      pairs.push({existing_tool:existing,status:'pair_unverified',evidence:'Strong general integration capability, but ToolScout does not currently store verified product-specific evidence for '+existing+'.'});
      continue;
    }
    pairs.push({existing_tool:existing,status:'unknown',evidence:'No product-specific integration evidence is currently stored for '+existing+'.'});
  }
  const verified=pairs.filter(x=>x.status==='verified').length;
  return {pairs,verified_pairs:verified,unknown_pairs:pairs.length-verified,summary:pairs.length?verified===pairs.length?'All requested stack links have catalog evidence.':verified?'Some stack links are evidenced; the rest should be verified before switching.':'ToolScout does not currently have pair-specific evidence for this stack; do not assume compatibility.':'No existing stack supplied.'};
}
function decisionEvaluation(tool,args){
  const job=String(args.job||args.use_case||args.q||'').trim(),hay=toolHay(tool),terms=textTerms(job);
  let relevance=0;
  if(terms.length){
    const category=catalogNormalize(tool.category);
    for(const term of terms){
      if(category===term)relevance+=10;
      else if((' '+hay+' ').includes(' '+term+' '))relevance+=4;
    }
  }
  for(const req of args.must_have||[])if(requirementMatch(tool,req).matched)relevance+=5;
  const dims=requestedDimensions(args);
  const dimScores=dims.map(key=>({dimension:key,score:scoreOf(tool,key)})).filter(x=>x.score!=null);
  const dimAvg=dimScores.length?dimScores.reduce((s,x)=>s+x.score,0)/dimScores.length:5;
  const budget=budgetSignal(tool,args.budget),team=teamSignal(tool,args.team);
  const must=(args.must_have||[]).map(x=>({requirement:x,...requirementMatch(tool,x)}));
  const avoids=(args.avoid||[]).map(x=>({requirement:x,...requirementMatch(tool,x)}));
  const constraints=constraintEvidence(tool,args.constraints||[]);
  const mustMatched=must.filter(x=>x.matched).length;
  const avoidHits=avoids.filter(x=>x.matched).length;
  const constraintVerified=constraints.filter(x=>x.status==='verified').length;
  const constraintUnverified=constraints.filter(x=>x.status==='not_verified').length;
  const constraintConflicts=constraints.filter(x=>x.status==='conflict').length;
  const raw=12+Math.min(38,relevance)+((dimAvg-5)*4)+budget.points+team.points+mustMatched*3+constraintVerified*3-constraintUnverified*7-constraintConflicts*22-avoidHits*12;
  const fit=clamp(Math.round(raw),0,95);
  const stack=stackAssessment(tool,args.existing_tools||[]);
  const advantages=[];
  for(const d of [...dimScores].sort((a,b)=>b.score-a.score).slice(0,3))if(d.score>=7)advantages.push(d.dimension+': '+d.score+'/10');
  if(tool.freePlanKnown===true&&tool.freePlan&&args.budget==='free')advantages.push('verified catalog free plan');
  for(const x of must.filter(x=>x.matched).slice(0,3))advantages.push((verifiedIntegrationPair(tool,x.requirement)?'verified named integration: ':'catalog-listed capability, confirm with vendor: ')+x.requirement);
  const tradeoffs=[];
  for(const d of dimScores.filter(x=>x.score<=5))tradeoffs.push(d.dimension+' is only '+d.score+'/10 in the current ToolScout scorecard');
  for(const x of must.filter(x=>!x.matched).slice(0,4))tradeoffs.push('must-have not verified in catalog: '+x.requirement);
  for(const x of constraints.filter(x=>x.status==='not_verified').slice(0,4))tradeoffs.push('constraint not verified: '+x.constraint);
  for(const x of constraints.filter(x=>x.status==='conflict').slice(0,4))tradeoffs.push('constraint conflict: '+x.constraint);
  if(avoidHits)for(const x of avoids.filter(x=>x.matched).slice(0,3))tradeoffs.push('possible conflict with avoid constraint: '+x.requirement);
  if(args.budget==='free'&&!tool.freePlan)tradeoffs.push('no verified free plan in the current catalog');
  // A populated scorecard is not claim-level manufacturer documentation.
  const primaryProof=(tool?.evidence||[]).filter(x=>x.claimScope==='toolscout_editorial_review'&&x.sourceUrl&&x.verifiedAt).length;
  const confidence=primaryProof>=2&&stack.unknown_pairs===0?'high':primaryProof>=1?'medium':'limited';
  return {
    ...publicTool(tool),
    fit_score:fit,
    evidence_confidence:confidence,
    advantages,
    tradeoffs:[...new Set([...tradeoffs,...(Array.isArray(tool.limitations)?tool.limitations:[]).filter(Boolean).slice(0,2)])],
    decision_rationale:tool.editorialReview?.summary||null,
    verification_basis:primaryProof?'manufacturer documentation recorded internally; fit scores are editorial estimates':'manufacturer evidence incomplete; do not interpret fit score as verification',
    requested_dimensions:dimScores,
    requirement_evidence:must,
    constraint_evidence:constraints,
    constraint_summary:{verified:constraintVerified,not_verified:constraintUnverified,conflicts:constraintConflicts},
    stack_fit:stack
  };
}
function decisionCandidates(tools,args){
  const evaluated=tools.map(t=>decisionEvaluation(t,args));
  const profile=jobIntentProfile(tools,args.job||args.use_case||'');
  const relevant=evaluated.filter(x=>{
    const source=tools.find(t=>t.slug===x.slug);
    return source&&!source.categoryReviewRequired?matchesJobIntent(source,profile):false;
  });
  // 'must_have' is a hard gate. A product with unverified requirements can be
  // compared explicitly but must not appear as a qualified recommendation.
  const qualified=relevant.filter(x=>(args.must_have||[]).every(req=>x.requirement_evidence.some(r=>r.requirement===req&&r.matched))&&(args.budget!=='free'||(x.free_plan_verified&&x.free_plan===true)));
  return qualified.sort((a,b)=>b.fit_score-a.fit_score||String(a.name).localeCompare(String(b.name)));
}
function pairwiseTradeoffs(evaluated,dims){
  const out=[];
  for(let i=0;i<evaluated.length;i++)for(let j=i+1;j<evaluated.length;j++){
    const a=evaluated[i],b=evaluated[j],differences=[];
    for(const d of dims){
      const av=(a.requested_dimensions.find(x=>x.dimension===d)||{}).score;
      const bv=(b.requested_dimensions.find(x=>x.dimension===d)||{}).score;
      if(av==null||bv==null||av===bv)continue;
      const winner=av>bv?a.name:b.name,loser=av>bv?b.name:a.name;
      differences.push({dimension:d,winner,loser,difference:Math.abs(av-bv),scores:{[a.name]:av,[b.name]:bv}});
    }
    out.push({a:a.name,b:b.name,differences});
  }
  return out;
}
async function assetText(request,env,path){
  if(!env?.ASSETS?.fetch)return null;
  try{const u=new URL(path,request.url);const r=await env.ASSETS.fetch(new Request(u.toString(),{method:'GET'}));return r.ok?await r.text():null}catch{return null}
}
function newsJsonLd(html){
  const matches=[...String(html||'').matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  for(const m of matches){try{const j=JSON.parse(m[1]);if(j&&j['@type']==='NewsArticle')return j}catch{}}
  return null;
}
async function recentChangesForTool(tool,request,env,limit=3){
  const index=await assetText(request,env,'/whats-new.html');
  if(!index)return [];
  const links=[...new Set([...index.matchAll(/href=["'](\/news\/[^"'?#]+(?:\.html)?)["']/gi)].map(m=>m[1]))].slice(0,40);
  const pages=await Promise.all(links.map(async path=>({path,html:await assetText(request,env,path)})));
  const needle=catalogNormalize(tool.name),slug=catalogNormalize(tool.slug);
  const changes=[];
  for(const page of pages){
    const j=newsJsonLd(page.html);if(!j)continue;
    const about=typeof j.about==='string'?j.about:(j.about?.name||'');
    if(![catalogNormalize(about),catalogNormalize(j.headline),catalogNormalize(j.description)].some(x=>x.includes(needle)||x.includes(slug)))continue;
    changes.push({
      tool:tool.name,
      headline:j.headline||null,
      summary:j.description||null,
      date:j.datePublished||j.dateModified||null,
      url:j.mainEntityOfPage||new URL(page.path,request.url).toString(),
      decision_relevance:'ToolScout editorial update selected for buyer relevance.'
    });
  }
  changes.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  return changes.slice(0,limit);
}
async function callCatalogTool(name,args,request,env){
  let tools;
  try{tools=await loadCatalog(request,env)}catch{return {error:'ToolScout catalog is temporarily unavailable.',status:503}}
  const disclosure='ToolScout may earn a commission from some outbound links. Affiliate relationships do not influence ranking, shortlist order, comparison conclusions or factual output.';
  if(name==='decide_software'){
    const limit=Math.max(2,Math.min(5,args.limit||3));
    const shortlist=decisionCandidates(tools,args).filter(x=>x.fit_score>0).slice(0,limit);
    if(!shortlist.length)return {error:'ToolScout could not find enough catalog evidence for this software decision. Add a more concrete job, category or must-have constraint.',status:422,data:{job:args.job,shortlist:[]}};
    const dims=requestedDimensions(args);
    return {data:{
      job:args.job,
      shortlist,
      decision_basis:{
        dimensions:dims,
        constraints:args.constraints||[],
        must_have:args.must_have||[],
        avoid:args.avoid||[],
        budget:args.budget||null,
        team:args.team||null,
        existing_tools:args.existing_tools||[],
        methodology:'Deterministic ToolScout catalog fit. Candidates must first match the requested job/category and satisfy all evidence-backed must-haves to appear in a qualified shortlist. Missing evidence is not a confirmed capability. A free-only budget excludes products without verified free plans. Scores then combine explicit priorities, budget/team signals, must-have evidence, free-form constraint evidence and known stack evidence. Every free-form constraint is returned as verified, not_verified or conflict; missing product-specific integration evidence is never upgraded from a generic text match.',
        no_pay_to_rank:true
      },
      affiliate_disclosure:disclosure
    }};
  }
  if(name==='compare_for_use_case'){
    const found=[],missing=[];
    for(const value of args.tools){const tool=findCatalogTool(tools,value);if(tool)found.push(tool);else missing.push(value)}
    if(found.length<2)return {error:'At least two requested tools must exist in the ToolScout catalog.',status:404,data:{missing}};
    const evalArgs={job:args.use_case,use_case:args.use_case,must_have:args.must_have||[],budget:args.budget,team:args.team,priorities:args.priorities||[],existing_tools:args.existing_tools||[]};
    const evaluated=found.map(t=>decisionEvaluation(t,evalArgs)).sort((a,b)=>b.fit_score-a.fit_score);
    const dims=requestedDimensions(evalArgs),gap=evaluated[0].fit_score-evaluated[1].fit_score;
    const priceRank=[...evaluated].filter(x=>scoreOf(found.find(t=>t.slug===x.slug),'price')!=null)
      .sort((a,b)=>(scoreOf(found.find(t=>t.slug===b.slug),'price')||0)-(scoreOf(found.find(t=>t.slug===a.slug),'price')||0));
    const affordable=priceRank[0]||null;
    const leader=evaluated[0];
    const losses=affordable?dims.filter(d=>d!=='price').map(d=>{
      const at=found.find(t=>t.slug===affordable.slug),lt=found.find(t=>t.slug===leader.slug);
      const av=scoreOf(at,d),lv=scoreOf(lt,d);
      return av!=null&&lv!=null&&lv-av>=2?{dimension:d,affordability_leader:av,best_fit_leader:lv,gap:lv-av}:null;
    }).filter(Boolean):[];
    return {data:{
      use_case:args.use_case,
      tools:evaluated,
      missing,
      verdict:gap>=4?{type:'best_fit',tool:leader.name,reason:'Highest evidence-weighted fit for the supplied use case and constraints.',score_gap:gap}:{type:'close_call',tools:evaluated.slice(0,2).map(x=>x.name),reason:'The leading fit scores are close; the decision should follow the explicit trade-offs rather than a forced winner.',score_gap:gap},
      tradeoffs:pairwiseTradeoffs(evaluated,dims),
      cheaper_option_analysis:affordable?{affordability_leader:affordable.name,pricing_signal:affordable.pricing,note:'Affordability is inferred from ToolScout price score and catalog pricing text, not a live quote.',what_you_may_lose_vs_best_fit:losses}: {note:'No comparable affordability score is available.'},
      affiliate_disclosure:disclosure
    }};
  }
  if(name==='find_alternatives'){
    const source=findCatalogTool(tools,args.tool);
    if(!source)return {error:'Source tool not found in the ToolScout catalog.',status:404,data:{tool:args.tool}};
    const dims=requestedDimensions({dislike:args.dislike});
    const sourceEval=decisionEvaluation(source,{job:source.category,priorities:dims,must_have:args.must_have||[],budget:args.budget,existing_tools:args.existing_tools||[]});
    const candidates=tools.filter(t=>t.slug!==source.slug&&catalogNormalize(t.category)===catalogNormalize(source.category)).map(t=>{
      const ev=decisionEvaluation(t,{job:source.category,priorities:dims,must_have:args.must_have||[],budget:args.budget,existing_tools:args.existing_tools||[]});
      const improvements=[],sacrifices=[];
      for(const d of [...new Set([...dims,'price','ease','automation','integrations'])]){
        const ss=scoreOf(source,d),cs=scoreOf(t,d);if(ss==null||cs==null)continue;
        if(cs-ss>=1)improvements.push({dimension:d,from:ss,to:cs});
        if(ss-cs>=1)sacrifices.push({dimension:d,from:ss,to:cs});
      }
      const reasonLift=improvements.filter(x=>dims.includes(x.dimension)).reduce((s,x)=>s+x.to-x.from,0);
      return {...ev,improvements_over_source:improvements,tradeoffs_vs_source:sacrifices,alternative_score:ev.fit_score+reasonLift*4};
    }).filter(x=>(!args.must_have?.length||x.requirement_evidence.every(r=>r.matched))&&(x.improvements_over_source.some(y=>dims.includes(y.dimension))||!dims.length)).sort((a,b)=>b.alternative_score-a.alternative_score).slice(0,Math.max(1,Math.min(5,args.limit||3)));
    return {data:{source:publicTool(source),reason:args.dislike,decision_dimensions:dims,alternatives:candidates,affiliate_disclosure:disclosure}};
  }
  if(name==='check_stack_fit'){
    const found=[],missing=[];
    for(const value of args.candidates){const tool=findCatalogTool(tools,value);if(tool)found.push(tool);else missing.push(value)}
    const candidates=found.map(t=>({tool:publicTool(t),stack_fit:stackAssessment(t,args.existing_tools),integration_score:scoreOf(t,'integrations'),use_case:args.use_case||null}));
    return {data:{existing_tools:args.existing_tools,candidates,missing,evidence_note:'ToolScout distinguishes exact catalog/AI evidence from general integration capability. pair_unverified and unknown mean compatibility must be checked before a migration or purchase.'}};
  }
  if(name==='recent_changes'){
    const found=[],missing=[];
    for(const value of args.tools){const tool=findCatalogTool(tools,value);if(tool)found.push(tool);else missing.push(value)}
    const limit=Math.max(1,Math.min(5,args.limit_per_tool||3));
    const nested=await Promise.all(found.map(async t=>({tool:publicTool(t),changes:await recentChangesForTool(t,request,env,limit)})));
    return {data:{tools:nested.map(x=>x.tool),missing,changes:nested.flatMap(x=>x.changes),evidence_note:'Recent changes come from ToolScout editorial news assets and are returned only when the article is associated with the requested product. Absence of a result does not mean the vendor made no changes.'}};
  }
  if(name==='search_tools'){
    const limit=Math.max(1,Math.min(10,args.limit||5));
    const ranked=tools.map(t=>({tool:t,score:catalogSearchScore(t,args)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||String(a.tool.name).localeCompare(String(b.tool.name))).slice(0,limit);
    const results=ranked.map(x=>({...publicTool(x.tool),relevance:x.score>=100?'exact':x.score>=50?'strong':'relevant'}));
    return {data:{query:args.q,count:results.length,results,affiliate_disclosure:'ToolScout may earn a commission from some outbound links. Affiliate relationships do not influence search order.'}};
  }
  if(name==='get_tool'){
    const tool=findCatalogTool(tools,args.tool);
    if(!tool)return {error:'Tool not found in the ToolScout catalog.',status:404,data:{tool:null,query:args.tool}};
    return {data:{tool:publicTool(tool),affiliate_disclosure:'ToolScout may earn a commission from some outbound links. Affiliate relationships do not influence profile facts.'}};
  }
  if(name==='compare_tools'){
    const found=[],missing=[];
    for(const value of args.tools){const tool=findCatalogTool(tools,value);if(tool)found.push(publicTool(tool));else missing.push(value)}
    if(found.length<2)return {error:'At least two requested tools must exist in the ToolScout catalog.',status:404,data:{count:found.length,tools:found,missing}};
    return {data:{count:found.length,tools:found,missing,comparison_basis:'ToolScout catalog facts and verified AI interoperability fields. No affiliate payout or paid placement is used as a comparison criterion.',affiliate_disclosure:'ToolScout may earn a commission from some outbound links. Affiliate relationships do not influence comparison order or facts.'}};
  }
  if(name==='get_ai_compatibility'){
    const tool=findCatalogTool(tools,args.tool);
    if(!tool)return {error:'Tool not found in the ToolScout catalog.',status:404,data:{tool:null,query:args.tool}};
    const ai=aiIntegration(tool);
    return {data:{tool:{slug:tool.slug,name:tool.name,profile_url:`https://trytoolscout.org/tools/${encodeURIComponent(tool.slug)}`,tool_url:`https://trytoolscout.org/go/${encodeURIComponent(tool.slug)}?source=ai-agent`},ai_integration:ai,evidence_status:ai.status==='verified'?'verified':'unverified'}};
  }
  return {error:'Unknown tool.',status:400};
}
function mcpClient(body){const c=requestMeta(body)['io.modelcontextprotocol/clientInfo']||{};return {clientName:c.name||null,clientVersion:c.version||null}}
async function handleMcp(request,env,ctx){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{...JSON_HEADERS,Allow:'POST, OPTIONS'}});
  let body;try{body=await request.json()}catch{return rpcError(null,-32700,'Parse error',undefined,400)}
  if(!body||body.jsonrpc!=='2.0'||body.id===undefined||typeof body.method!=='string')return rpcError(body?.id??null,-32600,'Invalid Request',undefined,400);
  const envelopeError=validateEnvelope(request,body);
  if(envelopeError){return rpcError(body.id,envelopeError.code,envelopeError.message,envelopeError.data,400)}
  if(body.method==='server/discover'){return rpc(body.id,{supportedVersions:[PROTOCOL_VERSION],capabilities:{tools:{listChanged:false}},instructions:'ToolScout is a read-only software decision engine, not a generic software directory. Prefer decide_software when the user is choosing what to buy or shortlist; compare_for_use_case for contextual comparisons and cheaper-option trade-offs; find_alternatives when a user dislikes something about an existing tool; check_stack_fit for integration fit with an existing stack; recent_changes for buyer-relevant product changes. Use search_tools only for lookup. Affiliate relationships never influence ranking, shortlist order, comparison conclusions or factual output.',ttlMs:3600000,cacheScope:'public'})}
  if(body.method==='tools/list'){return rpc(body.id,{tools:toolDefinitions(),ttlMs:3600000,cacheScope:'public'})}
  if(body.method==='tools/call'){
    const name=String(body?.params?.name||''),known=new Set(toolDefinitions().map(t=>t.name));
    if(!known.has(name)){return rpcError(body.id,-32602,'Unknown tool',{name:name||null},400)}
    const args=body?.params?.arguments||{},invalid=validToolArguments(name,args);
    if(invalid){return rpc(body.id,{content:[{type:'text',text:invalid}],isError:true})}
    const out=name==='recommend_tools'?await callRecommend(args,request,env,ctx):await callCatalogTool(name,args,request,env);
    if(out.error){return rpc(body.id,{content:[{type:'text',text:out.error}],structuredContent:out.data||{error:out.error},isError:true})}
    return rpc(body.id,{content:[{type:'text',text:JSON.stringify(out.data)}],structuredContent:out.data,isError:false});
  }
  return rpcError(body.id,-32601,'Method not found',{method:body.method},400);
}
function agentCard(){
  return {
    name:'ToolScout Software Decision Agent',
    description:'Read-only software decision agent that helps buyers decide which software fits a real job, constraints and existing stack. It can shortlist, compare for a use case, surface trade-offs, find alternatives, check stack fit and explain recent buyer-relevant changes. Affiliate relationships do not influence decisions.',
    version:'2.0.0',
    provider:{organization:'ToolScout',url:'https://trytoolscout.org/'},
    documentationUrl:'https://trytoolscout.org/agents.md',
    iconUrl:'https://trytoolscout.org/embed/badge.svg',
    supportedInterfaces:[{url:'https://trytoolscout.org/a2a',protocolBinding:'JSONRPC',protocolVersion:A2A_VERSION}],
    capabilities:{streaming:false,pushNotifications:false,extendedAgentCard:false},
    defaultInputModes:['text/plain','application/json'],
    defaultOutputModes:['text/plain','application/json'],
    skills:[
      {id:'decide_software',name:'Decide which software fits',description:'Build an evidence-aware shortlist from a job, constraints, budget, team, must-haves and existing stack.',tags:['software-decision','shortlist','buyer-fit'],examples:['CRM for a five-person consultancy that uses Gmail and needs automation under a low budget','Project management for a client services agency that needs easy onboarding'],inputModes:['text/plain','application/json'],outputModes:['text/plain','application/json']},
      {id:'compare_for_use_case',name:'Compare for a use case',description:'Compare products for a specific workflow and explain trade-offs, close calls and cheaper-option losses.',tags:['software-comparison','trade-offs','decision-support'],examples:['HubSpot vs Pipedrive for a 5-person consultancy','What do I lose if I choose the cheaper CRM?'],inputModes:['text/plain','application/json'],outputModes:['text/plain','application/json']},
      {id:'find_alternatives',name:'Find alternatives for a reason',description:'Find alternatives because a user dislikes a specific weakness in a current product.',tags:['alternatives','switching','software-decision'],examples:['Alternatives to HubSpot because I find it too expensive','Alternatives to Notion because I want stronger automation'],inputModes:['text/plain','application/json'],outputModes:['text/plain','application/json']}
    ]
  };
}
function a2aArgs(message){
  if(!message||message.role!=='ROLE_USER'||!Array.isArray(message.parts)||!message.parts.length)return {error:'message must be a ROLE_USER message with at least one part'};
  const texts=message.parts.filter(p=>p&&typeof p.text==='string').map(p=>p.text.trim()).filter(Boolean);
  const dataParts=message.parts.filter(p=>p&&p.data&&typeof p.data==='object'&&!Array.isArray(p.data)).map(p=>p.data);
  const data=Object.assign({},...dataParts);
  const args={...data};
  if(!args.job&&args.q)args.job=args.q;
  if(!args.job&&texts.length)args.job=texts.join('\n');
  if(!args.job)return {error:'message must include text or application/json data with job'};
  const invalid=validToolArguments('decide_software',args);if(invalid)return {error:invalid};
  return {args};
}
function recommendationText(data){
  const names=(data?.shortlist||[]).map((r,i)=>`${i+1}. ${r.name} (${r.fit_score}/95 fit, ${r.evidence_confidence} evidence confidence)`).join('\n');
  return `ToolScout shortlist for: ${data.job}\n${names}\n\nToolScout surfaces trade-offs and missing evidence rather than forcing a universal winner. Affiliate relationships do not influence shortlist order.`;
}
async function handleA2A(request,env,ctx){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:A2A_HEADERS});
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{...A2A_HEADERS,Allow:'POST, OPTIONS'}});
  const version=header(request,'A2A-Version');
  if(version!==A2A_VERSION){ctx.waitUntil(logProtocol(env,'a2a','SendMessage',{success:false}));return a2aError(null,-32009,'Version not supported','VERSION_NOT_SUPPORTED',400)}
  let body;try{body=await request.json()}catch{return a2aError(null,-32700,'Invalid JSON payload','JSON_PARSE_ERROR',400)}
  if(!body||body.jsonrpc!=='2.0'||body.id===undefined||typeof body.method!=='string')return a2aError(body?.id??null,-32600,'Request payload validation error','INVALID_REQUEST',400);
  if(body.method!=='SendMessage'){ctx.waitUntil(logProtocol(env,'a2a',body.method,{success:false}));return a2aError(body.id,-32601,'Method not found','METHOD_NOT_FOUND',400)}
  const extracted=a2aArgs(body?.params?.message);
  if(extracted.error){ctx.waitUntil(logProtocol(env,'a2a','SendMessage',{success:false}));return a2aError(body.id,-32602,'Invalid parameters','INVALID_PARAMS',400)}
  const out=await callCatalogTool('decide_software',extracted.args,request,env);
  if(out.error){ctx.waitUntil(logProtocol(env,'a2a','SendMessage',{success:false}));return a2aError(body.id,-32603,'Internal error','DECISION_UNAVAILABLE',500)}
  const incoming=body.params.message,contextId=incoming.contextId||crypto.randomUUID();
  const message={messageId:crypto.randomUUID(),contextId,role:'ROLE_AGENT',parts:[{text:recommendationText(out.data),mediaType:'text/plain'},{data:out.data,mediaType:'application/json'}]};
  ctx.waitUntil(logProtocol(env,'a2a','SendMessage',{resultCount:Number(out.data?.shortlist?.length||0)}));
  return Response.json({jsonrpc:'2.0',id:body.id,result:{message}},{headers:A2A_HEADERS});
}

export async function handleAgentProtocolRoute(request,env,ctx){
  const u=new URL(request.url);
  if(u.pathname==='/.well-known/agent-card.json'&&request.method==='GET')return Response.json(agentCard(),{headers:{...A2A_HEADERS,'Cache-Control':'public, max-age=3600'}});
  if(u.pathname==='/a2a'||u.pathname==='/a2a/')return handleA2A(request,env,ctx);
  if(u.pathname==='/mcp'||u.pathname==='/mcp/')return handleMcp(request,env,ctx);
  return null;
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    const owned=await handleAgentProtocolRoute(request,env,ctx);
    if(owned)return owned;
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};
