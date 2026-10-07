import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prioritizedDistributionFeed} from '../distribution-feed-priority.js';

const descriptor='Independent Software Discovery & Decision Engine';
const pluginName='ToolScout: Software Decision Engine';

test('ToolScout public identity is consistent across discovery surfaces',()=>{
  for(const path of [
    'index.html',
    'distribution/publisher-kit.html',
    'agents.md',
    'llms.txt',
    'apis.json',
    'openapi.json',
    'machine-discovery-catalog-runtime.js',
    'social-profiles.js',
    'distribution-embed-worker.js',
    'distribution-feed-priority.js',
    'openai-plugin/README.md',
    '.well-known/ai-catalog.json',
    '.well-known/ard.json'
  ]){
    const content=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.ok(content.includes(descriptor),path+' must include the canonical ToolScout descriptor');
  }

  const plugin=JSON.parse(fs.readFileSync(new URL('../openai-plugin/plugin.json',import.meta.url),'utf8'));
  assert.equal(plugin.extensions['com.openai'].interface.displayName,pluginName);

  const aiCatalog=JSON.parse(fs.readFileSync(new URL('../.well-known/ai-catalog.json',import.meta.url),'utf8'));
  assert.equal(aiCatalog.entries[0].displayName,pluginName);

  const home=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(home.includes('\"@type\":\"WebSite\"'));
  assert.ok(home.includes('\"@type\":\"Organization\"'));
  assert.ok(home.includes('\"slogan\":\"Independent Software Discovery & Decision Engine\"'));

  const publisherKit=fs.readFileSync(new URL('../distribution/publisher-kit.html',import.meta.url),'utf8');
  assert.ok(publisherKit.includes('\"@type\":\"SoftwareApplication\"'));
  assert.ok(publisherKit.includes('\"@id\":\"https://trytoolscout.org/distribution/publisher-kit#finder\"'));
  assert.ok(publisherKit.includes('\"@id\":\"https://trytoolscout.org/#organization\"'));

});

test('routed public distribution feeds expose the canonical ToolScout identity',async()=>{
  const env={ASSETS:{fetch:async request=>{
    const pathname=new URL(request.url).pathname;
    if(pathname==='/data/search-commercial-routing.json')return new Response(JSON.stringify({priorities:[]}),{status:200,headers:{'Content-Type':'application/json'}});
    if(pathname==='/sitemap.xml')return new Response('<urlset><url><loc>https://trytoolscout.org/tools/semrush</loc></url></urlset>',{status:200,headers:{'Content-Type':'application/xml'}});
    return new Response('',{status:404});
  }}};
  const request=new Request('https://trytoolscout.org/api/distribution/feed.json');
  const jsonResponse=await prioritizedDistributionFeed(request,env,'json');
  const jsonBody=await jsonResponse.json();
  assert.ok(jsonBody.description.includes(`ToolScout | ${descriptor} | trytoolscout.org.`));

  const xmlResponse=await prioritizedDistributionFeed(request,env,'xml');
  const xmlBody=await xmlResponse.text();
  assert.ok(xmlBody.includes(`ToolScout | ${descriptor} | trytoolscout.org.`));
});
