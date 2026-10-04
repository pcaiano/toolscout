export const SEARCH_ACTION_POLICY=Object.freeze({
  clickCaptureMinImpressions:20,
  firstPageProtectMinImpressions:10,
  strikingDistanceMinImpressions:10,
  authorityDepthMinImpressions:20,
  ctrFloorPct:Object.freeze({top3:5,top5:3,firstPage:1.5})
});

export function clickCaptureCtrFloorPct(position){
  const p=Number(position||0);
  if(!(p>0&&p<=10))return null;
  if(p<=3)return SEARCH_ACTION_POLICY.ctrFloorPct.top3;
  if(p<=5)return SEARCH_ACTION_POLICY.ctrFloorPct.top5;
  return SEARCH_ACTION_POLICY.ctrFloorPct.firstPage;
}

export function classifySearchPageAction(row={}){
  const impressions=Math.max(0,Number(row?.impressions||0));
  const clicks=Math.max(0,Number(row?.clicks||0));
  const ctr=Math.max(0,Number(row?.ctr||0));
  const position=Math.max(0,Number(row?.position||0));
  const firstPage=position>0&&position<=10;
  const striking=position>10&&position<=20;
  const ctrFloor=clickCaptureCtrFloorPct(position);
  const clickCaptureEligible=Boolean(
    firstPage
    && impressions>=SEARCH_ACTION_POLICY.clickCaptureMinImpressions
    && ctrFloor!=null
    && ctr<ctrFloor
  );
  const actions=['search_measurement'];
  let lane='seo_measure',action='measure';

  if(position>20&&impressions>=SEARCH_ACTION_POLICY.authorityDepthMinImpressions){
    actions.unshift('content_amplification','deepen_existing_search_asset');
    lane='seo_authority_depth';action='deepen_existing';
  }else if(striking&&impressions>=SEARCH_ACTION_POLICY.strikingDistanceMinImpressions){
    actions.unshift('content_amplification','strengthen_internal_links');
    lane='seo_striking_distance';action='strengthen_existing';
  }else if(firstPage&&impressions>=SEARCH_ACTION_POLICY.firstPageProtectMinImpressions){
    actions.unshift('protect_current_ranking');
    if(clickCaptureEligible)actions.splice(1,0,'improve_click_capture');
    lane='seo_first_page';
    action=clickCaptureEligible?'protect_and_improve_ctr':'protect_current_ranking';
  }else if(position>0&&position<=20){
    actions.unshift('observe_low_sample_ranking');
    lane='seo_low_sample_observation';action='measure_low_sample';
  }

  return{
    actions,
    lane,
    action,
    clickCaptureEligible,
    clickCaptureCtrFloorPct:ctrFloor,
    clickCaptureMinImpressions:SEARCH_ACTION_POLICY.clickCaptureMinImpressions,
    sampleForClickCapture:impressions>=SEARCH_ACTION_POLICY.clickCaptureMinImpressions,
    impressions,clicks,ctr,position
  };
}
