ALTER TABLE click_events ADD COLUMN affiliate_active_at_click INTEGER;
ALTER TABLE click_events ADD COLUMN affiliate_program TEXT;
ALTER TABLE click_events ADD COLUMN affiliate_route TEXT;

CREATE INDEX IF NOT EXISTS idx_click_affiliate_active_created
  ON click_events(affiliate_active_at_click, created_at);

CREATE INDEX IF NOT EXISTS idx_click_affiliate_program
  ON click_events(affiliate_program);
