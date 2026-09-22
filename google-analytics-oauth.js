const OWNER_EMAIL='pcaiano@gmail.com';
const GA_SCOPE='https://www.googleapis.com/auth/analytics.readonly';
const GOOGLE_AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL='https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL='https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL='https://openidconnect.googleapis.com/v1/userinfo';
const GA_ADMIN_ORIGIN='https://analyticsadmin.googleapis.com';
const DEFAULT_MEASUREMENT_ID='G-9VR80SYYH7';
const DEFAULT_REDIRECT_URI='https://trytoolscout.org/api/google-analytics/callback';
const OAUTH_COOKIE='ts_ga4_oauth';
const OAUTH_TTL_SECONDS=600;
let oauthAccessCache=null;
let schemaReady=false;

const enc=new TextEncoder();
const dec=new TextDecoder();
function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
function b64urlBytes(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function fromB64url(value){const raw=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const padded=raw+'='.repeat((4-raw.length%4)%4);const binary=atob(padded);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes}
function randomToken(bytes=32){const value=new Uint8Array(bytes);crypto.getRandomValues(value);return b64urlBytes(value)}
function oauthConfig(env){return {clientId:String(env.GOOGLE_OAUTH_CLIENT_ID||''),clientSecret:String(env.GOOGLE_OAUTH_CLIENT_SECRET||''),redirectUri:String(env.GOOGLE_OAUTH_REDIRECT_URI||DEFAULT_REDIRECT_URI),measurementId:String(env.GA4_MEASUREMENT_ID||DEFAULT_MEASUREMENT_ID),propertyId:String(env.GA4_PROPERTY_ID||'').replace(/^properties\//,'')}}
function originOk(request){return String(request.headers.get('Origin')||'')===new URL(request.url).origin}
async function ownerAuthenticated(request,ctx){
  const headerEmail=String(request.headers.get('Cf-Access-Authenticated-User-Email')||request.headers.get('cf-access-authenticated-user-email')||'').toLowerCase();
  if(headerEmail===OWNER_EMAIL)return true;
  try{if(ctx?.access){const identity=await ctx.access.getIdentity();return String(identity?.email||'').toLowerCase()===OWNER_EMAIL}}catch{}
  return false;
}
async function cryptoKey(env){
  const secret=String(env.OAUTH_TOKEN_ENCRYPTION_KEY||env.ADMIN_TOKEN||'');
  if(!secret)throw new Error('oauth_token_encryption_key_unavailable');
  const digest=await crypto.subtle.digest('SHA-256',enc.encode(`toolscout-google-analytics-oauth-v1:${secret}`));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function encryptText(env,value){
  const iv=new Uint8Array(12);crypto.getRandomValues(iv);const key=await cryptoKey(env);const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(String(value)));
  return `v1.${b64urlBytes(iv)}.${b64urlBytes(new Uint8Array(ciphertext))}`;
}
async function decryptText(env,value){
  const parts=String(value||'').split('.');if(parts.length!==3||parts[0]!=='v1')throw new Error('oauth_ciphertext_invalid');
  const key=await cryptoKey(env),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(parts[1])},key,fromB64url(parts[2]));return dec.decode(plain);
}
function cookieValue(request,name){const raw=String(request.headers.get('Cookie')||'');const match=raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));return match?decodeURIComponent(match[1]):''}
function oauthCookie(value,maxAge=OAUTH_TTL_SECONDS){return `${OAUTH_COOKIE}=${encodeURIComponent(value)}; Path=/api/google-analytics/callback; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`}
function redirect(location,cookie=null){const headers=new Headers({Location:location,'Cache-Control':'no-store'});if(cookie!==null)headers.append('Set-Cookie',cookie);return new Response(null,{status:303,headers})}
async function googleJson(url,token,init={}){const headers=new Headers(init.headers||{});headers.set('Authorization',`Bearer ${token}`);if(init.body)headers.set('Content-Type','application/json');const response=await fetch(url,{...init,headers});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`google_api_${response.status}:${body?.error?.message||'request_failed'}`);return body}
async function discoverPropertyId(token,measurementId){
  const summary=await googleJson(`${GA_ADMIN_ORIGIN}/v1beta/accountSummaries?pageSize=200`,token);const properties=[];
  for(const account of summary.accountSummaries||[])for(const property of account.propertySummaries||[])if(property.property)properties.push(property.property);
  for(const property of properties){try{const streams=await googleJson(`${GA_ADMIN_ORIGIN}/v1beta/${property}/dataStreams?pageSize=200`,token);const match=(streams.dataStreams||[]).find(stream=>String(stream?.webStreamData?.measurementId||'')===measurementId);if(match)return property.replace(/^properties\//,'')}catch{}}
  throw new Error('ga4_property_id_not_discoverable');
}
async function ensureOAuthSchema(env){
  if(schemaReady)return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS google_oauth_connections (provider TEXT PRIMARY KEY CHECK (provider = 'google_analytics'),owner_email TEXT NOT NULL,property_id TEXT,measurement_id TEXT NOT NULL,refresh_token_ciphertext TEXT NOT NULL,scopes TEXT NOT NULL DEFAULT '',connected_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),last_refresh_at TEXT,last_error TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_google_oauth_connections_updated ON google_oauth_connections(updated_at)`)
  ]);
  schemaReady=true;
}
async function loadConnection(env){try{return await env.DB.prepare(`SELECT provider,owner_email,property_id,measurement_id,refresh_token_ciphertext,scopes,connected_at,updated_at,last_refresh_at,last_error FROM google_oauth_connections WHERE provider='google_analytics'`).first()}catch{return null}}
async function saveConnection(env,{ownerEmail,propertyId,measurementId,ciphertext,scopes,lastError=null}){
  await ensureOAuthSchema(env);
  await env.DB.prepare(`INSERT INTO google_oauth_connections(provider,owner_email,property_id,measurement_id,refresh_token_ciphertext,scopes,connected_at,updated_at,last_error) VALUES('google_analytics',?,?,?,?,?,datetime('now'),datetime('now'),?) ON CONFLICT(provider) DO UPDATE SET owner_email=excluded.owner_email,property_id=COALESCE(excluded.property_id,google_oauth_connections.property_id),measurement_id=excluded.measurement_id,refresh_token_ciphertext=excluded.refresh_token_ciphertext,scopes=excluded.scopes,updated_at=datetime('now'),last_error=excluded.last_error`).bind(ownerEmail,propertyId||null,measurementId,ciphertext,scopes||GA_SCOPE,lastError).run();
}
async function updateConnectionHealth(env,{propertyId=null,error=null,refreshed=false}={}){try{await env.DB.prepare(`UPDATE google_oauth_connections SET property_id=COALESCE(?,property_id),last_error=?,last_refresh_at=CASE WHEN ?=1 THEN datetime('now') ELSE last_refresh_at END,updated_at=datetime('now') WHERE provider='google_analytics'`).bind(propertyId,error,refreshed?1:0).run()}catch{}}
async function exchangeCode(config,code,verifier){const body=new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:config.redirectUri});const response=await fetch(GOOGLE_TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const data=await response.json().catch(()=>({}));if(!response.ok||!data.access_token)throw new Error(`google_oauth_exchange_${response.status}:${data.error_description||data.error||'failed'}`);return data}
async function refreshToken(config,refresh){const body=new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:refresh,grant_type:'refresh_token'});const response=await fetch(GOOGLE_TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const data=await response.json().catch(()=>({}));if(!response.ok||!data.access_token)throw new Error(`google_oauth_refresh_${response.status}:${data.error_description||data.error||'failed'}`);return data}

export async function googleAnalyticsOAuthStatus(env){
  const config=oauthConfig(env),row=await loadConnection(env);return {configured:Boolean(config.clientId&&config.clientSecret),connected:Boolean(row),ownerEmail:row?.owner_email||null,propertyId:row?.property_id||config.propertyId||null,measurementId:row?.measurement_id||config.measurementId,connectedAt:row?.connected_at||null,lastRefreshAt:row?.last_refresh_at||null,lastError:row?.last_error||null,redirectUri:config.redirectUri};
}
export async function googleAnalyticsConnectResponse(request,env,ctx){
  if(!(await ownerAuthenticated(request,ctx)))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  const config=oauthConfig(env);if(!config.clientId||!config.clientSecret)return Response.json({ok:false,error:'google_oauth_app_not_configured'},{status:503,headers:{'Cache-Control':'no-store'}});
  const state=randomToken(24),verifier=randomToken(48),challenge=b64urlBytes(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(verifier)))),payload=await encryptText(env,JSON.stringify({state,verifier,exp:Date.now()+OAUTH_TTL_SECONDS*1000}));
  const params=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:`openid email ${GA_SCOPE}`,access_type:'offline',prompt:'consent',include_granted_scopes:'true',state,code_challenge:challenge,code_challenge_method:'S256',login_hint:OWNER_EMAIL});
  return redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`,oauthCookie(payload));
}
export async function googleAnalyticsCallbackResponse(request,env){
  const config=oauthConfig(env),url=new URL(request.url),clear=oauthCookie('',0);if(!config.clientId||!config.clientSecret)return redirect('/analytics?google=setup_required',clear);
  try{
    if(url.searchParams.get('error'))throw new Error(`google_authorization_${url.searchParams.get('error')}`);
    const encrypted=cookieValue(request,OAUTH_COOKIE);if(!encrypted)throw new Error('oauth_state_cookie_missing');const stateData=JSON.parse(await decryptText(env,encrypted));
    if(Date.now()>n(stateData.exp)||!stateData.state||stateData.state!==url.searchParams.get('state'))throw new Error('oauth_state_invalid');
    const code=String(url.searchParams.get('code')||'');if(!code)throw new Error('oauth_code_missing');const tokens=await exchangeCode(config,code,stateData.verifier);const user=await googleJson(GOOGLE_USERINFO_URL,tokens.access_token);
    if(String(user.email||'').toLowerCase()!==OWNER_EMAIL||user.email_verified===false)throw new Error('oauth_google_account_not_owner');
    const existing=await loadConnection(env);let ciphertext=existing?.refresh_token_ciphertext||null;if(tokens.refresh_token)ciphertext=await encryptText(env,tokens.refresh_token);if(!ciphertext)throw new Error('google_refresh_token_missing');
    let propertyId=config.propertyId||existing?.property_id||null,discoveryError=null;if(!propertyId){try{propertyId=await discoverPropertyId(tokens.access_token,config.measurementId)}catch(error){discoveryError=String(error?.message||error)}}
    await saveConnection(env,{ownerEmail:OWNER_EMAIL,propertyId,measurementId:config.measurementId,ciphertext,scopes:tokens.scope||`${GA_SCOPE} openid email`,lastError:discoveryError});oauthAccessCache=null;
    return redirect(discoveryError?'/analytics?google=connected&property=unresolved':'/analytics?google=connected',clear);
  }catch(error){return redirect(`/analytics?google=error&reason=${encodeURIComponent(String(error?.message||error).slice(0,160))}`,clear)}
}
export async function googleAnalyticsOAuthAccess(env){
  const config=oauthConfig(env),row=await loadConnection(env);if(!row)return null;if(!config.clientId||!config.clientSecret)throw new Error('google_oauth_app_not_configured');
  const now=Date.now();if(oauthAccessCache&&oauthAccessCache.expiresAt>now+60000&&oauthAccessCache.ownerEmail===row.owner_email)return oauthAccessCache;
  try{
    const refresh=await decryptText(env,row.refresh_token_ciphertext),tokens=await refreshToken(config,refresh);let propertyId=row.property_id||config.propertyId||null;if(!propertyId)propertyId=await discoverPropertyId(tokens.access_token,row.measurement_id||config.measurementId);
    oauthAccessCache={token:tokens.access_token,propertyId,ownerEmail:row.owner_email,measurementId:row.measurement_id||config.measurementId,authMode:'oauth',expiresAt:now+n(tokens.expires_in||3600)*1000};await updateConnectionHealth(env,{propertyId,error:null,refreshed:true});return oauthAccessCache;
  }catch(error){await updateConnectionHealth(env,{error:String(error?.message||error).slice(0,500)});throw error}
}
export async function googleAnalyticsDisconnectResponse(request,env,ctx){
  if(!(await ownerAuthenticated(request,ctx))||!originOk(request))return Response.json({ok:false,error:'forbidden'},{status:403,headers:{'Cache-Control':'no-store'}});
  const row=await loadConnection(env);if(row){try{const token=await decryptText(env,row.refresh_token_ciphertext);await fetch(GOOGLE_REVOKE_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})})}catch{}try{await env.DB.prepare(`DELETE FROM google_oauth_connections WHERE provider='google_analytics'`).run()}catch{}}
  oauthAccessCache=null;return Response.json({ok:true,disconnected:true},{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}});
}
