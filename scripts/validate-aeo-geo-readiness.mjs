import fs from 'node:fs';

const contexts = JSON.parse(fs.readFileSync('data/decision-context.json','utf8'));
const failures = [];
const warnings = [];
let checked = 0;

for (const slug of Object.keys(contexts)) {
  const file = `${slug}.html`;
  if (!fs.existsSync(file)) { warnings.push(`${slug}: generated page missing`); continue; }
  checked++;
  const html = fs.readFileSync(file,'utf8');
  const tests = [
    ['canonical', /<link[^>]+rel=["']canonical["'][^>]*>/i],
    ['answer-first lead', /<p class=["']lead["']>[^<]{40,}/i],
    ['decision context', new RegExp(`data-decision-context=["']${slug}["']`, 'i')],
    ['decision constraints', /Decision constraints/i],
    ['structured data', /application\/ld\+json/i],
    ['methodology or independence signal', /methodology|independent|affiliate/i]
  ];
  for (const [name, regex] of tests) if (!regex.test(html)) failures.push(`${slug}: missing ${name}`);
}

for (const required of ['llms.txt','robots.txt','sitemap.xml']) {
  if (!fs.existsSync(required)) failures.push(`site surface: missing ${required}`);
}

const result = {
  checked,
  failures: failures.length,
  warnings: warnings.length,
  methodology: 'AEO/GEO gate checks crawlability, answer-first lead copy, explicit decision context, constraints, structured data and trust/methodology signals on decision-context guides. It does not claim or measure inclusion in any specific AI answer engine.',
  failureDetails: failures,
  warningDetails: warnings
};
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/aeo-geo-readiness.json', JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
