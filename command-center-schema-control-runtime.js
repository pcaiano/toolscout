const JSON_H={
  'Content-Type':'application/json; charset=UTF-8',
  'Cache-Control':'no-store',
  'X-ToolScout-Route-Contract':'v2'
};

function adminAuthorized(request,env){
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  return Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN);
}

async function schemaState(env){
  try{
    const [tables,columns,accounts,programs,evidence]=await Promise.all([
      env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('affiliate_network_click_evidence','affiliate_network_accounts','affiliate_network_program_evidence')").all(),
      env.DB.prepare("PRAGMA table_info(affiliate_network_click_evidence)").all(),
      env.DB.prepare("SELECT COUNT(*) n FROM affiliate_network_accounts").first(),
      env.DB.prepare("SELECT COUNT(*) n FROM affiliate_network_program_evidence").first(),
      env.DB.prepare("SELECT COUNT(*) n FROM affiliate_network_click_evidence").first()
    ]);
    const tableNames=new Set((tables?.results||[]).map(row=>String(row.name||'')));
    const columnNames=new Set((columns?.results||[]).map(row=>String(row.name||'')));
    const requiredTables=['affiliate_network_click_evidence','affiliate_network_accounts','affiliate_network_program_evidence'];
    const requiredColumns=['account_email','programme_status','reported_conversions_total','pending_commission_amount','currency'];
    const missingTables=requiredTables.filter(name=>!tableNames.has(name));
    const missingColumns=requiredColumns.filter(name=>!columnNames.has(name));
    return{
      ok:missingTables.length===0&&missingColumns.length===0,
      missingTables,
      missingColumns,
      mode:'migration_owned_read_only_probe',
      counts:{
        accounts:Number(accounts?.n||0),
        programmeEvidence:Number(programs?.n||0),
        clickEvidence:Number(evidence?.n||0)
      }
    };
  }catch(error){
    return{
      ok:false,
      missingTables:[],
      missingColumns:[],
      mode:'migration_owned_read_only_probe',
      error:String(error?.message||error).slice(0,500)
    };
  }
}

export async function handleCommandCenterSchemaControlRoute(request,env){
  const url=new URL(request.url);
  if(request.method!=='POST'||url.pathname!=='/api/command-center-business-truth/reconcile-affiliate-schema')return null;
  if(!adminAuthorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
  const state=await schemaState(env);
  return Response.json({
    ok:state.ok,
    reconciled:state.ok,
    migrationOwned:true,
    state
  },{status:state.ok?200:503,headers:JSON_H});
}
