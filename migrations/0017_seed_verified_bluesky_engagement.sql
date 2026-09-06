INSERT OR IGNORE INTO audience_events (
  event_id, platform, event_type, direction, status, actor_handle,
  post_uri, parent_uri, risk, source, observed_at, created_at
) VALUES (
  'bsky-out-bafyreibn33o4542tf2pbrk6py7jxm2hdxiq25rrm3bnbaizelu7zmakhim',
  'bluesky',
  'outbound_reply',
  'outbound',
  'published',
  'tommy-martin.bsky.social',
  'at://did:plc:hjawfnxtifnuqcgidlvmas76/app.bsky.feed.post/3muugb7zbcf2k',
  'at://did:plc:i2r6s32rjrsp23miav26ogbl/app.bsky.feed.post/3mun5tfkq3l25',
  'green',
  'make-audience-engine-backfill',
  '2026-09-06T16:34:14Z',
  '2026-09-06T16:34:14Z'
);
