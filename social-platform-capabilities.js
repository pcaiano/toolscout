import {TOOLSCOUT_SOCIAL_PROFILES} from './social-profiles.js';

export const SOCIAL_PLATFORM_CAPABILITIES=Object.freeze({
  linkedin:Object.freeze({publish:true,inbound_monitor:false,reply_write:false,reaction_write:false,attribution:true,audience_mode:'not_connected'}),
  x:Object.freeze({publish:true,inbound_monitor:false,reply_write:false,reaction_write:false,attribution:true,audience_mode:'not_connected'}),
  bluesky:Object.freeze({publish:true,inbound_monitor:true,reply_write:true,reaction_write:false,attribution:true,audience_mode:'autonomous_reply'}),
  devto:Object.freeze({publish:true,inbound_monitor:true,reply_write:false,reaction_write:true,attribution:true,audience_mode:'monitor_and_human_reply'}),
  pinterest:Object.freeze({publish:true,inbound_monitor:false,reply_write:false,reaction_write:false,attribution:true,audience_mode:'analytics_only'})
});

export function socialPlatformCapabilityHealth(){
  const active=TOOLSCOUT_SOCIAL_PROFILES.map(p=>p.key);
  const missing=active.filter(key=>!SOCIAL_PLATFORM_CAPABILITIES[key]);
  const classified=active.filter(key=>Boolean(SOCIAL_PLATFORM_CAPABILITIES[key]));
  return{
    ok:missing.length===0,
    policy:'new_profile_requires_capability_classification_v1',
    active_profiles:active,
    classified_profiles:classified,
    missing_classification:missing,
    rule:{
      content_engine:'enable automatically when publish=true',
      audience_engine:'enable automatically when inbound_monitor=true',
      autonomous_reply:'enable only when reply_write=true and platform policy permits',
      reactions:'enable only when reaction_write=true and idempotent/safe target identity is available',
      human_gate:'required for textual interaction when inbound_monitor=true and reply_write=false',
      attribution:'enable when attribution=true'
    }
  };
}
