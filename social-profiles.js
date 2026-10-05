export const TOOLSCOUT_SOCIAL_PROFILES=Object.freeze([
  {key:'linkedin',label:'LinkedIn',url:'https://www.linkedin.com/company/146229906/'},
  {key:'x',label:'X / Twitter',url:'https://x.com/trytoolscout'},
  {key:'bluesky',label:'Bluesky',url:'https://bsky.app/profile/trytoolscout.bsky.social'},
  {key:'devto',label:'DEV Community',url:'https://dev.to/trytoolscout'},
  {key:'pinterest',label:'Pinterest',url:'https://www.pinterest.com/trytoolscout/'},
  {key:'threads',label:'Threads',url:'https://www.threads.com/@trytoolscout'}
]);

// Social profile URLs remain canonical distribution metadata, but are not rendered
// on the public site. Public HTML permits internal navigation and monetizable /go/
// CTAs only, so a social footer would become dead text after outbound sanitization.
export async function injectToolScoutSocialFooter(response){
  return response;
}
