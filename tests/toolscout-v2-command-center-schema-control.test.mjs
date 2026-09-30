import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCommandCenterSchemaControlRoute} from '../command-center-schema-control-runtime.js';
import {routeOwner} from '../runtime-route-contract.js';

function fakeEnv({complete=true}={}){
  let writes=0;
  const tables=complete
    ?['affiliate_network_click_evidence','affiliate_network_accounts','affiliate_network_program_evidence']
    :['affiliate_network_click_evidence'];
  const columns=complete
    ?['evidence_key','tool_slug','provider','programme','account_email','programme_status','reported_clicks_total','reported_conversions_total','pending_commission_amount','currency','observed_at','evidence_source','note','created_at']
    :['evidence_key','tool_slug','provider','programme','reported_clicks_total','observed_at','evidence_source','note','created_at'];
  const db={
    prepare(sql){
      const text=String(sql);
      return{
        bind(){return this},
        async all(){
          if(text.includes("sqlite_master"))return{results:tables.map(name=>({name}))};
          if(text.startsWith("PRAGMA table_info"))return{results:columns.map(name=>({name}))};
          return{results:[]};
        },
        async first(){
          if(text.includes("affiliate_network_accounts"))return{n:2};
          if(text.includes("affiliate_network_program_evidence"))return{n:10};
          if(text.includes("affiliate_network_click_evidence"))return{n:8};
          return null;
        },
        async run(){writes++;throw new Error('schema_control_attempted_write')}
      };
    },
    async batch(){writes++;throw new Error('schema_control_attempted_batch_write')}
  };
  return{env:{DB:db,ADMIN_TOKEN:'secret'},get writes(){return writes}};
}

test('affiliate schema reconcile route has a direct ToolScout 2.0 owner',()=>{
  assert.equal(
    routeOwner('/api/command-center-business-truth/reconcile-affiliate-schema',{method:'POST'}).owner,
    'command_center_schema_control'
  );
});

test('schema control preserves admin auth and performs no writes',async()=>{
  const state=fakeEnv();
  const unauthorized=await handleCommandCenterSchemaControlRoute(
    new Request('https://trytoolscout.org/api/command-center-business-truth/reconcile-affiliate-schema',{method:'POST'}),
    state.env
  );
  assert.equal(unauthorized.status,401);
  assert.equal(state.writes,0);

  const authorized=await handleCommandCenterSchemaControlRoute(
    new Request('https://trytoolscout.org/api/command-center-business-truth/reconcile-affiliate-schema',{
      method:'POST',
      headers:{Authorization:'Bearer secret'}
    }),
    state.env
  );
  assert.equal(authorized.status,200);
  const body=await authorized.json();
  assert.equal(body.ok,true);
  assert.equal(body.reconciled,true);
  assert.equal(body.migrationOwned,true);
  assert.equal(body.state.mode,'migration_owned_read_only_probe');
  assert.equal(body.state.counts.accounts,2);
  assert.equal(state.writes,0);
});

test('schema control reports incomplete migrated state without mutating it',async()=>{
  const state=fakeEnv({complete:false});
  const response=await handleCommandCenterSchemaControlRoute(
    new Request('https://trytoolscout.org/api/command-center-business-truth/reconcile-affiliate-schema',{
      method:'POST',
      headers:{Authorization:'Bearer secret'}
    }),
    state.env
  );
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.ok,false);
  assert.ok(body.state.missingTables.length>0);
  assert.ok(body.state.missingColumns.length>0);
  assert.equal(state.writes,0);
});
