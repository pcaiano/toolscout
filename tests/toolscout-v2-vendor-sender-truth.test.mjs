import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {collapseVendorGrowthRows} from '../distribution-orchestrator-worker.js';

test('vendor sender opportunity requires an exact public role email and no recent send cooldown',()=>{
  const now=Date.parse('2026-10-03T01:00:00Z');
  const rows=[
    {tool_slug:'n8n',priority_score:99,vendor_status:'contact_found',vendor_contact_email:'partners@n8n.io',vendor_contact_method:'public_role_email',asset_url:'https://trytoolscout.org/tools/n8n'},
    {tool_slug:'n8n',priority_score:98,vendor_status:'sent',outreach_sent_at:'2026-09-25 12:00:00',vendor_contact_email:'partners@n8n.io',vendor_contact_method:'public_role_email',asset_url:'https://trytoolscout.org/tools/n8n'},
    {tool_slug:'notion',priority_score:95,vendor_status:'fallback_exhausted',vendor_contact_email:null,vendor_contact_method:'no_public_role_email',asset_url:'https://trytoolscout.org/tools/notion'},
    {tool_slug:'apollo',priority_score:94,vendor_status:'contact_found',vendor_contact_email:'partners@apollo.io',vendor_contact_method:'public_role_email',asset_url:'https://trytoolscout.org/tools/apollo'}
  ];
  const out=collapseVendorGrowthRows(rows,now);
  const by=new Map(out.map(x=>[x.tool_slug,x]));
  assert.equal(by.get('n8n').vendor_status,'cooldown');
  assert.equal(by.get('n8n').vendor_outreach_ready,false);
  assert.equal(by.get('notion').vendor_outreach_ready,false);
  assert.equal(by.get('apollo').vendor_status,'contact_found');
  assert.equal(by.get('apollo').vendor_outreach_ready,true);
});

test('stale suppressed and queued vendor rows cannot create sender work when no executable contact exists',()=>{
  const out=collapseVendorGrowthRows([
    {tool_slug:'posthog',priority_score:100,vendor_status:'suppressed_asset_mismatch'},
    {tool_slug:'posthog',priority_score:90,vendor_status:'queued'}
  ],Date.parse('2026-10-03T01:00:00Z'));
  assert.equal(out.length,1);
  assert.equal(out[0].vendor_outreach_ready,false);
});

test('growth coordinator gates both sender actions on consolidated vendor readiness',()=>{
  const src=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
  assert.match(src,/const consolidatedToolRows=collapseVendorGrowthRows\(tools\)/);
  assert.match(src,/if\(vendorOutreachReady&&backlinkAcquisition\)actions\.push\('backlink_reference_outreach'\)/);
  assert.match(src,/if\(vendorOutreachReady\)actions\.push\('vendor_amplification'\)/);
  assert.match(src,/vendor_recently_sent:Boolean\(row\.vendor_recently_sent\)/);
});
