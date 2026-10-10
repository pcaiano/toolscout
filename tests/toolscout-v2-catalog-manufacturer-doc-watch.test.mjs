import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {monitoredManufacturerDocuments,verifyManufacturerDocuments} from '../catalog-manufacturer-document-watch.js';
import {missionOwner,SCHEDULED_MISSIONS,TOOLSCOUT_CRONS} from '../runtime-schedule-contract.js';

const all=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const tool=all.find(x=>x.slug==='systeme-io');
assert.ok(tool);

function watchFixture(){
  let events=[],version='baseline',status='ok',redirect=null;
  const env={DB:{prepare(sql){
    assert.match(sql,/SELECT event_type,evidence_json FROM catalog_runtime_events/);
    return{bind(slug){assert.equal(slug,tool.slug);return this},async all(){return{results:events.filter(x=>['catalog_docs_snapshot','catalog_docs_pending','catalog_docs_reset'].includes(x.event_type)).slice(0,40)}}};
  }}};
  const options={
    fetchDocument:async url=>({status,fingerprint:version+':'+url,finalUrl:redirect||url}),
    hash:async value=>value,
    writeEvent:async(_env,_slug,event_type,_status,_detail,payload)=>{
      events.unshift({event_type,evidence_json:JSON.stringify(payload)});
    }
  };
  return {env,options,events,change(v){version=v},status(v){status=v},redirect(v){redirect=v}};
}
test('manufacturer document selection prefers plan evidence and two distinct owned pages',()=>{
  const urls=monitoredManufacturerDocuments(tool);
  assert.equal(urls.length,2);
  assert.equal(urls[0],tool.pricingDetails.sourceUrl);
  assert.ok(urls.every(url=>url.startsWith('https://systeme.io/')||url.startsWith('https://help.systeme.io/')));
  assert.deepEqual(monitoredManufacturerDocuments({...tool,sourceUrl:'https://hijacked.example',pricingDetails:{sourceUrl:'https://another.example/path'},editorialReview:{sourceUrls:['https://evil.example/docs']},decisionClaims:[]}),[]);
  const chatgpt=all.find(x=>x.slug==='chatgpt');
  assert.ok(monitoredManufacturerDocuments(chatgpt).some(url=>url.startsWith('https://help.openai.com/')),'must follow exact previously attested manufacturer evidence when brand and parent company domains differ');
  assert.ok(all.filter(x=>monitoredManufacturerDocuments(x).length>0).length>=125,'original catalog contains missing documentary monitoring coverage');
});
test('first documentary scan is a baseline, not a freshness endorsement or auto-changed price',async()=>{
  const f=watchFixture();
  const a=await verifyManufacturerDocuments(f.env,tool,f.options);
  assert.equal(a.status,'baselined');
  assert.equal(a.changed,false);
  assert.equal(a.checked,2);
  assert.equal(f.events.length,1);
  const b=await verifyManufacturerDocuments(f.env,tool,f.options);
  assert.equal(b.status,'unchanged');
  assert.equal(f.events.length,1);
});
test('manufacturer changes require two consecutive complete document checks and preserve the old catalog facts',async()=>{
  const f=watchFixture();
  const copy=structuredClone(tool);
  await verifyManufacturerDocuments(f.env,tool,f.options);
  f.change('vendor-documents-changed');
  const once=await verifyManufacturerDocuments(f.env,tool,f.options);
  assert.equal(once.status,'pending_confirmation');
  assert.equal(once.changed,false);
  assert.equal(f.events[0].event_type,'catalog_docs_pending');
  const twice=await verifyManufacturerDocuments(f.env,tool,f.options);
  assert.equal(twice.status,'change_confirmed');
  assert.equal(twice.changed,true);
  assert.equal(f.events[0].event_type,'catalog_docs_change_confirmed');
  assert.equal(f.events[1].event_type,'catalog_docs_snapshot');
  const third=await verifyManufacturerDocuments(f.env,tool,f.options);
  assert.equal(third.status,'unchanged');
  assert.deepEqual(tool,copy,'document monitoring must never automatically rewrite pricing, features or dated decisions');
});
test('temporary vendor document changes revert safely, and blocked or third-party-redirected docs are not verified',async()=>{
  const f=watchFixture();
  await verifyManufacturerDocuments(f.env,tool,f.options);
  f.change('first-probe-only');
  assert.equal((await verifyManufacturerDocuments(f.env,tool,f.options)).status,'pending_confirmation');
  f.change('baseline');
  assert.equal((await verifyManufacturerDocuments(f.env,tool,f.options)).status,'unchanged');
  assert.equal(f.events[0].event_type,'catalog_docs_reset');
  f.change('first-probe-only');
  assert.equal((await verifyManufacturerDocuments(f.env,tool,f.options)).status,'pending_confirmation','reverted fingerprint must require a new confirmation');
  f.status('blocked_or_limited');
  const blocked=await verifyManufacturerDocuments(f.env,tool,f.options);
  assert.equal(blocked.status,'documentation_warning');
  assert.equal(blocked.changed,false);
  assert.equal(f.events[0].event_type,'catalog_docs_pending');
  f.status('ok');f.redirect('https://unrelated.example/landing');
  assert.equal((await verifyManufacturerDocuments(f.env,tool,f.options)).status,'documentation_warning');
  assert.equal(f.events[0].event_type,'catalog_docs_pending');
});
test('Growth Brain itself owns bounded two-hourly documentary verification, no new engine',()=>{
  assert.equal(missionOwner('catalog_runtime_quality'),'growth_scheduler');
  assert.equal(SCHEDULED_MISSIONS.catalog_runtime_quality.cron,TOOLSCOUT_CRONS.hourly);
  assert.equal(SCHEDULED_MISSIONS.catalog_runtime_quality.subcadence,'hourly_bounded_six_official_products_or_recovery');
  const scheduler=fs.readFileSync(new URL('../growth-scheduler.js',import.meta.url),'utf8');
  assert.match(scheduler,/if\(twoHourly\)\{\s*scheduleTask\(ctx,runWithLedger\(env,\{engine:'catalog',mission:'runtime_quality'/);
  const catalog=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
  assert.match(catalog,/documentation_changed:documentationChanged/);
  assert.match(catalog,/injectPendingReview\(html,snapshot.stateMap.get\(key\)\)/);
  assert.match(catalog,/WHERE status IN \('published','admitted_coverage','quality_hold'\)/);
});
