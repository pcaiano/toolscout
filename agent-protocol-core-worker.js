import {businessWorkflowGuidance,verifiedPmsCandidates} from './business-workflow-intent.js';
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
      description:'Primary ToolScout decision tool. Turn a specific software job into an evidence-aware shortlist with constraints and trade-offs. Broad business or industry requests receive workflow choices instead of unsupported software matches. Prefer this over catalog search for buying decisions.',
      inputSchema:{
        type:'object',additionalProperties:false,required:['job'],
        properties:{
          job:{type:'string',minLength:3,maxLength:500,description:'The concrete job, workflow or outcome the software must support.'},
          constraints:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:160}},
          must_have:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}},
          avoid:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}},
          budget:{type:'string',enum:['free','low','mid','high']},
          country:{type:'string',pattern:'^[A-Z]{2}$',description:'ISO 3166-1 alpha-2 country for a geographically verified price; missing regional evidence cannot qualify.'},
          seat_count:{type:'integer',minimum:1,maximum:100,description:'Exact paid seat count used only for explicitly labelled before-tax subscription subtotals.'},
          team:{type:'string',enum:['solo','small','team','large','agency']},
          priorities:{type:'array',maxItems:6,uniqueItems:true,items:{type:'string',enum:['price','ease','automation','integrations','sales','ai','marketing','seo','research','content','agency']}},
          existing_tools:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}},
          require_stack_fit:{type:'boolean',description:'When true, every existing tool must have a documented, plan-compatible named integration; otherwise fail closed.'},
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
          existing_tools:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:100}},
          require_stack_fit:{type:'boolean',description:'Require evidence for every named existing-stack integration to award a winner.'}
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
          require_stack_fit:{type:'boolean',description:'Exclude alternatives without evidence for each required stack integration.'},
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
          budget:{type:'string',enum:['free','low','mid','high'],description:'Free-plan checks must have a verified Free-tier entitlement.'},
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
    if(a.require_stack_fit!==undefined&&typeof a.require_stack_fit!=='boolean')return 'require_stack_fit must be boolean';
    if(a.require_stack_fit===true&&(!Array.isArray(a.existing_tools)||!a.existing_tools.length))return 'require_stack_fit requires at least one existing tool';
    if(a.country!==undefined&&(typeof a.country!=='string'||!/^[A-Z]{2}$/.test(a.country)))return 'country must be an ISO 3166-1 alpha-2 code';
    if(a.seat_count!==undefined&&(!Number.isInteger(a.seat_count)||a.seat_count<1||a.seat_count>100))return 'seat_count must be an integer from 1 to 100';
    if(a.limit!==undefined&&(!Number.isInteger(a.limit)||a.limit<2||a.limit>5))return 'limit must be an integer from 2 to 5';
    return null;
  }
  if(name==='compare_for_use_case'){
    if(!Array.isArray(a.tools)||a.tools.length<2||a.tools.length>4||new Set(a.tools.map(x=>String(x).trim().toLowerCase())).size!==a.tools.length)return 'tools must contain 2 to 4 unique tool names or slugs';
    if(a.tools.some(x=>typeof x!=='string'||!x.trim()||x.length>120))return 'each tool must be a non-empty string up to 120 characters';
    if(typeof a.use_case!=='string'||a.use_case.trim().length<3||a.use_case.length>500)return 'use_case must be a string between 3 and 500 characters';
    if(!validStrings(a.must_have,12,100)||!validStrings(a.existing_tools,12,100)||!validBudget(a.budget)||!validTeam(a.team)||!validPriorities(a.priorities))return 'comparison constraints are invalid';
    if(a.require_stack_fit!==undefined&&typeof a.require_stack_fit!=='boolean')return 'require_stack_fit must be boolean';
    if(a.require_stack_fit===true&&(!Array.isArray(a.existing_tools)||!a.existing_tools.length))return 'require_stack_fit requires at least one existing tool';
    return null;
  }
  if(name==='find_alternatives'){
    if(typeof a.tool!=='string'||!a.tool.trim()||a.tool.length>120)return 'tool must be a non-empty string up to 120 characters';
    if(typeof a.dislike!=='string'||a.dislike.trim().length<2||a.dislike.length>300)return 'dislike must be a string between 2 and 300 characters';
    if(!validStrings(a.must_have,12,100)||!validStrings(a.existing_tools,12,100)||!validBudget(a.budget))return 'alternative constraints are invalid';
    if(a.require_stack_fit!==undefined&&typeof a.require_stack_fit!=='boolean')return 'require_stack_fit must be boolean';
    if(a.require_stack_fit===true&&(!Array.isArray(a.existing_tools)||!a.existing_tools.length))return 'require_stack_fit requires at least one existing tool';
    if(a.limit!==undefined&&(!Number.isInteger(a.limit)||a.limit<1||a.limit>5))return 'limit must be an integer from 1 to 5';
    return null;
  }
  if(name==='check_stack_fit'){
    if(!validStrings(a.candidates,5,120)||!Array.isArray(a.candidates)||!a.candidates.length)return 'candidates must contain 1 to 5 tool names or slugs';
    if(!validStrings(a.existing_tools,12,100)||!Array.isArray(a.existing_tools)||!a.existing_tools.length)return 'existing_tools must contain 1 to 12 software names';
    if(!validBudget(a.budget))return 'budget is invalid';
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
// Verified requirements are claim-scoped. A reviewed profile documents the product,
// not automatically every catalog feature, subscription tier or buyer constraint.
function manufacturerClaim(tool,kind,value){
  const needle=catalogNormalize(value);
  if(!needle||!Array.isArray(tool?.decisionClaims))return null;
  for(const claim of tool.decisionClaims){
    if(!claim||claim.type!==kind||claim.status!=='verified')continue;
    if(catalogNormalize(claim.value)!==needle)continue;
    const date=String(claim.verifiedAt||''),source=String(claim.sourceUrl||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^https:\/\//i.test(source))continue;
    const checked=new Date(date+'T00:00:00Z');
    if(!Number.isFinite(checked.valueOf())||checked.toISOString().slice(0,10)!==date||checked.valueOf()>Date.now()||Date.now()-checked.valueOf()>180*86400000)continue;
    try{
      const host=new URL(source).hostname.replace(/^www\./,'');
      const vendor=tool?.sourceUrl?new URL(tool.sourceUrl).hostname.replace(/^www\./,''):null;
      const registered=Array.isArray(tool?.editorialReview?.sourceUrls)&&tool.editorialReview.sourceUrls.includes(source);
      if(vendor&&host!==vendor&&!host.endsWith('.'+vendor)&&!registered)continue;
    }catch{continue}
    return claim;
  }
  return null;
}
function freeTierMatches(tool,plan){
  const normalized=catalogNormalize(plan);
  if(normalized==='free')return true;
  return tool?.pricingDetails?.freePlanStatus==='verified_available'
    &&normalized===catalogNormalize(tool?.pricingDetails?.freePlanAlias)
    &&Boolean(normalized);
}
function verifiedPlans(claim){
  const plan=String(claim?.plan||'').trim();
  if(!plan)return [];
  const extra=Array.isArray(claim?.includedPlans)&&claim.includedPlans.every(p=>typeof p==='string'&&p.length>0&&p.length<70)&&claim.includedPlans.includes(plan)?claim.includedPlans:[plan];
  return [...new Set(extra)];
}
function requirementMatch(tool,requirement,{exclude=false,budget=null}={}){
  const needle=catalogNormalize(requirement).replace(/^(?:(?:must|need|needs|require|requires|support|supports|have|has|with)\s+)+/g,'');
  if(!needle)return {matched:false,strength:0,status:'not_verified'};
  const integrationName=needle.replace(/^(?:integrate|integrates|integration|connect|connects|sync|syncs)\s+(?:with|to)\s+/,'');
  const pair=verifiedIntegrationPair(tool,integrationName);
  if(pair){
    if(budget==='free'&&!exclude&&!freeTierMatches(tool,pair.plan))
      return {matched:false,strength:0,status:'not_verified',evidence:'The named integration is documented, but its eligibility on a Free plan is not proven.'};
    return {matched:true,strength:1,status:'verified',evidence:'Dated manufacturer-documented integration with '+integrationName+'.',verified_at:pair.verifiedAt||pair.verified_at,plan:pair.plan||null,eligible_plans:verifiedPlans(pair)};
  }
  const claim=manufacturerClaim(tool,'capability',needle)||manufacturerClaim(tool,'integration',needle);
  if(claim){
    if(budget==='free'&&!exclude&&!verifiedPlans(claim).some(plan=>freeTierMatches(tool,plan)))return {matched:false,strength:0,status:claim.notAvailableOnFree===true?'conflict':'not_verified',evidence:claim.notAvailableOnFree===true?'Manufacturer confirms the capability is unavailable on Free.':'A Free-plan entitlement for this capability is not documented.',plan:claim.plan||null,eligible_plans:verifiedPlans(claim)};
    return {matched:true,strength:1,status:'verified',evidence:'Dated manufacturer evidence for the exact requested capability.',verified_at:claim.verifiedAt,plan:claim.plan||null,eligible_plans:verifiedPlans(claim)};
  }
  const declared=[tool?.category,...(Array.isArray(tool?.features)?tool.features:[])];
  const listed=declared.map(catalogNormalize).filter(Boolean).some(value=>value===needle||(' '+value+' ').includes(' '+needle+' '));
  if(!listed)return {matched:false,strength:0,status:'not_verified'};
  // Be conservative about explicit exclusions even if a catalog-level claim has
  // not yet been validated feature by feature.
  if(exclude)return {matched:true,strength:0,status:'catalog_declared',evidence:'Catalog describes this unwanted property; exclude until checked.'};
  if(tool?.editorialReview?.verificationStatus==='vendor_documented')
    return {matched:false,strength:0,status:'not_verified',catalog_signal:true,evidence:'Catalog-listed feature lacks a dated manufacturer claim for this exact requirement.'};
  // Legacy unsourced fixtures remain inspectable, but publishable catalog records
  // must first pass the manufacturer-documentation admission contract.
  return {matched:true,strength:0.5,status:'catalog_declared',evidence:'Legacy catalog-declared capability, not independently claim-verified.'};
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
function priceCeiling(raw,seatCount=null){
  const value=String(raw||''),currency=(/[€]|\bEUR\b/i.test(value)?'EUR':null)||(/[$]|\bUSD\b/i.test(value)?'USD':null)||(/[£]|\bGBP\b/i.test(value)?'GBP':null);
  if(!currency)return null;
  const tokens=value.match(/(?:[€$£]|\b(?:EUR|USD|GBP)\b)\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:[€$£]|\b(?:EUR|USD|GBP)\b)/i);
  if(!tokens)return {invalid:true,reason:'Price and currency amount must be explicit; no numeric budget can be inferred.'};
  if([/[€]|\bEUR\b/i.test(value),/[$]|\bUSD\b/i.test(value),/[£]|\bGBP\b/i.test(value)].filter(Boolean).length>1)return {invalid:true,reason:'Mixed EUR and USD price limits are not comparable without an explicit FX rate.'};
  const amount=Number((tokens[1]||tokens[2]).replace(',','.'));
  if(!Number.isFinite(amount)||amount<0)return {invalid:true,reason:'Unsupported price number.'};
  const normalized=value.toLowerCase();
  if(/\b(?:in|for)\s+(?:portugal|spain|france|germany|united states|united kingdom|usa|uk|canada|europe|european union)\b/.test(normalized))return {invalid:true,reason:'Country-specific checkout prices need verified local-currency manufacturer quotes; a global price cannot prove a local payable total.'};
  const annual=/\b(?:billed annually|annual billing|paid annually|annual prepay|yearly billing|per year|a year|yearly|annual commitment)\b/.test(normalized)||/\/year\b/.test(normalized);
  const monthly=/\b(?:billed monthly|monthly billing|monthly payment|monthly commitment)\b/.test(normalized);
  const annualPeriod=/\b(?:per year|a year)\b/.test(normalized)||/\/year\b/.test(normalized);
  const monthlyPeriod=/\b(?:per month|a month|monthly)\b/.test(normalized)||/\/(?:month|mo)\b/.test(normalized);
  if(annual&&monthly)return {invalid:true,reason:'The buyer request conflicts between annual and monthly commitments.'};
  if(!annualPeriod&&!monthlyPeriod&&!monthly)return {invalid:true,reason:'Specify whether the price ceiling is per month or per year.'};
  if(annualPeriod&&monthlyPeriod)return {invalid:true,reason:'Conflicting annual and monthly price ceiling periods.'};
  const unit=/\b(?:per channel|for (?:one|1) channel)\b/.test(normalized)||/\/channel\b/.test(normalized)?'channel':/\b(?:per user|per seat|for (?:one|1) user|for (?:one|1) seat)\b/.test(normalized)||/\/(?:user|seat)\b/.test(normalized)?'seat':null;
  if(unit==='seat'&&/\bfor\s+[2-9][0-9]*\s+(?:users|seats)\b/.test(normalized))return {invalid:true,reason:'A per-user price is not a verified total for multiple seats.'};
  const taxInclusive=/\b(?:incl(?:uding)?\.? (?:vat|tax)|tax included|vat included|with vat|ttc)\b/.test(normalized);
  const totalRequested=/\b(?:total|overall|entire team|all seats|whole team)\b/.test(normalized);
  const beforeTax=/\b(?:before tax|excluding tax|before vat|excluding vat|excl vat|subscription subtotal|licen[sc]e subtotal)\b/.test(normalized);
  const explicitSeatMatch=normalized.match(/\bfor\s+(\d+)\s+(?:billed\s+)?(?:seats|users|members|editors|collaborators)\b/);
  const explicitSeats=explicitSeatMatch?Number(explicitSeatMatch[1]):null;
  if(explicitSeats!==null&&(!Number.isInteger(explicitSeats)||explicitSeats<1||explicitSeats>100))return {invalid:true,reason:'Seat quantities must be between 1 and 100.'};
  if(explicitSeats!==null&&seatCount!==null&&explicitSeats!==seatCount)return {invalid:true,reason:'Buyer seat_count differs from the seats in the price constraint.'};
  const seats=explicitSeats||seatCount||null;
  if(totalRequested&&!beforeTax)return {invalid:true,reason:'Total checkout cost cannot be proven by a pre-tax per-seat quote; taxes, addons and prorations are not verified.'};
  if((totalRequested||beforeTax)&&!seats)return {invalid:true,reason:'A team subtotal requires an exact billed seat count.'};
  if(seats&&seats>1&&unit==='channel')return {invalid:true,reason:'Seat count cannot be applied to per-channel pricing.'};
  return {currency,amount,period:annualPeriod?'year':'month',billingCycle:annual?'annual':monthly?'monthly':null,unit:(totalRequested||beforeTax)?'seat_subtotal':unit,unitQuantity:(totalRequested||beforeTax)?seats:unit?1:null,taxInclusive,seatCount:seats,subtotalOnly:Boolean(totalRequested||beforeTax)};
}
function constraintEvidence(tool,constraints=[],budget=null,country=null,seatCount=null){
  return (constraints||[]).map(raw=>{
    const constraint=String(raw||'').trim(),norm=catalogNormalize(constraint);
    if(!norm)return {constraint,status:'not_verified',evidence:'Empty constraint cannot be evaluated.'};
    // A numerical price ceiling cannot be established from a 0-10 affordability
    // score, and a free plan never implies access to a requested paid feature.
    const price=priceCeiling(constraint,seatCount);
    if(price){
      if(price.invalid)return {constraint,status:'not_verified',evidence:price.reason};
      const candidates=(tool?.decisionClaims||[]).filter(c=>{
        if(c?.type!=='price_quote'||manufacturerClaim(tool,'price_quote',c.value)!==c)return false;
        if(c.currency!==price.currency||!Number.isFinite(c.amount)||c.amount<0||!c.plan)return false;
        if(c.billingCycle!=='monthly'&&c.billingCycle!=='annual')return false;
        if(price.billingCycle&&c.billingCycle!==price.billingCycle)return false;
        if(!price.billingCycle&&c.billingCycle!=='monthly')return false;
        if(c.market!==String(country||'unspecified').toUpperCase()&&!(c.market==='unspecified'&&!country))return false;
        if(price.taxInclusive&&c.taxStatus!=='included')return false;
        if(c.unit==='channel'&&!(price.unit==='channel'&&price.unitQuantity===1))return false;
        if(c.unit!=='channel'&&price.unit==='channel')return false;
        if(c.unit==='seat'&&!((price.unit==='seat'&&price.unitQuantity===1)||(price.unit==='seat_subtotal'&&price.seatCount)))return false;
        if(c.unit!=='seat'&&(price.unit==='seat'||price.unit==='seat_subtotal'))return false;
        if(!price.unit&&c.unit!=='subscription')return false;
        if(budget==='free'&&!freeTierMatches(tool,c.plan))return false;
        if(!Number.isFinite(c.chargeAmount)||c.chargeAmount<0)return false;
        if(c.billingCycle==='monthly'&&Math.abs(c.chargeAmount-c.amount)>0.00001)return false;
        if(c.billingCycle==='annual'&&Math.abs(c.chargeAmount/12-c.amount)>0.011)return false;
        return true;
      });
      if(!candidates.length)return {constraint,status:'not_verified',evidence:'No matching first-party price for the requested currency, territory, tax treatment, billing commitment and unit. FX and annual prepayment are never assumed.'};
      const seatQuantity=c=>c.unit==='seat'&&price.unit==='seat_subtotal'?price.seatCount:1;
      const eligible=candidates.filter(c=>price.period==='year'
        ?c.billingCycle==='annual'&&c.chargeAmount*seatQuantity(c)<=price.amount+0.001
        :c.amount*seatQuantity(c)<=price.amount+0.001).sort((a,b)=>a.amount*seatQuantity(a)-b.amount*seatQuantity(b));
      const affordable=eligible[0];
      if(!affordable)return {constraint,status:'not_verified',evidence:'No published quote meets the ceiling in this billing and currency scenario; unrecorded prices are unknown.'};
      return {constraint,status:'verified',evidence:'Manufacturer-published price for this exact currency, plan, billing commitment and unit. Applicable taxes and regional checkout totals may differ.',plan:affordable.plan,currency:affordable.currency,monthly_equivalent:affordable.amount,charge_amount:affordable.chargeAmount,billing_cycle:affordable.billingCycle,market:affordable.market,tax_status:affordable.taxStatus,unit:affordable.unit,seat_count:price.seatCount,seat_monthly_subtotal:affordable.unit==='seat'&&price.seatCount?Number((affordable.amount*price.seatCount).toFixed(2)):null,seat_invoice_subtotal:affordable.unit==='seat'&&price.seatCount?Number((affordable.chargeAmount*price.seatCount).toFixed(2)):null,price_scope:price.subtotalOnly?'seat_subscription_subtotal_before_tax':'quoted_unit_price_before_unknown_taxes',verified_at:affordable.verifiedAt,eligible_plans:[...new Set(eligible.map(c=>c.plan))],price_options:eligible.map(c=>({plan:c.plan,currency:c.currency,monthly_equivalent:c.amount,charge_amount:c.chargeAmount,billing_cycle:c.billingCycle,market:c.market,tax_status:c.taxStatus,unit:c.unit,seat_count:price.seatCount,seat_monthly_subtotal:c.unit==='seat'&&price.seatCount?Number((c.amount*price.seatCount).toFixed(2)):null,seat_invoice_subtotal:c.unit==='seat'&&price.seatCount?Number((c.chargeAmount*price.seatCount).toFixed(2)):null,price_scope:price.subtotalOnly?'seat_subscription_subtotal_before_tax':'quoted_unit_price_before_unknown_taxes',verified_at:c.verifiedAt}))};
    }
    // Numerical requirements need matching unit, billing/usage period, scope,
    // manufacturer source and tier. "300/day" is not proof of "300/month".
    const volume=norm.match(/(?:at least|minimum|need|requires?|must support|support)\s+(\d+)\s+(?:(stored|automation|active|open|monthly|daily)\s+)?(tasks|users|seats|channels|accounts|emails|contacts|responses|submissions|collaborators|records|spaces|funnels|workflows|credits|events|automations|teams|urls|forms|pipelines|deals|calendars|inboxes)\b/);
    if(volume){
      const qty=Number(volume[1]),modifier=volume[2]||'',unit=volume[3]==='responses'?'submissions':volume[3];
      const explicitMonth=/\b(?:per month|a month|monthly|month)\b/.test(norm)||modifier==='monthly';
      const explicitDay=/\b(?:per day|a day|daily|day)\b/.test(norm)||modifier==='daily';
      const period=explicitMonth?'month':explicitDay?'day':null;
      if(explicitMonth&&explicitDay)return {constraint,status:'not_verified',evidence:'The buyer request mixes daily and monthly limits.'};
      const recurring=new Set(['tasks','emails','submissions','credits','events']);
      if(recurring.has(unit)&&!period)return {constraint,status:'not_verified',evidence:'Specify a daily or monthly volume; ToolScout cannot assume the usage period.'};
      const scope=unit==='contacts'?(modifier==='automation'||/\bautomation\b/.test(norm)?'automation':modifier==='stored'||/\b(?:stored|audience|list)\b/.test(norm)?'stored':null):unit==='deals'&&modifier==='open'?'open':unit==='records'&&/\bper base\b/.test(norm)?'per_base':null;
      if(unit==='contacts'&&!scope)return {constraint,status:'not_verified',evidence:'Specify stored contacts or contacts entering automations; the two limits are different.'};
      if(unit==='deals'&&!scope)return {constraint,status:'not_verified',evidence:'Clarify whether the deal capacity refers to open deals or total deal records.'};
      if(unit==='records'&&!scope&&(tool?.decisionClaims||[]).some(c=>c?.type==='plan_limit'&&c.unit==='records'&&c.scope))return {constraint,status:'not_verified',evidence:'Record capacity is scoped; specify per base or the relevant product-specific scope.'};
      const limits=(tool?.decisionClaims||[]).filter(c=>{
        if(c?.type!=='plan_limit'||manufacturerClaim(tool,'plan_limit',c.value)!==c)return false;
        if(c.unit!==unit||!Number.isFinite(Number(c.quantity))||!c.plan)return false;
        if(budget==='free'&&!freeTierMatches(tool,c.plan))return false;
        if(period&&c.period!==period)return false;
        if(!period&&c.period!=='total')return false;
        return scope?c.scope===scope:!c.scope;
      });
      const quoteCapacities=(tool?.decisionClaims||[]).filter(c=>{
        if(c?.type!=='price_quote'||manufacturerClaim(tool,'price_quote',c.value)!==c||budget==='free')return false;
        const u=c.usageTier;
        return u&&u.unit===unit&&u.period===(period||'total')&&Number.isFinite(Number(u.quantity))&&u.quantity>0
          &&!scope&&c.plan&&c.unit==='subscription';
      }).map(c=>({quantity:c.usageTier.quantity,unit,plan:c.plan,period:c.usageTier.period,verifiedAt:c.verifiedAt,scope:null}));
      limits.push(...quoteCapacities);
      if(!limits.length)return {constraint,status:'not_verified',evidence:'No dated manufacturer evidence for this exact volume, plan, period and scope.'};
      const suitable=limits.find(c=>Number(c.quantity)>=qty);
      return suitable
        ?{constraint,status:'verified',evidence:'Manufacturer-documented capacity matches the requested unit, period and scope.',plan:suitable.plan,quantity:Number(suitable.quantity),unit,period:suitable.period,scope:suitable.scope||null,verified_at:suitable.verifiedAt,eligible_plans:[...new Set(limits.filter(c=>Number(c.quantity)>=qty).map(c=>c.plan))]}
        :{constraint,status:'not_verified',evidence:'No documented eligible plan meets this quantity; unrecorded higher tiers remain unknown.'};
    }
    const freeIntent=/^(?:must |need |needs |require |requires |required |only )?(?:free|free plan|no cost)(?: only)?$/.test(norm);
    if(freeIntent){
      if(tool?.freePlanKnown!==true)return {constraint,status:'not_verified',evidence:'Free-plan availability has not been independently verified in the current ToolScout catalog.'};
      return tool.freePlan
        ?{constraint,status:'verified',evidence:'Manufacturer-documented free-plan availability; individual feature entitlements require separate proof.'}
        :{constraint,status:'conflict',evidence:'The manufacturer documentation records no available free plan.'};
    }
    const stripped=norm.replace(/\b(?:must|needs?|need|requires?|require|required|support|supports|with|only|be|have|has)\b/g,' ').replace(/\s+/g,' ').trim();
    const integrationName=norm.replace(/^(?:must|needs?|need|requires?|require|required|support|supports|with|only)\s+/,'').replace(/^(?:integrate|integrates|integration|connect|connects|sync|syncs)\s+(?:(?:with|to)\s+)?/,'');
    const pair=verifiedIntegrationPair(tool,integrationName);
    if(pair){
      if(budget==='free'&&!freeTierMatches(tool,pair.plan))
        return {constraint,status:'not_verified',evidence:'Integration documented, but not for this Free plan.'};
      return {constraint,status:'verified',evidence:'Manufacturer-documented named integration.',verified_at:pair.verifiedAt||pair.verified_at,plan:pair.plan||null,eligible_plans:verifiedPlans(pair)};
    }
    const exact=manufacturerClaim(tool,'capability',stripped)||manufacturerClaim(tool,'capability',norm)||manufacturerClaim(tool,'integration',integrationName);
    if(exact){
      if(budget==='free'&&!verifiedPlans(exact).some(plan=>freeTierMatches(tool,plan)))return {constraint,status:exact.notAvailableOnFree===true?'conflict':'not_verified',evidence:exact.notAvailableOnFree===true?'Manufacturer confirms the capability is unavailable on Free.':'No Free-plan entitlement recorded for this capability.',plan:exact.plan||null,eligible_plans:verifiedPlans(exact)};
      return {constraint,status:'verified',evidence:'Dated manufacturer documentation proves this exact capability.',verified_at:exact.verifiedAt,plan:exact.plan||null,eligible_plans:verifiedPlans(exact)};
    }
    if(tool?.editorialReview?.verificationStatus==='vendor_documented')
      return {constraint,status:'not_verified',evidence:'Product documentation exists, but this individual requirement and plan are not independently evidenced.'};
    const legacy=explicitTextMatch(tool,norm)||(stripped&&explicitTextMatch(tool,stripped));
    if(legacy)return {constraint,status:'verified',evidence:'Legacy catalog field describes the requirement; current published catalog requires claim-level evidence.'};
    return {constraint,status:'not_verified',evidence:'ToolScout does not currently store explicit evidence that this product satisfies the requirement.'};
  });
}
// A high fit score cannot overrule a mandatory buyer requirement.
// Soft preferences remain ranked trade-offs. Requirements marked "must",
// "required", "only", "no" or "without" are exclusionary when not evidenced.
function hardBuyerConstraint(value){
  if(priceCeiling(value))return true;
  const normalized=catalogNormalize(value);
  if(/(?:[€$£]|\b(?:EUR|USD|GBP)\b)\s*\d|\d\s*(?:[€$£]|\b(?:EUR|USD|GBP)\b)/i.test(String(value||'')))return true;
  if(/\b(?:at least|minimum)\s+\d+\s+(?:stored\s+|automation\s+|active\s+|open\s+|monthly\s+|daily\s+)?(?:tasks|users|seats|channels|accounts|emails|contacts|responses|submissions|collaborators|records|spaces|funnels|workflows|credits|events|automations|teams|urls|forms|pipelines|deals|calendars|inboxes)\b/.test(normalized))return true;
  return /^(?:must\b|mandatory\b|required\b|require\b|requires\b|only\b|no\b|without\b|cannot\b|need\s+to\b|needs\s+to\b|has\s+to\b|have\s+to\b)/.test(normalized);
}
function decisionBlockers(evaluated,args={}){
  const reasons=[];
  if(evaluated.plan_coherence?.status==='not_verified')reasons.push('No manufacturer-documented single plan proves all mandatory buying requirements simultaneously.');
  if(evaluated.category_review_required)reasons.push('ToolScout category classification is pending review.');
  for(const req of evaluated.requirement_evidence||[])
    if(!req.matched)reasons.push('Mandatory capability lacks claim-level manufacturer evidence: '+req.requirement);
  if(args.budget==='free'&&!(evaluated.free_plan_verified&&evaluated.free_plan))
    reasons.push('A documented free plan is required but not confirmed.');
  if(args.require_stack_fit===true)for(const pair of evaluated.stack_fit?.pairs||[])
    if(pair.status!=='verified'||pair.proof_scope==='ai_interoperability_only')reasons.push('Mandatory stack integration with '+pair.existing_tool+' is not verified on the requested plan.');
  for(const c of evaluated.constraint_evidence||[])
    if(hardBuyerConstraint(c.constraint)&&c.status!=='verified')
      reasons.push('Mandatory constraint cannot be confirmed: '+c.constraint+' ('+c.status+').');
  for(const avoid of evaluated.avoid_evidence||[])
    if(avoid.matched)reasons.push('Matches an expressly excluded capability: '+avoid.requirement);
  return [...new Set(reasons)];
}
function qualifyDecision(evaluated,args){
  const blocking_reasons=decisionBlockers(evaluated,args);
  return {...evaluated,qualified_for_use_case:blocking_reasons.length===0,blocking_reasons};
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
    {category:'vacation rental',pattern:/\b(airbnb|vacation rental|short term rental|holiday rental|alojamento local)\b/},
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
  const dedicatedJob=explicitCategories.some(cat=>cat!=='business'&&cat!=='vacation rental')||familyMatches.some(cat=>cat!=='vacation rental');
  const primaryIndustry=familyMatches.includes('vacation rental')&&!dedicatedJob;
  return {normalized,explicitCategories:primaryIndustry?['vacation rental']:(explicitCategories.length?explicitCategories:familyMatches),intentTerms};
}
function matchesJobIntent(tool,profile){
  const category=catalogNormalize(tool?.category),hay=' '+toolHay(tool)+' ';
  if(profile.explicitCategories.length)return profile.explicitCategories.includes(category);
  if(!profile.intentTerms.length)return false;
  return profile.intentTerms.some(term=>category===term||hay.includes(' '+term+' '));
}
function stackAssessment(tool,existingTools=[],{budget=null}={}){
  const ai=aiIntegration(tool),hay=toolHay(tool),pairs=[];
  for(const existing of existingTools||[]){
    const n=catalogNormalize(existing);
    if(!n)continue;
    const pair=verifiedIntegrationPair(tool,existing);
    if(pair){
      const eligiblePlans=verifiedPlans(pair);
      if(budget==='free'&&!eligiblePlans.some(plan=>freeTierMatches(tool,plan))){
        pairs.push({existing_tool:existing,status:'pair_unverified',evidence:'Named integration is documented, but an entitlement for this exact Free plan is not verified.',verified_at:pair.verifiedAt||pair.verified_at,eligible_plans:eligiblePlans});
        continue;
      }
      pairs.push({existing_tool:existing,status:'verified',evidence:'Verified named integration with '+existing+'.',verified_at:pair.verifiedAt||pair.verified_at,eligible_plans:eligiblePlans});
      continue;
    }
    const assistant=ai.status==='verified'?(ai.assistants||[]).find(x=>catalogNormalize(x)===n):null;
    if(assistant){pairs.push({existing_tool:existing,status:budget==='free'?'pair_unverified':'verified',proof_scope:'ai_interoperability_only',evidence:'Verified AI interoperability with '+assistant+', but no plan-specific named integration entitlement is recorded.'});continue}
    if((tool.features||[]).some(x=>catalogNormalize(x)==='integrations')||scoreOf(tool,'integrations')>=8){
      pairs.push({existing_tool:existing,status:'pair_unverified',evidence:'Strong general integration capability, but ToolScout does not currently store verified product-specific evidence for '+existing+'.'});
      continue;
    }
    pairs.push({existing_tool:existing,status:'unknown',evidence:'No product-specific integration evidence is currently stored for '+existing+'.'});
  }
  const verified=pairs.filter(x=>x.status==='verified').length;
  return {pairs,verified_pairs:verified,unknown_pairs:pairs.length-verified,summary:pairs.length?verified===pairs.length?'All requested stack links have catalog evidence.':verified?'Some stack links are evidenced; the rest should be verified before switching.':'ToolScout does not currently have pair-specific evidence for this stack; do not assume compatibility.':'No existing stack supplied.'};
}
function buyerValidationPlan(tool,args,constraints,stack){
  // The manufacturer's documentary review is already stored privately.
  // These are honest pre-purchase actions, not claims that ToolScout has tested a tool.
  const checks=[];
  const reviewed=String(tool?.editorialReview?.buyerCheck||'').trim();
  if(reviewed)checks.push(reviewed);
  for(const pair of (stack?.pairs||[]).filter(pair=>pair.status!=='verified'))
    checks.push('Verify a product-specific integration between '+tool.name+' and '+pair.existing_tool+' before relying on this workflow.');
  for(const item of (constraints||[]).filter(item=>item.status!=='verified'))
    checks.push('Confirm this requirement against the exact product and plan: '+item.constraint+'.');
  if(args?.budget==='free'&&tool?.freePlanKnown===true&&tool?.freePlan)
    checks.push('Recheck free-plan usage limits and feature entitlements for the actual workflow.');
  else if(args?.budget)
    checks.push('Confirm current total subscription cost, billing terms and the features included in the intended tier.');
  if((args?.priorities||[]).includes('ai')&&tool?.aiIntegration?.status!=='verified')
    checks.push('Confirm current named AI integrations and access conditions; ToolScout has not verified them for this product.');
  if(!checks.length)checks.push('Run the specific workflow with representative data and verify the limits before purchase.');
  return [...new Set(checks)].slice(0,6);
}
function coherentBuyerPlan(must,constraints){
  const required=[
    ...(must||[]).map(x=>({kind:'feature',verified:x.matched===true,plans:x.eligible_plans||[]})),
    ...(constraints||[]).filter(x=>hardBuyerConstraint(x.constraint)).map(x=>({kind:Array.isArray(x.price_options)?'price':'constraint',verified:x.status==='verified',plans:x.eligible_plans||[]}))
  ];
  if(required.length<2)return {status:'not_required',selected_plan:null};
  if(required.some(x=>!x.verified))return {status:'incomplete',selected_plan:null};
  const priced=required.some(x=>x.kind==='price');
  const explicit=required.filter(x=>x.plans.length);
  if(!priced&&explicit.length<2)return {status:'not_required',selected_plan:null};
  if(priced&&explicit.length!==required.length)return {status:'not_verified',selected_plan:null,evidence:'Some required features or capacities have no verified entitlement on the priced tier.'};
  const shared=explicit.reduce((acc,x)=>acc.filter(p=>x.plans.some(t=>catalogNormalize(t)===catalogNormalize(p))),explicit[0]?.plans||[]);
  if(!shared.length)return {status:'not_verified',selected_plan:null,evidence:'No single manufacturer-documented plan satisfies all mandatory price, capacity and capability requirements.'};
  const quotes=(constraints||[]).flatMap(x=>Array.isArray(x.price_options)?x.price_options:[])
    .filter(x=>shared.some(p=>catalogNormalize(x.plan)===catalogNormalize(p)))
    .sort((a,b)=>a.monthly_equivalent-b.monthly_equivalent);
  const selected=quotes[0]?.plan||shared[0];
  return {status:'verified',selected_plan:selected,evidence:'One manufacturer-documented plan satisfies the combined verified buying requirements.'};
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
  for(const req of args.must_have||[])if(requirementMatch(tool,req,{budget:args.budget}).matched)relevance+=5;
  const dims=requestedDimensions(args);
  const dimScores=dims.map(key=>({dimension:key,score:scoreOf(tool,key)})).filter(x=>x.score!=null);
  const dimAvg=dimScores.length?dimScores.reduce((s,x)=>s+x.score,0)/dimScores.length:5;
  const budget=budgetSignal(tool,args.budget),team=teamSignal(tool,args.team);
  const must=(args.must_have||[]).map(x=>({requirement:x,...requirementMatch(tool,x,{budget:args.budget})}));
  const avoids=(args.avoid||[]).map(x=>({requirement:x,...requirementMatch(tool,x,{exclude:true})}));
  const initialConstraints=constraintEvidence(tool,args.constraints||[],args.budget,args.country||null,args.seat_count||null);
  const stack=stackAssessment(tool,args.existing_tools||[],{budget:args.budget});
  const required= args.require_stack_fit===true?[...must,...stack.pairs.map(pair=>({matched:pair.status==='verified'&&pair.proof_scope!=='ai_interoperability_only',eligible_plans:pair.eligible_plans||[]}))]:must;
  const planCoherence=coherentBuyerPlan(required,initialConstraints);
  const constraints=initialConstraints.map(x=>{
    if(planCoherence.status!=='verified'||!x.price_options?.length)return x;
    const price=x.price_options.find(p=>catalogNormalize(p.plan)===catalogNormalize(planCoherence.selected_plan));
    return price?{...x,...price}:x;
  });
  const mustMatched=must.filter(x=>x.matched).length;
  const avoidHits=avoids.filter(x=>x.matched).length;
  const constraintVerified=constraints.filter(x=>x.status==='verified').length;
  const constraintUnverified=constraints.filter(x=>x.status==='not_verified').length;
  const constraintConflicts=constraints.filter(x=>x.status==='conflict').length;
  const raw=12+Math.min(38,relevance)+((dimAvg-5)*4)+budget.points+team.points+mustMatched*3+constraintVerified*3-constraintUnverified*7-constraintConflicts*22-avoidHits*12;
  const fit=clamp(Math.round(raw),0,95);
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
    evidence_confidence:(must.length||constraints.length)?(must.every(x=>x.status==='verified')&&constraints.every(x=>x.status==='verified')&&stack.unknown_pairs===0?'high':'limited'):confidence,
    claim_evidence_policy:'manufacturer_claim_level_for_documented_catalog',
    advantages,
    tradeoffs:[...new Set([...tradeoffs,...(Array.isArray(tool.limitations)?tool.limitations:[]).filter(Boolean).slice(0,2)])],
    decision_rationale:tool.editorialReview?.summary||null,
    buyer_validation_plan:buyerValidationPlan(tool,args,constraints,stack),
    verification_basis:primaryProof?'manufacturer documentation recorded internally; fit scores are editorial estimates':'manufacturer evidence incomplete; do not interpret fit score as verification',
    requested_dimensions:dimScores,
    requirement_evidence:must,
    avoid_evidence:avoids,
    constraint_evidence:constraints,
    constraint_summary:{verified:constraintVerified,not_verified:constraintUnverified,conflicts:constraintConflicts},
    plan_coherence:planCoherence,
    stack_fit:stack
  };
}
function decisionCandidates(tools,args){
  const evaluated=tools.map(t=>qualifyDecision(decisionEvaluation(t,args),args));
  const profile=jobIntentProfile(tools,args.job||args.use_case||'');
  const relevant=evaluated.filter(x=>{
    const source=tools.find(t=>t.slug===x.slug);
    return source&&!source.categoryReviewRequired&&(source.category!=='vacation-rental'||verifiedPmsCandidates([source]).length>0)?matchesJobIntent(source,profile):false;
  });
  // 'must_have' is a hard gate. A product with unverified requirements can be
  // compared explicitly but must not appear as a qualified recommendation.
  const qualified=relevant.filter(x=>x.qualified_for_use_case);
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
    const guidance=businessWorkflowGuidance(args.job,{},tools);
    if(guidance)return {data:{
      job:args.job,shortlist:[],decision_status:'needs_workflow_selection',
      workflow_guidance:guidance,
      decision_basis:{
        must_have:args.must_have||[],constraints:args.constraints||[],
        existing_tools:args.existing_tools||[],
        methodology:'This request describes an industry or whole business, not one verifiable software job. ToolScout separates workflows before ranking. It has no manufacturer-verified vacation-rental PMS in the current catalog; adjacent tools are not presented as end-to-end property managers.',
        no_pay_to_rank:true
      },
      affiliate_disclosure:disclosure
    }};
    const limit=Math.max(2,Math.min(5,args.limit||3));
    const shortlist=decisionCandidates(tools,args).filter(x=>x.fit_score>0).slice(0,limit);
    if(!shortlist.length)return {error:'ToolScout cannot qualify a recommendation with the current catalog evidence and mandatory criteria. Unverified requirements are not treated as satisfied.',status:422,data:{job:args.job,shortlist:[],decision_status:'no_qualified_candidate'}};
    const dims=requestedDimensions(args);
    return {data:{
      job:args.job,
      shortlist,
      decision_basis:{
        dimensions:dims,
        constraints:args.constraints||[],
        hard_constraints:(args.constraints||[]).filter(hardBuyerConstraint),
        must_have:args.must_have||[],
        avoid:args.avoid||[],
        budget:args.budget||null,
        team:args.team||null,
        existing_tools:args.existing_tools||[],
        require_stack_fit:args.require_stack_fit===true,
        methodology:'Deterministic ToolScout catalog fit. Candidates must first match the requested job/category and satisfy all evidence-backed must-haves to appear in a qualified shortlist. Manufacturer-level editorial sourcing does not automatically prove an individual requirement; a documented profile needs claim-level first-party evidence. Missing evidence is not a confirmed capability. A free-only budget excludes products without verified free plans. Scores then combine explicit priorities, budget/team signals, must-have evidence, free-form constraint evidence and known stack evidence. Every free-form constraint is returned as verified, not_verified or conflict. Currency, country, taxes, per-channel units and billing-cycle commitments are strict price gates, never inferred from generic price scores or FX conversions; missing product-specific integration evidence is never upgraded from a generic text match.',
        no_pay_to_rank:true
      },
      affiliate_disclosure:disclosure
    }};
  }
  if(name==='compare_for_use_case'){
    const found=[],missing=[];
    for(const value of args.tools){const tool=findCatalogTool(tools,value);if(tool)found.push(tool);else missing.push(value)}
    if(found.length<2)return {error:'At least two requested tools must exist in the ToolScout catalog.',status:404,data:{missing}};
    const evalArgs={job:args.use_case,use_case:args.use_case,must_have:args.must_have||[],budget:args.budget,team:args.team,priorities:args.priorities||[],existing_tools:args.existing_tools||[],require_stack_fit:args.require_stack_fit===true};
    const evaluated=found.map(t=>qualifyDecision(decisionEvaluation(t,evalArgs),evalArgs)).sort((a,b)=>Number(b.qualified_for_use_case)-Number(a.qualified_for_use_case)||b.fit_score-a.fit_score);
    const qualified=evaluated.filter(x=>x.qualified_for_use_case);
    const dims=requestedDimensions(evalArgs),gap=qualified.length>=2?qualified[0].fit_score-qualified[1].fit_score:null;
    const priceRank=[...evaluated].filter(x=>scoreOf(found.find(t=>t.slug===x.slug),'price')!=null)
      .sort((a,b)=>(scoreOf(found.find(t=>t.slug===b.slug),'price')||0)-(scoreOf(found.find(t=>t.slug===a.slug),'price')||0));
    const affordable=priceRank[0]||null;
    const leader=qualified[0]||null;
    const losses=affordable&&leader?dims.filter(d=>d!=='price').map(d=>{
      const at=found.find(t=>t.slug===affordable.slug),lt=found.find(t=>t.slug===leader.slug);
      const av=scoreOf(at,d),lv=scoreOf(lt,d);
      return av!=null&&lv!=null&&lv-av>=2?{dimension:d,affordability_leader:av,best_fit_leader:lv,gap:lv-av}:null;
    }).filter(Boolean):[];
    return {data:{
      use_case:args.use_case,
      tools:evaluated,
      missing,
      verdict:!leader?{type:'no_qualified_winner',reason:'None of the compared products has catalog evidence satisfying every mandatory criterion; a fit score alone cannot establish suitability.',score_gap:null}:qualified.length===1?{type:'best_fit',tool:leader.name,reason:'Only compared product with evidence satisfying the supplied mandatory criteria. Check its disclosed limitations before purchasing.',score_gap:null}:gap>=4?{type:'best_fit',tool:leader.name,reason:'Highest editorial fit among products satisfying the supplied mandatory criteria.',score_gap:gap}:{type:'close_call',tools:qualified.slice(0,2).map(x=>x.name),reason:'Qualified fit scores are close; decide using the explicit trade-offs rather than a forced winner.',score_gap:gap},
      tradeoffs:pairwiseTradeoffs(evaluated,dims),
      cheaper_option_analysis:affordable?{affordability_leader:affordable.name,qualified_for_use_case:affordable.qualified_for_use_case,blocking_reasons:affordable.blocking_reasons,pricing_signal:affordable.pricing,note:'Affordability is inferred from ToolScout price score and catalog pricing text, not a live quote. A cheaper option that fails mandatory requirements is not a recommended substitute.',what_you_may_lose_vs_best_fit:losses}: {note:'No comparable affordability score is available.'},
      affiliate_disclosure:disclosure
    }};
  }
  if(name==='find_alternatives'){
    const source=findCatalogTool(tools,args.tool);
    if(!source)return {error:'Source tool not found in the ToolScout catalog.',status:404,data:{tool:args.tool}};
    const dims=requestedDimensions({dislike:args.dislike});
    const sourceEval=decisionEvaluation(source,{job:source.category,priorities:dims,must_have:args.must_have||[],budget:args.budget,existing_tools:args.existing_tools||[]});
    const candidates=tools.filter(t=>t.slug!==source.slug&&catalogNormalize(t.category)===catalogNormalize(source.category)).map(t=>{
      const altArgs={job:source.category,priorities:dims,must_have:args.must_have||[],budget:args.budget,existing_tools:args.existing_tools||[],require_stack_fit:args.require_stack_fit===true};
      const ev=qualifyDecision(decisionEvaluation(t,altArgs),altArgs);
      const improvements=[],sacrifices=[];
      for(const d of [...new Set([...dims,'price','ease','automation','integrations'])]){
        const ss=scoreOf(source,d),cs=scoreOf(t,d);if(ss==null||cs==null)continue;
        if(cs-ss>=1)improvements.push({dimension:d,from:ss,to:cs});
        if(ss-cs>=1)sacrifices.push({dimension:d,from:ss,to:cs});
      }
      const reasonLift=improvements.filter(x=>dims.includes(x.dimension)).reduce((s,x)=>s+x.to-x.from,0);
      return {...ev,improvements_over_source:improvements,tradeoffs_vs_source:sacrifices,alternative_score:ev.fit_score+reasonLift*4};
    }).filter(x=>x.qualified_for_use_case&&(x.improvements_over_source.some(y=>dims.includes(y.dimension))||!dims.length)).sort((a,b)=>b.alternative_score-a.alternative_score).slice(0,Math.max(1,Math.min(5,args.limit||3)));
    return {data:{source:publicTool(source),reason:args.dislike,decision_dimensions:dims,alternatives:candidates,affiliate_disclosure:disclosure}};
  }
  if(name==='check_stack_fit'){
    const found=[],missing=[];
    for(const value of args.candidates){const tool=findCatalogTool(tools,value);if(tool)found.push(tool);else missing.push(value)}
    const candidates=found.map(t=>({tool:publicTool(t),stack_fit:stackAssessment(t,args.existing_tools,{budget:args.budget}),integration_score:scoreOf(t,'integrations'),use_case:args.use_case||null}));
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