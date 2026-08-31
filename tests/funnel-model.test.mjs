import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFunnelEvent, rate } from '../funnel-model.js';
import { ingest } from '../funnel-worker.js';
import dynamicWorker from '../dynamic-worker.js';

const valid = {
  event_id: 'evt_0123456789abcdef',
  session_id: '1e2d3c4b-5a69-4788-9abc-0123456789ab',
  event_type: 'recommendation_completed',
  intent_slug: 'best-crm',
  path: '/',
  source: 'utm:newsletter'
};

test('accepts a canonical event and missing optional fields', () => {
  assert.equal(parseFunnelEvent(valid)?.event_type, 'recommendation_completed');
  assert.equal(parseFunnelEvent({...valid, intent_slug: undefined})?.intent_slug, null);
});

test('rejects invalid type, malformed IDs, hostile strings and arbitrary fields', () => {
  assert.equal(parseFunnelEvent({...valid, event_type: 'purchase'}), null);
  assert.equal(parseFunnelEvent({...valid, session_id: 'not-a-uuid'}), null);
  assert.equal(parseFunnelEvent({...valid, path: '<script>alert(1)</script>'}), null);
  assert.equal(parseFunnelEvent({...valid, source: 'x'.repeat(101)}), null);
  assert.equal(parseFunnelEvent({...valid, arbitrary: 'payload'}), null);
});

test('requires a tool for outbound clicks and avoids fake rates', () => {
  assert.equal(parseFunnelEvent({...valid, event_type: 'outbound_clicked'}), null);
  assert.equal(rate(2, 4), 50);
  assert.equal(rate(0, 0), null);
});

test('ingestion handles valid, malformed, invalid-type and oversized requests safely', async () => {
  const batches=[];
  const env={DB:{prepare(sql){return{bind(...values){return{sql,values}}}},async batch(statements){batches.push(statements)}}};
  const request=body=>new Request('https://trytoolscout.org/api/events',{method:'POST',headers:{'content-type':'application/json'},body});
  assert.equal((await ingest(request(JSON.stringify(valid)),env)).status,202);
  assert.equal(batches.length,1);
  assert.equal(batches[0].length,2);
  assert.equal((await ingest(request('{'),env)).status,400);
  assert.equal((await ingest(request(JSON.stringify({...valid,event_type:'purchase'})),env)).status,400);
  const oversized=new Request('https://trytoolscout.org/api/events',{method:'POST',headers:{'content-type':'application/json','content-length':'3000'},body:'{}'});
  assert.equal((await ingest(oversized,env)).status,413);
});

test('outbound redirect stays compatible, records canonical rows, and excludes curl smoke traffic', async () => {
  const batches=[];
  const env={
    ASSETS:{async fetch(){return Response.json({'demo-tool':{enabled:true,url:'https://vendor.example/?ref=toolscout'}})}},
    DB:{prepare(sql){return{bind(...values){return{sql,values}}}},async batch(statements){batches.push(statements)}}
  };
  const browser=new Request('https://trytoolscout.org/go/demo-tool',{headers:{referer:'https://trytoolscout.org/best-crm.html','user-agent':'Mozilla/5.0'}});
  const response=await dynamicWorker.fetch(browser,env,{});
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'https://vendor.example/?ref=toolscout');
  assert.equal(batches.length,1);
  assert.equal(batches[0].length,3);
  const smoke=new Request('https://trytoolscout.org/go/demo-tool',{headers:{'user-agent':'curl/8.0'}});
  assert.equal((await dynamicWorker.fetch(smoke,env,{})).status,302);
  assert.equal(batches.length,1);
});
