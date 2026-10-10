/**
 * Recover commercially useful, crawlable canonical pages before ancillary
 * support and legal pages. Observed Search impressions always take precedence.
 * This is queue ordering only; it never changes robots, canonical, or ranking.
 */
export function indexRecoveryPriority(pathname,{impressions=0}={}){
  const p=String(pathname||'/').split('?')[0].replace(/\\.html$/i,'').replace(/\\/$/,'')||'/';
  if(Number(impressions)>0)return 96;
  if(/^\\/best-[a-z0-9-]+$/i.test(p)||/^\\/tools\\/[a-z0-9-]+$/i.test(p))return 88;
  if(['/methodology','/software-trends-index','/crm-tools','/seo-tools','/categories','/distribution/publisher-kit'].includes(p))return 85;
  if(/^\\/news\\/[a-z0-9-]+$/i.test(p))return 82;
  if(['/terms','/privacy','/support','/affiliate-disclosure'].includes(p))return 40;
  return 70;
}
