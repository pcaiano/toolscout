import assert from 'node:assert/strict';
import fs from 'node:fs';
import {competitiveOutreachExclusion,COMPETITIVE_OUTREACH_POLICY_VERSION} from '../distribution-outreach-policy.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

assert.equal(COMPETITIVE_OUTREACH_POLICY_VERSION,'competitive-outreach-v1');
for(const domain of ['bestofai.com','www.bestofai.io','dynamite-ai.com']){
  const result=competitiveOutreachExclusion({domain,surface_type:'distribution_surface'});
  assert.equal(result.excluded,true,`${domain} must never receive ToolScout publisher outreach`);
}
assert.equal(competitiveOutreachExclusion({domain:'future-directory.example',surface_type:'ai_directory_syndication'}).excluded,true);
assert.equal(competitiveOutreachExclusion({domain:'publisher.example',surface_type:'editorial_resource',surface_name:'Independent software publisher'}).excluded,false);
assert.equal(competitiveOutreachExclusion({domain:'therundown.example',surface_type:'newsletter_directory',surface_name:'AI newsletter'}).excluded,false);

const network=read('distribution-network-worker.js');
assert.match(network,/competitiveOutreachExclusion/);
assert.match(network,/status='suppressed_competitor'/);
assert.match(network,/Listing\/submission routes remain eligible/);

const sender=read('distribution-sender-worker.js');
assert.match(sender,/blockCompetitiveOutreachTask/);
assert.match(sender,/competitive_outreach_suppressed/);
assert.match(sender,/No email was leased or sent/);

console.log('Competitive discovery sites are excluded from outbound while submission routes remain independent.');
