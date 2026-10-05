import fs from 'node:fs';
import crypto from 'node:crypto';

const esc=value=>String(value??'').replaceAll("'","''");
const lit=value=>`'${esc(value)}'`;
const safe=(value,max=4000)=>String(value??'').slice(0,max);
const codeOf=value=>{
  const code=String(value||'integrity_failure').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,120);
  return code||'integrity_failure';
};

export function buildIntegrityIncidentSql(report={},meta={}){
  if(report?.ok===true){
    return `UPDATE growth_architecture_incidents
SET status='resolved',
    resolved_at=datetime('now'),
    resolution_note='Integrity Audit returned healthy after the reported failure.',
    email_status=CASE WHEN email_sent_at IS NOT NULL THEN 'pending_resolved' ELSE 'resolved_without_email' END,
    updated_at=datetime('now')
WHERE status='open' AND incident_key LIKE 'integrity_audit:%';\n`;
  }

  const code=codeOf(report?.code||report?.message);
  const key=`integrity_audit:${code}`;
  const incidentId=`gbi_${crypto.randomUUID()}`;
  const dispatchToken=`gbdispatch_${crypto.randomUUID()}`;
  const message=safe(report?.message||'ToolScout 2.0 Integrity Audit detected a production invariant failure.',1200);
  const title=safe(`Integrity Audit failure: ${message.split(':')[0]||code}`,180);
  const evidence=JSON.stringify({
    code,
    message,
    evidence:report?.evidence||null,
    checked_at:report?.checked_at||new Date().toISOString(),
    github_run_id:meta.github_run_id||null,
    github_run_url:meta.github_run_url||null,
    github_sha:meta.github_sha||null
  });
  const corrections=JSON.stringify([
    'The Integrity Audit captured the production evidence and failed closed.',
    'The failure was persisted automatically into the Growth Brain architecture incident queue.'
  ]);
  const why='A failed production invariant must be investigated rather than hidden or converted to a healthy state.';
  const recommendation='Inspect the attached integrity evidence, repair the underlying invariant, then rerun the Integrity Audit until it reports healthy.';

  return `INSERT INTO growth_architecture_incidents(
  incident_id,incident_key,severity,status,engine,executor,action,title,summary,evidence_json,self_corrections_json,
  why_code_required,recommended_intervention,approval_required,email_status,dispatch_token,first_detected_at,last_detected_at,updated_at)
VALUES(
  ${lit(incidentId)},${lit(key)},'P1','open','integrity_audit','github_actions',${lit(code)},${lit(title)},${lit(message)},
  ${lit(evidence)},${lit(corrections)},${lit(why)},${lit(recommendation)},1,'pending',${lit(dispatchToken)},
  datetime('now'),datetime('now'),datetime('now'))
ON CONFLICT(incident_key) DO UPDATE SET
  severity='P1',
  status='open',
  engine='integrity_audit',
  executor='github_actions',
  action=excluded.action,
  title=excluded.title,
  summary=excluded.summary,
  evidence_json=excluded.evidence_json,
  self_corrections_json=excluded.self_corrections_json,
  why_code_required=excluded.why_code_required,
  recommended_intervention=excluded.recommended_intervention,
  approval_required=1,
  last_detected_at=datetime('now'),
  resolved_at=NULL,
  resolution_note=NULL,
  email_status=CASE WHEN growth_architecture_incidents.status='resolved' THEN 'pending' ELSE growth_architecture_incidents.email_status END,
  updated_at=datetime('now');\n`;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const inputPath=process.argv[2]||'integrity-report.json';
  const outputPath=process.argv[3]||'integrity-incident.sql';
  const report=JSON.parse(fs.readFileSync(inputPath,'utf8'));
  const meta={
    github_run_id:process.env.GITHUB_RUN_ID||null,
    github_run_url:process.env.GITHUB_SERVER_URL&&process.env.GITHUB_REPOSITORY&&process.env.GITHUB_RUN_ID
      ?`${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      :null,
    github_sha:process.env.GITHUB_SHA||null
  };
  fs.writeFileSync(outputPath,buildIntegrityIncidentSql(report,meta));
  console.log(JSON.stringify({ok:true,reportOk:report?.ok===true,code:report?.code||null,outputPath},null,2));
}
