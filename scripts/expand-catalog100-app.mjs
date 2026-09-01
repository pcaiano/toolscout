import fs from 'node:fs';

const file='app.js';
let s=fs.readFileSync(file,'utf8');

const oldChoices="choices:[['crm','Manage customers and sales'],['marketing','Marketing and automation'],['seo','Improve SEO and search visibility'],['forms','Collect information with forms'],['automation','Automate repetitive work']]";
const newChoices="choices:[['crm','Manage customers and sales'],['marketing','Marketing and automation'],['seo','Improve SEO and search visibility'],['forms','Collect information with forms'],['automation','Automate repetitive work'],['sales','Find and reach prospects'],['support','Support customers'],['social','Manage social media'],['website','Build a website'],['analytics','Understand product or website usage'],['ai-assistant','Use an AI assistant'],['developer','Build software'],['ecommerce','Sell online'],['design','Create visual content'],['business','Manage projects and teamwork']]";
if(!s.includes(oldChoices)) throw new Error('Guided goal choices signature not found');
s=s.replace(oldChoices,newChoices);

const oldInference="if(!p.goal&&/automation|automate|workflow/.test(q))p.goal='automation';if(!p.goal&&/marketing|email|ads?/.test(q))p.goal='marketing';";
const newInference="if(!p.goal&&/automation|automate|workflow/.test(q))p.goal='automation';if(!p.goal&&/prospect|cold email|outbound|sales engagement|lead database/.test(q))p.goal='sales';if(!p.goal&&/support|helpdesk|ticketing|customer service/.test(q))p.goal='support';if(!p.goal&&/social media|social scheduling|instagram|linkedin content/.test(q))p.goal='social';if(!p.goal&&/website builder|build a website|webflow|framer|website platform/.test(q))p.goal='website';if(!p.goal&&/analytics|funnels|retention|session replay|user behavior/.test(q))p.goal='analytics';if(!p.goal&&/ai assistant|chatbot|research assistant/.test(q))p.goal='ai-assistant';if(!p.goal&&/developer|coding|code editor|devops|deployment/.test(q))p.goal='developer';if(!p.goal&&/ecommerce|online store|sell online|commerce/.test(q))p.goal='ecommerce';if(!p.goal&&/design|graphic|ui design|visual content/.test(q))p.goal='design';if(!p.goal&&/project|team collaboration|productivity|whiteboard/.test(q))p.goal='business';if(!p.goal&&/marketing|email|ads?/.test(q))p.goal='marketing';";
if(!s.includes(oldInference)) throw new Error('Inference signature not found');
s=s.replace(oldInference,newInference);

const oldDetect="if(i.slug.includes('seo')&&/seo|keywords|organic|search/.test(q))s+=4;if(s>bs)";
const newDetect="if(i.slug.includes('seo')&&/seo|keywords|organic|search/.test(q))s+=4;if(i.category==='sales'&&/prospect|cold email|outbound|sales engagement|lead database/.test(q))s+=5;if(i.category==='support'&&/support|helpdesk|ticketing|customer service/.test(q))s+=5;if(i.category==='social'&&/social media|social scheduling|instagram|linkedin content/.test(q))s+=5;if(i.category==='website'&&/website builder|build a website|website platform|landing page/.test(q))s+=5;if(i.category==='analytics'&&/analytics|funnels|retention|session replay|user behavior/.test(q))s+=5;if(i.category==='ai-research'&&/ai research|research assistant|source synthesis/.test(q))s+=5;if(i.category==='ai-assistant'&&/ai assistant|chatbot|general ai/.test(q))s+=5;if(i.category==='developer'&&/developer|coding|code editor|devops|deployment/.test(q))s+=5;if(i.category==='ecommerce'&&/ecommerce|online store|sell online|commerce/.test(q))s+=5;if(i.category==='design'&&/design|graphic|ui design|visual content/.test(q))s+=5;if(i.category==='content'&&/video editing|screen recording|video content|podcast/.test(q))s+=5;if(s>bs)";
if(!s.includes(oldDetect)) throw new Error('Intent detection signature not found');
s=s.replace(oldDetect,newDetect);

const oldLabels="automation:'Automation',free:'Free budget'";
const newLabels="automation:'Automation',sales:'Sales prospecting',support:'Customer support',social:'Social media',website:'Website',analytics:'Analytics','ai-assistant':'AI assistant',developer:'Developer tools',ecommerce:'Ecommerce',design:'Design',business:'Projects & teamwork',free:'Free budget'";
if(!s.includes(oldLabels)) throw new Error('Labels signature not found');
s=s.replace(oldLabels,newLabels);

fs.writeFileSync(file,s);
console.log('Expanded guided flow for Catalog 100 categories');
