import {handleChairmanQueueReadRoute as handleResilientChairmanQueue} from './command-center-resilient-worker.js';

export async function handleAnalyticsChairmanRoute(request,env,ctx){
  if(request.method!=='GET')return null;
  const url=new URL(request.url);
  if(url.pathname!=='/analytics/api/chairman-queue')return null;
  return handleResilientChairmanQueue(request,env,ctx);
}
