-- Create settings table for app configuration
-- This table stores various app settings like app title, feature flags, etc.

CREATE TABLE IF NOT EXISTS settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on key for faster lookups
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Insert default settings if not exists
INSERT INTO settings (key, value)
VALUES (
  'app_settings',
  '{
    "appTitle": "Semihan-FM",
    "appName": "Semihan Football Manager",
    "tutorialEnabled": true,
    "features": {
      "players": true,
      "planner": true,
      "draft": true,
      "formation": true,
      "stats": true
    }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for now (adjust based on your auth needs)
-- Everyone can read settings
CREATE POLICY "Allow public read access to settings"
  ON settings
  FOR SELECT
  USING (true);

-- Everyone can update settings (you may want to restrict this to authenticated users)
CREATE POLICY "Allow public update access to settings"
  ON settings
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Everyone can insert settings (you may want to restrict this)
CREATE POLICY "Allow public insert access to settings"
  ON settings
  FOR INSERT
  WITH CHECK (true);

-- Add a comment for documentation
COMMENT ON TABLE settings IS 'Stores application-wide settings and feature flags';
COMMENT ON COLUMN settings.key IS 'Unique identifier for the setting';
COMMENT ON COLUMN settings.value IS 'JSONB value containing the setting data';
