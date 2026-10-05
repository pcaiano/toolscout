// ToolScout 2.0 direct Command Center owner.
// The canonical read model is isolated from the legacy operational worker chain.
import {handleCommandCenterDirectRoute as handleBaseCommandCenterDirectRoute} from './command-center-business-truth-runtime.js';
import {transformCommandCenterRedesignResponse} from './command-center-redesign-runtime.js';

export async function handleCommandCenterDirectRoute(request,env){
  const response=await handleBaseCommandCenterDirectRoute(request,env);
  if(!response)return null;
  return transformCommandCenterRedesignResponse(request,response);
}
