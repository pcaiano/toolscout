const LOCAL_LOGIN_PATHS=new Set(['/analytics/login','/analytics/login/']);
const LOCAL_LOGIN_EXPIRES_AT=1788972710;

export async function handleCommandCenterLocalLoginRoute(request,env){
  const url=new URL(request.url);
  if(request.method!=='GET'||!LOCAL_LOGIN_PATHS.has(url.pathname))return null;
  if(!env.ADMIN_TOKEN)return new Response('Command Center unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  if(Math.floor(Date.now()/1000)>LOCAL_LOGIN_EXPIRES_AT)return new Response('Login link expired',{status:410,headers:{'Cache-Control':'no-store'}});
  // The legacy one-time local login expired on 2026-09-09. Fail closed if a
  // clock before that historical expiry is ever presented instead of reviving
  // the obsolete token flow.
  return new Response('Login link expired',{status:410,headers:{'Cache-Control':'no-store'}});
}

export {LOCAL_LOGIN_EXPIRES_AT};
