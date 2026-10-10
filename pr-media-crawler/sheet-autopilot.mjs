import crypto from "node:crypto";

// Runs within the existing, isolated PR crawler. Never uses a public write endpoint.
// A Google service account must have editor access to the private PR spreadsheet.
const GOOGLE_SCOPE="https://www.googleapis.com/auth/spreadsheets";
const SHEET_ID=process.env.PR_SHEET_ID||"1iRfseZSnbmpvXJozLC9A1cQTZODkO5f6ijQ4yg89auo";
const GIDS={dashboard:349008896,journalists:1670885704,queue:327102415};
const EDITORIAL=/(editor|editorial|journalist|reporter|writer|newsroom|redacção|redação|redaction|rédacteur|directora? editorial)/i;
const INBOX=/^(?:editor(?:s|ial)?|news(?:room)?|redaction|redacao|redação|redacção|rédaction|redaktion|tips|press|presse|prensa)@/i;
const REJECT=/^(privacy|privacidade|sales|ads?|advertis|marketing|commercial|comercial|partnership|legal|support|help|billing|career|jobs|hr|admin|webmaster|info)@/i;
const COMPETITORS=/(g2\.com|capterra|softwareadvice|softreviewed|emailtooltester|malavida|tamindir|zoftwarehub)/i;
const cell=x=>({userEnteredValue:{stringValue:String(x??"")}});
const row=x=>({values:x.map(cell)});
const lower=x=>String(x||"").trim().toLowerCase();
const base64=v=>Buffer.from(v).toString("base64url");

export function editorialContact(raw,publisher){
  const email=lower(raw?.email),source=String(raw?.source_url||""),context=String(raw?.context||"").replace(/\s+/g," ");
  if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)||REJECT.test(email)||!context.toLowerCase().includes(email))return null;
  let hostname;
  try{const u=new URL(source);if(u.protocol!=="https:"&&u.protocol!=="http:")return null;hostname=u.hostname.toLowerCase().replace(/^www\./,"")}catch{return null}
  const domain=lower(publisher.domain);
  if(hostname!==domain&&!hostname.endsWith("."+domain)||COMPETITORS.test(domain))return null;
  const i=context.toLowerCase().indexOf(email),segment=context.slice(Math.max(0,i-130),Math.min(context.length,i+email.length+130));
  if(!EDITORIAL.test(segment))return null;
  // Never infer an individual's name from their mailbox. Resolve only literal
  // first-party author/editor labels adjacent to the printed email.
  const n="([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'.-]+(?:\\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'.-]+){1,2})";
  const r="(Editor(?:\\s+in\\s+Chief|-in-Chief)?|Managing Editor|Reporter|Journalist|Staff Writer|Directora?\\s+editorial|Jornalista|Rédacteur\\s+en\\s+chef)";
  const after=segment.slice(segment.toLowerCase().indexOf(email)+email.length),before=segment.slice(0,segment.toLowerCase().indexOf(email));
  const a=after.match(new RegExp("^\\s*"+n+"\\s+"+r+"\\b","iu")),b=before.match(new RegExp(n+"\\s+"+r+"\\s*(?:[,;:]\\s*)?$","iu"));
  const priorRole=before.match(new RegExp("(?:^|\\s)(Directora?|Jornalistas?|Editor(?:a)?|Rédacteur|Reporter|Journalist)\\s*[:|-]?\\s*"+n+"\\s*[:,-]?\\s*$","iu"));
  const candidate=a||b||(priorRole?[null,priorRole[2],priorRole[1]]:null);
  const match=candidate&&!/(editorial|PUBLICIDAD|comercial|commercial|advertising|marketing|newsroom|redação|redacção)/i.test(candidate[1])?candidate:null;
  if(!match&&!INBOX.test(email))return null;
  return {name:match?.[1]||publisher.name+" Editorial Desk",role:match?.[2]||"Editorial inbox",email,source,domain};
}

export function selectQueued(queue,limit=12){
  const out=[],seen=new Set();
  for(let i=1;i<queue.length;i++){
    const x=queue[i]||[],domain=lower(x[1]),category=String(x[4]||"");
    if(x[8]!=="Queued"||!domain||seen.has(domain)||COMPETITORS.test(domain))continue;
    if(/(software development|marketing services|public relations|advertising agencies|holding companies|broadcast media production|design services)/i.test(category))continue;
    if(!/(tech|software|saas|cloud|cyber|startup|enterprise|digital transformation|journal|internet news|artificial intelligence|IT news)/i.test(category))continue;
    if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))continue;
    seen.add(domain);out.push({i,name:x[0]||domain,domain,country:x[2]||"",language:x[3]||"",category});
    if(out.length===limit)break;
  }
  return out;
}
function jwt(secret){
  const now=Math.floor(Date.now()/1000);
  const encoded=base64(JSON.stringify({alg:"RS256",typ:"JWT"}))+"."+base64(JSON.stringify({
    iss:secret.client_email,scope:GOOGLE_SCOPE,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3000
  }));
  return encoded+"."+base64(crypto.sign("RSA-SHA256",Buffer.from(encoded),secret.private_key));
}
class Sheets {
  constructor(secret){this.secret=secret;this.token=null;this.until=0;}
  async bearer(){
    if(this.token&&Date.now()<this.until)return this.token;
    const body=new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt(this.secret)});
    const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
    if(!r.ok)throw Error("sheets_auth_"+r.status);
    const j=await r.json();this.token=j.access_token;this.until=Date.now()+(j.expires_in-90)*1000;return this.token;
  }
  async get(ranges){
    const args=new URLSearchParams();for(const s of ranges)args.append("ranges",s);
    const r=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+SHEET_ID+"/values:batchGet?"+args,{headers:{authorization:"Bearer "+await this.bearer()}});
    if(!r.ok)throw Error("sheets_read_"+r.status);
    return (await r.json()).valueRanges.map(x=>x.values||[]);
  }
  async put(requests){
    const r=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+SHEET_ID+":batchUpdate",{
      method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+await this.bearer()},body:JSON.stringify({requests})
    });
    if(!r.ok)throw Error("sheets_write_"+r.status+"_"+(await r.text()).slice(0,150));
  }
}
async function state(api){
  const [dashboard,mails,names,queue,blocked]=await api.get([
    "Dashboard!A1:B50","Journalists!H1:H50000","Journalists!A1:A50000","'Discovery Queue'!A1:N50000","Suppression!A1:A5000"
  ]);
  let last=0;for(let i=0;i<names.length;i++)if(names[i]?.[0])last=i;
  return {dashboard,queue,last,emails:new Set(mails.slice(1).map(x=>lower(x?.[0])).filter(Boolean)),
    blocked:new Set(blocked.slice(1).map(x=>lower(x?.[0])).filter(Boolean)),
    emailRows:mails.slice(1).filter(x=>x?.[0]).length};
}
function metric(d,label,value){
  const i=d.findIndex(x=>x[0]===label);if(i<0)throw Error("dashboard_label_missing_"+label);
  return {updateCells:{range:{sheetId:GIDS.dashboard,startRowIndex:i,endRowIndex:i+1,startColumnIndex:1,endColumnIndex:2},rows:[row([value])],fields:"userEnteredValue"}};
}
async function tick(api,crawlMany){
  const initial=await state(api),targets=selectQueued(initial.queue);
  if(!targets.length){console.log("PR_AUTOPILOT_IDLE "+JSON.stringify({reason:"no_eligible_queued_publications"}));return;}
  const batch="auto-"+new Date().toISOString().replace(/[:.]/g,"-");
  console.log("PR_AUTOPILOT_START "+JSON.stringify({batch,domains:targets.map(x=>x.domain)}));
  const results=await crawlMany(targets.map(x=>x.domain),result=>{
    console.log("PR_AUTOPILOT_DOMAIN_RESULT "+JSON.stringify({batch,domain:result.domain,status:result.status,raw_email_count:result.contacts?.length||0}));
  });
  // Single instance, one running tick, with fresh dedupe before the atomic write.
  const fresh=await state(api),accepted=[],byDomain=new Map();
  if(targets.some(t=>fresh.queue[t.i]?.[8]!=="Queued"))throw Error("queue_concurrency_conflict");
  for(let i=0;i<targets.length;i++){
    const target=targets[i];
    for(const c of results[i]?.contacts||[]){
      const x=editorialContact(c,target);
      if(!x||fresh.emails.has(x.email)||fresh.blocked.has(x.email))continue;
      fresh.emails.add(x.email);accepted.push({x,target});byDomain.set(target.domain,(byDomain.get(target.domain)||0)+1);
    }
  }
  const start=fresh.last+1,requests=[];
  if(accepted.length){
    const entries=accepted.map(({x,target})=>row([
      x.name,x.role,target.name,target.domain,target.country,target.language,target.category,x.email,
      "First-party editorial contact verified "+new Date().toISOString().slice(0,10),"Current public professional email — SMTP unverified",
      x.source,x.source,"2","High","ToolScout PR","Published first-party editorial contact","Ready","No reply","","",
      "Autonomous "+batch+"; current editorial source "+x.source+"; no SMTP test; no outreach."
    ]));
    requests.push({updateCells:{range:{sheetId:GIDS.journalists,startRowIndex:start,endRowIndex:start+entries.length,startColumnIndex:0,endColumnIndex:21},rows:entries,fields:"userEnteredValue"}});
  }
  for(let i=0;i<targets.length;i++){
    const t=targets[i],result=results[i]||{},n=byDomain.get(t.domain)||0;
    const retry=result.status!=="complete"||!result.pages_fetched;
    requests.push({updateCells:{range:{sheetId:GIDS.queue,startRowIndex:t.i,endRowIndex:t.i+1,startColumnIndex:8,endColumnIndex:14},
      rows:[row([retry?"Retry required — "+batch:"Screened — "+batch,
        result.people?.length||0,result.contacts?.length||0,new Date().toISOString().slice(0,10),
        retry?"Retry later after cooldown":"Editorial source scan complete",
        batch+": "+n+" valid new public editorial email(s) imported, SMTP not tested; no outreach."])],fields:"userEnteredValue"}});
  }
  const current=Number(fresh.dashboard.find(x=>x[0]==="Unique public email addresses — verification pending")?.[1]);
  if(!Number.isSafeInteger(current)||current!==fresh.emails.size-accepted.length)throw Error("dashboard_dedupe_mismatch");
  const records=Number(fresh.dashboard.find(x=>x[0]==="Stored PR records — profiles and editorial desks")?.[1]);
  const ready=Number(fresh.dashboard.find(x=>x[0]==="Ready — current public source")?.[1]);
  if(!Number.isSafeInteger(records)||!Number.isSafeInteger(ready))throw Error("dashboard_counts_invalid");
  const n=accepted.length;
  for(const [label,val] of [
    ["Unique public email addresses — verification pending",current+n],
    ["Journalists / editors discovered",records+n],
    ["Stored PR records — profiles and editorial desks",records+n],
    ["Rows with public email — includes shared inbox duplicates",fresh.emailRows+n],
    ["Ready — current public source",ready+n],
    ["Current-source owned editorial addresses",ready+n],
    ["Crawler status",batch+" completed and imported "+n+" new editorial email addresses, "+targets.length+" publishers processed."],
    ["Latest completed batch",batch+": "+targets.length+" publisher domains, "+n+" unique public emails accepted; no SMTP verification."],
    ["Last checkpoint",new Date().toISOString()+": "+(current+n)+" unique published emails, "+(ready+n)+" with current editorial source"],
    ["Active build lease","No active importer; "+batch+" completed and ingested."]
  ])requests.push(metric(fresh.dashboard,label,val));
  await api.put(requests);
  const check=await state(api);
  if(check.emails.size!==current+n||targets.some(t=>check.queue[t.i]?.[8]==="Queued"))throw Error("autopilot_readback_failed");
  console.log("PR_AUTOPILOT_WRITE_CONFIRMED "+JSON.stringify({batch,added:n,total:check.emails.size,processed:targets.length}));
}
export function startPrSheetAutopilot(crawlMany){
  if(process.env.PR_AUTOPILOT_ENABLED!=="1")return false;
  let config;
  try{config=JSON.parse(process.env.PR_SHEETS_SERVICE_ACCOUNT_JSON||"")}catch{console.error("PR_AUTOPILOT_BLOCKED missing_or_invalid_credentials");return false}
  if(!config.client_email||!config.private_key){console.error("PR_AUTOPILOT_BLOCKED missing_service_account_credentials");return false;}
  const api=new Sheets(config);let running=false;
  const run=async()=>{if(running)return;running=true;try{await tick(api,crawlMany)}catch(e){console.error("PR_AUTOPILOT_ERROR "+String(e?.message||e))}finally{running=false}};
  setTimeout(run,5000);setInterval(run,60*60*1000);
  return true;
}