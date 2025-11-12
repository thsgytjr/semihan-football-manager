-- Add multiField and gameMatchups columns to matches table
-- multiField: boolean flag for 2-field mode
-- gameMatchups: JSONB array storing team pairings for each game

-- Add multiField column (boolean, default false)
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS "multiField" boolean DEFAULT false;

-- Add gameMatchups column (JSONB array)
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS "gameMatchups" jsonb;

-- Add comments for documentation
COMMENT ON COLUMN matches."multiField" IS '2개 경기장 모드 여부 (4팀 이상 동시 진행)';
COMMENT ON COLUMN matches."gameMatchups" IS '각 게임의 팀 매치업 정보 [[[t1,t2],[t3,t4]], ...]';
