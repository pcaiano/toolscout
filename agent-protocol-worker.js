import base from './distribution-embed-worker.js';

const PROTOCOL_VERSION='2026-07-28';
const SERVER_INFO={name:'ToolScout',version:'1.0.0',websiteUrl:'https://trytoolscout.org/'};
const SERVER_META_KEY='io.modelcontextprotocol/serverInfo';
const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name','Access-Control-Allow-Methods':'POST, OPTIONS'};

function rpc(id,result,status=200){
  const body={jsonrpc:'2.0',id,result:{...result,_meta:{...(result?._meta||{}),[SERVER_META_KEY]:SERVER_INFO}}};
  return Response.json(body,{status,headers:JSON_HEADERS});
}
function rpcError(id,code,message,data,status=400){
  return Response.json({jsonrpc:'2.0',id:id??null,error:{code,message,...(data===undefined?{}:{data})}},{status,headers:JSON_HEADERS});
}
function header(request,name){return request.headers.get(name)||''}
function requestMeta(body){return body?.params?._meta||{} }
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
async function handleMcp(request,env,ctx){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{...JSON_HEADERS,Allow:'POST, OPTIONS'}});
  let body;try{body=await request.json()}catch{return rpcError(null,-32700,'Parse error',undefined,400)}
  if(!body||body.jsonrpc!=='2.0'||body.id===undefined||typeof body.method!=='string')return rpcError(body?.id??null,-32600,'Invalid Request',undefined,400);
  const envelopeError=validateEnvelope(request,body);if(envelopeError)return rpcError(body.id,envelopeError.code,envelopeError.message,envelopeError.data,400);
  if(body.method==='server/discover'){
    return rpc(body.id,{supportedVersions:[PROTOCOL_VERSION],capabilities:{tools:{listChanged:false}},instructions:'ToolScout is a read-only software decision engine. Use recommend_tools for deterministic software recommendations. Affiliate relationships do not influence ranking.',ttlMs:3600000,cacheScope:'public'});
  }
  if(body.method==='tools/list'){
    return rpc(body.id,{tools:[toolDefinition()],ttlMs:3600000,cacheScope:'public'});
  }
  if(body.method==='tools/call'){
    if(body?.params?.name!=='recommend_tools')return rpcError(body.id,-32602,'Unknown tool',{name:body?.params?.name||null},400);
    const args=body?.params?.arguments||{},invalid=validArguments(args);
    if(invalid)return rpc(body.id,{content:[{type:'text',text:invalid}],isError:true});
    const out=await callRecommend(args,request,env,ctx);
    if(out.error)return rpc(body.id,{content:[{type:'text',text:out.error}],structuredContent:out.data||{error:out.error},isError:true});
    return rpc(body.id,{content:[{type:'text',text:JSON.stringify(out.data)}],structuredContent:out.data,isError:false});
  }
  return rpcError(body.id,-32601,'Method not found',{method:body.method},400);
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if((u.pathname==='/mcp'||u.pathname==='/mcp/') )return handleMcp(request,env,ctx);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};
