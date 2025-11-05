-- Add teamColors column to matches table
-- This column stores an array of color objects for each team
-- Format: [{bg: '#hex', text: '#hex', border: '#hex', label: 'ColorName'}, ...]

-- Check if column exists, add if not
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' 
        AND column_name = 'teamColors'
    ) THEN
        ALTER TABLE matches ADD COLUMN "teamColors" JSONB DEFAULT NULL;
        COMMENT ON COLUMN matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...]';
    END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'matches' 
AND column_name = 'teamColors';
