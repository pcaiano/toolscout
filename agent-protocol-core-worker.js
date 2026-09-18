import base from './distribution-network-worker.js';

const PROTOCOL_VERSION='2026-07-28';
const A2A_VERSION='1.0';
const SERVER_INFO={name:'ToolScout',version:'1.0.0',websiteUrl:'https://trytoolscout.org/'};
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
function toolDefinition(){
  return {
    name:'recommend_tools',
    title:'Recommend software with ToolScout',
    description:'Return deterministic ToolScout software recommendations for a job, persona, budget, team and priority. Affiliate relationships do not influence ranking.',
    inputSchema:{
      type:'object',
      additionalProperties:false,
      required:['q'],
      properties:{
        q:{type:'string',minLength:2,maxLength:300,description:'Natural-language description of the software job or need.'},
        goal:{type:'string',maxLength:40,description:'Optional category or goal hint.'},
        budget:{type:'string',enum:['free','low','mid','high']},
        team:{type:'string',enum:['solo','small','team','large','agency']},
        priority:{type:'string',enum:['ease','automation','integrations','features']},
        limit:{type:'integer',minimum:1,maximum:5,default:3}
      }
    },
    outputSchema:{
      type:'object',
      required:['query','count','recommendations','ranking','affiliate_disclosure'],
      properties:{
        query:{type:'string'},profile:{type:'object'},intent:{type:['object','null']},count:{type:'integer'},ranking:{type:'string'},affiliate_disclosure:{type:'string'},recommendations:{type:'array',items:{type:'object'}}
      }
    },
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
  };
}
function validArguments(a){
  if(!a||typeof a!=='object'||Array.isArray(a))return 'arguments must be an object';
  if(typeof a.q!=='string'||a.q.trim().length<2||a.q.length>300)return 'q must be a string between 2 and 300 characters';
  const checks=[['budget',['free','low','mid','high']],['team',['solo','small','team','large','agency']],['priority',['ease','automation','integrations','features']]];
  for(const [key,values] of checks)if(a[key]!==undefined&&!values.includes(a[key]))return `${key} is invalid`;
  if(a.limit!==undefined&&(!Number.isInteger(a.limit)||a.limit<1||a.limit>5))return 'limit must be an integer from 1 to 5';
  return null;
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
function mcpClient(body){const c=requestMeta(body)['io.modelcontextprotocol/clientInfo']||{};return {clientName:c.name||null,clientVersion:c.version||null}}
async function handleMcp(request,env,ctx){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{...JSON_HEADERS,Allow:'POST, OPTIONS'}});
  let body;try{body=await request.json()}catch{return rpcError(null,-32700,'Parse error',undefined,400)}
  if(!body||body.jsonrpc!=='2.0'||body.id===undefined||typeof body.method!=='string')return rpcError(body?.id??null,-32600,'Invalid Request',undefined,400);
  const client=mcpClient(body),envelopeError=validateEnvelope(request,body);
  if(envelopeError){ctx.waitUntil(logProtocol(env,'mcp',body.method,{...client,success:false}));return rpcError(body.id,envelopeError.code,envelopeError.message,envelopeError.data,400)}
  if(body.method==='server/discover'){ctx.waitUntil(logProtocol(env,'mcp','server/discover',client));return rpc(body.id,{supportedVersions:[PROTOCOL_VERSION],capabilities:{tools:{listChanged:false}},instructions:'ToolScout is a read-only software decision engine. Use recommend_tools for deterministic software recommendations. Affiliate relationships do not influence ranking.',ttlMs:3600000,cacheScope:'public'})}
  if(body.method==='tools/list'){ctx.waitUntil(logProtocol(env,'mcp','tools/list',client));return rpc(body.id,{tools:[toolDefinition()],ttlMs:3600000,cacheScope:'public'})}
  if(body.method==='tools/call'){
    if(body?.params?.name!=='recommend_tools'){ctx.waitUntil(logProtocol(env,'mcp','tools/call',{...client,success:false}));return rpcError(body.id,-32602,'Unknown tool',{name:body?.params?.name||null},400)}
    const args=body?.params?.arguments||{},invalid=validArguments(args);
    if(invalid){ctx.waitUntil(logProtocol(env,'mcp','tools/call',{...client,success:false}));return rpc(body.id,{content:[{type:'text',text:invalid}],isError:true})}
    const out=await callRecommend(args,request,env,ctx);
    if(out.error){ctx.waitUntil(logProtocol(env,'mcp','tools/call',{...client,success:false}));return rpc(body.id,{content:[{type:'text',text:out.error}],structuredContent:out.data||{error:out.error},isError:true})}
    ctx.waitUntil(logProtocol(env,'mcp','tools/call',{...client,resultCount:Number(out.data?.count||0)}));
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
  const invalid=validArguments(args);if(invalid)return {error:invalid};
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

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/.well-known/agent-card.json'&&request.method==='GET')return Response.json(agentCard(),{headers:{...A2A_HEADERS,'Cache-Control':'public, max-age=3600'}});
    if(u.pathname==='/a2a'||u.pathname==='/a2a/')return handleA2A(request,env,ctx);
    if(u.pathname==='/mcp'||u.pathname==='/mcp/')return handleMcp(request,env,ctx);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};
