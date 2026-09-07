import fs from 'node:fs';

const affiliatePath = 'data/affiliate.json';
const pipelinePath = 'data/affiliate-pipeline.json';

const affiliates = JSON.parse(fs.readFileSync(affiliatePath, 'utf8'));
const pipeline = JSON.parse(fs.readFileSync(pipelinePath, 'utf8'));
const programs = Array.isArray(pipeline.verified_programs) ? pipeline.verified_programs : [];
const today = new Date().toISOString().slice(0, 10);

const bySlug = new Map(programs.map((program) => [program.slug, program]));

for (const [slug, routing] of Object.entries(affiliates)) {
  const program = bySlug.get(slug);
  if (!program) continue;

  const isLive = routing?.enabled === true && typeof routing?.url === 'string' && routing.url.trim().length > 0;

  if (isLive) {
    program.status = 'active';
    program.last_verified = today;
    program.next_action = 'Keep the verified affiliate URL live and monitor ToolScout clicks, conversions and commissions; preserve affiliate-neutral editorial ranking.';
    program.coverage_sync = {
      production_enabled: true,
      synced_from: 'data/affiliate.json',
      synced_at: new Date().toISOString()
    };
  } else if (program.status === 'active') {
    program.status = 'inactive';
    program.last_verified = today;
    program.next_action = 'Affiliate routing is not live. Verify approval and a personal affiliate URL before re-enabling production monetization.';
    program.coverage_sync = {
      production_enabled: false,
      synced_from: 'data/affiliate.json',
      synced_at: new Date().toISOString()
    };
  }
}

fs.writeFileSync(pipelinePath, `${JSON.stringify(pipeline)}\n`);
console.log(`Synced affiliate pipeline against ${Object.keys(affiliates).length} routing records.`);
