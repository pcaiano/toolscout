import base from './content-engine-intelligence-worker.js';

const PROTOCOL_VERSION='2026-07-28';
const A2A_VERSION='1.0';
const SERVER_INFO={name:'ToolScout',version:'1.1.0',websiteUrl:'https://trytoolscout.org/'};
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
      name:'recommend_tools',
      title:'Recommend software with ToolScout',
      description:'Return deterministic ToolScout software recommendations for a job, persona, budget, team and priority. Affiliate relationships do not influence ranking.',
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
      title:'Search the ToolScout software catalog',
      description:'Search ToolScout by tool name, category, feature, use case or AI interoperability. Returns catalog matches without inventing personalised match percentages.',
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
      title:'Compare software with ToolScout',
      description:'Return a factual side-by-side comparison of two to four ToolScout catalog tools. Affiliate participation never changes the comparison order or facts.',
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
  if(name==='recommend_tools')return validRecommendArguments(a);
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
    features:Array.isArray(tool.features)?tool.features:[],
    best_for:Array.isArray(tool.bestFor)?tool.bestFor:[],
    ai_integration:aiIntegration(tool),
    last_verified:tool.lastVerified||null,
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
async function callCatalogTool(name,args,request,env){
  let tools;
  try{tools=await loadCatalog(request,env)}catch{return {error:'ToolScout catalog is temporarily unavailable.',status:503}}
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
  const client=mcpClient(body),envelopeError=validateEnvelope(request,body);
  if(envelopeError){ctx.waitUntil(logProtocol(env,'mcp',body.method,{...client,success:false}));return rpcError(body.id,envelopeError.code,envelopeError.message,envelopeError.data,400)}
  if(body.method==='server/discover'){ctx.waitUntil(logProtocol(env,'mcp','server/discover',client));return rpc(body.id,{supportedVersions:[PROTOCOL_VERSION],capabilities:{tools:{listChanged:false}},instructions:'ToolScout is a read-only software decision engine. Use recommend_tools for fit-based ranking, search_tools for catalog discovery, get_tool for product facts, compare_tools for side-by-side facts, and get_ai_compatibility for verified AI interoperability. Affiliate relationships never influence ranking, search order, comparison order or factual output.',ttlMs:3600000,cacheScope:'public'})}
  if(body.method==='tools/list'){ctx.waitUntil(logProtocol(env,'mcp','tools/list',client));return rpc(body.id,{tools:toolDefinitions(),ttlMs:3600000,cacheScope:'public'})}
  if(body.method==='tools/call'){
    const name=String(body?.params?.name||''),known=new Set(toolDefinitions().map(t=>t.name));
    if(!known.has(name)){ctx.waitUntil(logProtocol(env,'mcp','tools/call',{...client,success:false}));return rpcError(body.id,-32602,'Unknown tool',{name:name||null},400)}
    const args=body?.params?.arguments||{},invalid=validToolArguments(name,args);
    if(invalid){ctx.waitUntil(logProtocol(env,'mcp','tools/call',{...client,success:false}));return rpc(body.id,{content:[{type:'text',text:invalid}],isError:true})}
    const out=name==='recommend_tools'?await callRecommend(args,request,env,ctx):await callCatalogTool(name,args,request,env);
    if(out.error){ctx.waitUntil(logProtocol(env,'mcp','tools/call',{...client,success:false}));return rpc(body.id,{content:[{type:'text',text:out.error}],structuredContent:out.data||{error:out.error},isError:true})}
    const resultCount=Number(out.data?.count??(out.data?.tool?1:0));
    ctx.waitUntil(logProtocol(env,'mcp','tools/call',{...client,resultCount:Number.isFinite(resultCount)?resultCount:null}));
    return rpc(body.id,{content:[{type:'text',text:JSON.stringify(out.data)}],structuredContent:out.data,isError:false});
  }
  ctx.waitUntil(logProtocol(env,'mcp',body.method,{...client,success:false}));
  return rpcError(body.id,-32601,'Method not found',{method:body.method},400);
}
function agentCard(){
  return {
    name:'ToolScout Software Recommendation Agent',
    description:'Read-only software decision agent that turns a software job, persona and constraints into deterministic ToolScout recommendations. Affiliate relationships do not influence ranking.',
    version:'1.0.0',
    provider:{organization:'ToolScout',url:'https://trytoolscout.org/'},
    documentationUrl:'https://trytoolscout.org/agents.md',
    iconUrl:'https://trytoolscout.org/embed/badge.svg',
    supportedInterfaces:[{url:'https://trytoolscout.org/a2a',protocolBinding:'JSONRPC',protocolVersion:A2A_VERSION}],
    capabilities:{streaming:false,pushNotifications:false,extendedAgentCard:false},
    defaultInputModes:['text/plain','application/json'],
    defaultOutputModes:['text/plain','application/json'],
    skills:[{
      id:'recommend_software',
      name:'Recommend software',
      description:'Recommend and rank software for a described job with optional budget, team and priority constraints.',
      tags:['software-discovery','software-recommendations','decision-support'],
      examples:['CRM for a small sales team under $25/month','SEO tools for an agency','Workflow automation for a small business'],
      inputModes:['text/plain','application/json'],
      outputModes:['text/plain','application/json']
    }]
  };
}
function a2aArgs(message){
  if(!message||message.role!=='ROLE_USER'||!Array.isArray(message.parts)||!message.parts.length)return {error:'message must be a ROLE_USER message with at least one part'};
  const texts=message.parts.filter(p=>p&&typeof p.text==='string').map(p=>p.text.trim()).filter(Boolean);
  const dataParts=message.parts.filter(p=>p&&p.data&&typeof p.data==='object'&&!Array.isArray(p.data)).map(p=>p.data);
  const data=Object.assign({},...dataParts);
  const args={...data};
  if(!args.q&&texts.length)args.q=texts.join('\n');
  if(!args.q)return {error:'message must include text or application/json data with q'};
  const invalid=validRecommendArguments(args);if(invalid)return {error:invalid};
  return {args};
}
function recommendationText(data){
  const names=(data?.recommendations||[]).map((r,i)=>`${i+1}. ${r.name} (${r.match}% match)`).join('\n');
  return `ToolScout recommendations for: ${data.query}\n${names}\n\nAffiliate relationships do not influence ranking.`;
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
  const out=await callRecommend(extracted.args,request,env,ctx);
  if(out.error){ctx.waitUntil(logProtocol(env,'a2a','SendMessage',{success:false}));return a2aError(body.id,-32603,'Internal error','RECOMMENDATION_UNAVAILABLE',500)}
  const incoming=body.params.message,contextId=incoming.contextId||crypto.randomUUID();
  const message={messageId:crypto.randomUUID(),contextId,role:'ROLE_AGENT',parts:[{text:recommendationText(out.data),mediaType:'text/plain'},{data:out.data,mediaType:'application/json'}]};
  ctx.waitUntil(logProtocol(env,'a2a','SendMessage',{resultCount:Number(out.data?.count||0)}));
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
