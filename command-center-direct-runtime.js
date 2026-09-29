import {handleCommandCenterDirectRoute as handleLegacyBackedCommandCenterRead} from './operational-truth-reconciliation-worker.js';

// ToolScout 2.0 read-only Command Center owner.
// The legacy reconciliation module remains the data implementation during
// staged migration, but schema/admin mutation is not exposed through this owner.
export async function handleCommandCenterDirectRoute(request,env){
  if(!['GET','HEAD'].includes(request.method))return null;
  return handleLegacyBackedCommandCenterRead(request,env);
}
