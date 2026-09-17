const START='<!-- commercial-cluster:start -->';
const END='<!-- commercial-cluster:end -->';

const CLUSTERS={
  'systeme-io':[['/best-funnel-builder','Best Funnel Builder'],['/best-marketing-automation-tools','Best Marketing Automation Tools'],['/best-email-marketing-tools','Best Email Marketing Tools']],
  'beehiiv':[['/beehiiv-vs-kit','beehiiv vs Kit'],['/best-email-marketing-tools','Best Email Marketing Tools'],['/best-funnel-builder','Best Funnel Builder']],
  'jotform':[['/best-forms-for-small-business','Best Forms for Small Business'],['/best-lead-capture-forms','Best Lead Capture Forms']],
  'adcreative-ai':[['/best-ai-marketing-tools','Best AI Marketing Tools']],
  'pipedrive':[['/hubspot-vs-pipedrive','HubSpot vs Pipedrive'],['/best-crm-for-sales-teams','Best CRM for Sales Teams'],['/best-crm-for-small-business','Best CRM for Small Business'],['/best-affordable-crm','Best Affordable CRM']],
  'shopify':[['/shopify-vs-webflow','Shopify vs Webflow'],['/best-ecommerce-platforms','Best Ecommerce Platforms']],
  'make':[['/make-vs-zapier','Make vs Zapier'],['/n8n-vs-make','n8n vs Make'],['/best-no-code-automation-tools','Best No Code Automation Tools'],['/best-workflow-automation-tools','Best Workflow Automation Tools']],
  'typeform':[['/tally-vs-typeform','Tally vs Typeform'],['/best-forms-for-small-business','Best Forms for Small Business'],['/best-lead-capture-forms','Best Lead Capture Forms']],
  'zoho-crm':[['/best-crm-for-sales-teams','Best CRM for Sales Teams'],['/best-crm-for-small-business','Best CRM for Small Business'],['/best-affordable-crm','Best Affordable CRM']],
  'se-ranking':[['/best-seo-tools','Best SEO Tools'],['/best-seo-tools-for-agencies','Best SEO Tools for Agencies'],['/best-seo-keyword-research-tools','Best SEO Keyword Research Tools']],
  'kit':[['/beehiiv-vs-kit','beehiiv vs Kit'],['/best-email-marketing-tools','Best Email Marketing Tools'],['/best-marketing-automation-tools','Best Marketing Automation Tools']],
  'gorgias':[['/best-customer-support-tools','Best Customer Support Tools'],['/best-ecommerce-platforms','Best Ecommerce Platforms']],
  'mailerlite':[['/best-email-marketing-tools','Best Email Marketing Tools'],['/best-marketing-automation-tools','Best Marketing Automation Tools']],
  'podia':[['/best-funnel-builder','Best Funnel Builder'],['/best-email-marketing-tools','Best Email Marketing Tools']],
  'lemlist':[['/apollo-vs-lemlist','Apollo vs lemlist'],['/best-cold-email-tools','Best Cold Email Tools'],['/best-sales-prospecting-tools','Best Sales Prospecting Tools']],
  'instantly':[['/best-cold-email-tools','Best Cold Email Tools'],['/best-sales-prospecting-tools','Best Sales Prospecting Tools']],
  'apollo':[['/apollo-vs-lemlist','Apollo vs lemlist'],['/best-sales-prospecting-tools','Best Sales Prospecting Tools'],['/best-cold-email-tools','Best Cold Email Tools']]
};

function normalizePath(pathname){let p=String(pathname||'/').replace(/\.html$/i,'');if(p.length>1)p=p.replace(/\/+$/,'');return p||'/';}

export function applyCommercialCluster(html,pathname){
  const path=normalizePath(pathname);
  const slug=path.match(/^\/tools\/([^/]+)$/)?.[1];
  const links=slug?CLUSTERS[slug]:null;
  if(!links?.length)return html;
  let out=String(html||'').replace(/<!-- commercial-cluster:start -->[\s\S]*?<!-- commercial-cluster:end -->/g,'');
  const cards=links.map(([href,label])=>`<a class="related-card" href="${href}"><strong>${label}</strong><span>Open decision page</span></a>`).join('');
  const block=`${START}<section class="section commercial-cluster" data-commercial-cluster="${slug}"><h2>Related buying guides and comparisons</h2><p>Use these decision pages to compare the workflow around this tool. Affiliate relationships do not change ToolScout rankings, scores or comparison outcomes.</p><div class="related">${cards}</div></section>${END}`;
  const markers=['<section class="section"><h2>Frequently asked questions</h2>','<p class="small">','</body>'];
  for(const marker of markers){if(out.includes(marker))return out.replace(marker,`${block}${marker}`);}
  return out+block;
}

export const COMMERCIAL_CLUSTER_SLUGS=Object.freeze(Object.keys(CLUSTERS));
