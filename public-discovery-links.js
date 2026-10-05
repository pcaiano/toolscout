const SEO_DISCOVERY_LINKS=Object.freeze({
  '/guides':[
    ['/methodology','Methodology'],['/categories','Software categories'],['/crm-tools','CRM tools'],['/seo-tools','SEO tools'],['/software-trends-index','Software trends index'],['/best-affordable-crm','Best affordable CRM'],['/best-workflow-automation-tools','Best workflow automation tools']
  ],
  '/compare':[
    ['/apollo-vs-lemlist','Apollo vs Lemlist'],['/brevo-vs-mailchimp','Brevo vs Mailchimp'],['/hubspot-vs-pipedrive','HubSpot vs Pipedrive'],['/n8n-vs-make','n8n vs Make'],['/semrush-vs-ahrefs','Semrush vs Ahrefs'],['/tally-vs-typeform','Tally vs Typeform'],['/webflow-vs-framer','Webflow vs Framer']
  ],
  '/tools':[
    ['/tools/adobe-express','Adobe Express'],['/tools/attio','Attio'],['/tools/basecamp','Basecamp'],['/tools/brevo','Brevo'],['/tools/constant-contact','Constant Contact'],['/tools/fillout','Fillout'],['/tools/github','GitHub'],['/tools/jira','Jira'],['/tools/mailchimp','Mailchimp'],['/tools/notebooklm','NotebookLM'],['/tools/replit','Replit'],['/tools/typeform','Typeform'],['/tools/webflow','Webflow']
  ]
});

function canonicalPath(pathname){
  const p=String(pathname||'/');
  if(p==='/index.html')return'/';
  return p.replace(/\.html$/i,'').replace(/\/$/,'')||'/';
}

export function injectSeoDiscoveryLinks(body,pathname){
  const path=canonicalPath(pathname),html=String(body||'');
  // Tools, Guides and Compare already contain deliberate crawlable internal
  // navigation. A second visible link farm harms the product experience and
  // duplicates links already present in the primary interface.
  if(['/tools','/guides','/compare'].includes(path))return html;
  const items=SEO_DISCOVERY_LINKS[path];
  if(!items?.length||html.includes('data-ts-search-discovery="1"'))return html;
  const links=items.map(([href,label])=>`<a href="${href}">${label}</a>`).join('');
  const section=`<section data-ts-search-discovery="1" aria-label="Explore more ToolScout resources" style="max-width:1100px;margin:44px auto 24px;padding:20px 22px;border-top:1px solid #e4e7ec"><h2 style="font-size:16px;margin:0 0 12px">Explore more ToolScout resources</h2><div style="display:flex;flex-wrap:wrap;gap:9px 14px">${links}</div></section>`;
  return html.replace(/<\/body>/i,section+'</body>');
}

export {SEO_DISCOVERY_LINKS};
