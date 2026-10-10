// Real production contract: every visible catalog visit must leave ToolScout,
// never bounce to /tools. Only health checks (no real click events).
const BASE=(process.env.TOOLSCOUT_BASE_URL||'https://trytoolscout.org').replace(/\/$/,'');
const timeout=15000;
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function get(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{return await fetch(url,{redirect:'manual',signal:controller.signal,cache:'no-store',
  headers:{'X-ToolScout-Health-Check':'affiliate-route','User-Agent':'ToolScout-Integrity-Audit/1.0'}})}
 finally{clearTimeout(timer)}
}
const inventoryResp=await get(BASE+'/api/catalog-inventory?audit='+Date.now());
if(!inventoryResp.ok)throw Error('Canonical live catalog inventory unavailable: HTTP '+inventoryResp.status);
const inventory=await inventoryResp.json();
const tools=Array.isArray(inventory.tools)?inventory.tools:[];
if(inventory.degraded||tools.length<127)throw Error('Canonical live inventory is degraded or incomplete: '+tools.length);
const slugs=[...new Set(tools.map(t=>t.slug).filter(s=>/^[a-z0-9][a-z0-9-]*$/.test(s)))];
const failures=[];
const concurrency=6;
let cursor=0,checked=0;
async function auditOne(slug){
 let outcome=null;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await get(BASE+'/go/'+encodeURIComponent(slug)+'?source=integrity-audit');
   const location=response.headers.get('Location');
   const target=location?new URL(location,BASE):null;
   const external=target&&['https:','http:'].includes(target.protocol)&&
     target.hostname.toLowerCase()!==new URL(BASE).hostname.toLowerCase()&&
     !target.hostname.toLowerCase().endsWith('.trytoolscout.org');
   if(response.status>=300&&response.status<400&&external){
    checked++;return;
   }
   outcome={slug,status:response.status,location:location?.slice(0,130)||null};
  }catch(error){outcome={slug,error:String(error.message||error).slice(0,125)}}
  if(attempt<2)await sleep(1200);
 }
 failures.push(outcome);
}
await Promise.all(Array.from({length:concurrency},async()=>{
 while(cursor<slugs.length){const index=cursor++;await auditOne(slugs[index]);}
}));
console.log(JSON.stringify({live_outbound_contract:true,inventory_total:inventory.total,unique_slugs:slugs.length,
 checked,failed:failures.length,failures:failures.slice(0,40)},null,2));
if(failures.length)throw Error(failures.length+' published catalog tools did not redirect to a real external destination');
