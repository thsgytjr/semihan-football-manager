-- Add statusOverride column to matches table
-- This allows admins to manually override the LIVE/UPDATING badge status

ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS "statusOverride" TEXT;

-- Valid values: null (auto), 'live', 'updating', 'off'
-- Default is null which means auto-detect based on match data

COMMENT ON COLUMN matches."statusOverride" IS 
'Manual override for match status badge: null=auto, live=force LIVE, updating=force UPDATING, off=hide badge';
