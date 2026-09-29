import {handleHumanActionsReadRoute} from './human-action-entry-worker.js';

// ToolScout 2.0 read-only owner for the Command Center Human Actions queue.
// Mutating credential, gate and editorial POST routes deliberately remain on
// the operational legacy path.
export async function handleAnalyticsHumanActionsRoute(request,env){
  if(request.method!=='GET')return null;
  return handleHumanActionsReadRoute(request,env);
}
