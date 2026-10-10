import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('OpenAPI 3.1 describes the real nullable commercial URL without losing canonical profiles',()=>{
 const openapi=JSON.parse(read('openapi.json'));
 assert.equal(openapi.openapi,'3.1.0');
 const recommend=openapi.paths['/api/recommend'].get.responses['200']
   .content['application/json'].schema.properties.recommendations.items;
 assert.ok(recommend.required.includes('profile_url'));
 assert.ok(recommend.required.includes('tool_url'));
 assert.equal(recommend.properties.profile_url.type,'string');
 assert.equal(recommend.properties.profile_url.format,'uri');
 const commercial=recommend.properties.tool_url;
 assert.deepEqual(commercial.type,['string','null']);
 assert.equal(commercial.format,'uri');
 assert.match(commercial.description,/approved.*https.*affiliate route/i);
 assert.match(commercial.description,/null/i);
 assert.match(commercial.description,/profile_url/);
 assert.deepEqual(recommend.properties.match_type.enum,['personalized','category_fit','decision_qualified']);
 assert.ok(openapi.paths['/api/recommend'].get.responses['200'].content['application/json'].schema.properties.recommendation_type.enum.includes('decision_shortlist'));

});

test('public agent instructions never tell AI to invent visits for unapproved vendors',()=>{
 const publicDocs=read('agents.md');
 assert.match(publicDocs,/tool_url.*null/);
 assert.match(publicDocs,/profile_url/);
 assert.match(publicDocs,/Never construct a vendor or affiliate link/);
 assert.match(read('docs/DECISION-EVIDENCE-CONTRACT.md'),/tool_url: null/);
});
