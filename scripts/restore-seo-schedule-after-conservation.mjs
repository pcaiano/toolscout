import fs from 'node:fs';

const workflowPath='.github/workflows/seo-engine-v2.yml';
const resumePolicyPath='data/github-actions-resume-policy.json';
const resumePolicy=fs.existsSync(resumePolicyPath)?JSON.parse(fs.readFileSync(resumePolicyPath,'utf8')):null;
if(resumePolicy?.enabled!==true){
  console.log(JSON.stringify({changed:false,reason:'actions-resume-interlock-locked',policy:resumePolicyPath}));
  process.exit(0);
}
const now=new Date();
const unlockAt=new Date('2026-10-01T00:00:00Z');
if(now<unlockAt){
  console.log(JSON.stringify({changed:false,reason:'conservation-window-active',unlockAt:unlockAt.toISOString()}));
  process.exit(0);
}
const before=fs.readFileSync(workflowPath,'utf8');
const bootstrap="cron: '17 5 * 10 *'";
const daily="cron: '17 5 * * *'";
if(before.includes(daily)){
  console.log(JSON.stringify({changed:false,reason:'daily-cadence-already-active'}));
  process.exit(0);
}
if(!before.includes(bootstrap)){
  console.log(JSON.stringify({changed:false,reason:'bootstrap-cadence-not-found'}));
  process.exit(0);
}
const after=before.replace(bootstrap,daily);
fs.writeFileSync(workflowPath,after,'utf8');
console.log(JSON.stringify({changed:true,from:bootstrap,to:daily,reason:'conservation-window-ended'}));
