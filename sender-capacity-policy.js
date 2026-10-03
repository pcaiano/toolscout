const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};

async function first(env,sql){
  try{return await env.DB.prepare(sql).first()}catch{return null}
}

export function senderCapacityDirective(snapshot={}){
  const ready=n(snapshot.readyContacts);
  const inFlight=n(snapshot.inFlight);
  const supplyReady=n(snapshot.supplyReadyEmail);
  const discoveredUnrouted=n(snapshot.discoveredUnrouted);
  const exhausted=ready<=0&&inFlight<=0&&supplyReady<=0;
  const mismatch=(ready>0)!==(supplyReady>0);
  return {
    exhausted,
    mismatch,
    ready_contacts:ready,
    in_flight:inFlight,
    supply_ready_email:supplyReady,
    discovered_unrouted:discoveredUnrouted,
    cooldown:n(snapshot.cooldown),
    ready_routes:n(snapshot.readyRoutes),
    email_outreach_capacity:exhausted?0:ready,
    reallocation:exhausted?{
      mode:'sender_supply_exhausted',
      make_sender:'paused_no_admissible_supply',
      self_service_distribution:'priority_boosted',
      authority_non_email:'priority_boosted',
      search_content:'continue_at_full_capacity'
    }:{
      mode:'sender_supply_available',
      make_sender:'enabled_bounded',
      self_service_distribution:'normal',
      authority_non_email:'normal',
      search_content:'normal'
    }
  };
}

export async function senderCapacitySnapshot(env){
  const [vendor,network,inFlight,supply]=await Promise.all([
    first(env,`SELECT COUNT(DISTINCT v.tool_slug) n
      FROM distribution_vendor_amplification v
      WHERE v.status='contact_found'
        AND v.contact_method='public_role_email'
        AND v.contact_email IS NOT NULL
        AND (v.public_dispatch_leased_at IS NULL OR v.public_dispatch_leased_at<datetime('now','-20 minutes'))
        AND NOT EXISTS (
          SELECT 1 FROM distribution_vendor_amplification prior
          WHERE prior.status='sent'
            AND prior.outreach_sent_at>=datetime('now','-30 days')
            AND (
              prior.tool_slug=v.tool_slug
              OR lower(COALESCE(prior.contact_email,''))=lower(COALESCE(v.contact_email,''))
              OR lower(COALESCE(prior.vendor_domain,''))=lower(COALESCE(v.vendor_domain,''))
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM distribution_network_outreach prior_network
          WHERE prior_network.status IN ('sent','adopted')
            AND prior_network.outreach_sent_at>=datetime('now','-30 days')
            AND lower(COALESCE(prior_network.domain,''))=lower(COALESCE(v.vendor_domain,''))
        )`),
    first(env,`SELECT COUNT(*) n
      FROM distribution_network_outreach n
      WHERE n.status='contact_found'
        AND n.contact_email IS NOT NULL
        AND (n.public_dispatch_leased_at IS NULL OR n.public_dispatch_leased_at<datetime('now','-20 minutes'))
        AND NOT EXISTS (
          SELECT 1 FROM distribution_network_outreach prior
          WHERE prior.status IN ('sent','adopted')
            AND prior.outreach_sent_at>=datetime('now','-30 days')
            AND (
              lower(COALESCE(prior.contact_email,''))=lower(COALESCE(n.contact_email,''))
              OR lower(COALESCE(prior.domain,''))=lower(COALESCE(n.domain,''))
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM distribution_vendor_amplification prior_vendor
          WHERE prior_vendor.status='sent'
            AND prior_vendor.outreach_sent_at>=datetime('now','-30 days')
            AND lower(COALESCE(prior_vendor.vendor_domain,''))=lower(COALESCE(n.domain,''))
        )
        AND NOT EXISTS (
          SELECT 1 FROM distribution_opportunities o
          WHERE o.surface_slug=n.surface_slug AND o.status='policy_blocked'
        )`),
    first(env,`SELECT
      (SELECT COUNT(*) FROM distribution_vendor_amplification
        WHERE public_dispatch_leased_at>=datetime('now','-20 minutes') AND status<>'sent')
      +(SELECT COUNT(*) FROM distribution_network_outreach
        WHERE public_dispatch_leased_at>=datetime('now','-20 minutes') AND status NOT IN ('sent','adopted')) n`),
    first(env,`SELECT ready_email,email_discovered_unrouted,cooldown,ready_route,updated_at
      FROM contact_supply_metrics WHERE id='global' LIMIT 1`)
  ]);
  const snapshot={
    vendorReady:n(vendor?.n),
    networkReady:n(network?.n),
    readyContacts:n(vendor?.n)+n(network?.n),
    inFlight:n(inFlight?.n),
    supplyReadyEmail:n(supply?.ready_email),
    discoveredUnrouted:n(supply?.email_discovered_unrouted),
    cooldown:n(supply?.cooldown),
    readyRoutes:n(supply?.ready_route),
    observedAt:supply?.updated_at||null
  };
  return {...snapshot,...senderCapacityDirective(snapshot)};
}
