-- Create runner_scores table for maintenance page game leaderboard
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS runner_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_runner_scores_score ON runner_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_runner_scores_user ON runner_scores(user_id);

-- Enable Row Level Security (optional, adjust as needed)
ALTER TABLE runner_scores ENABLE ROW LEVEL SECURITY;

-- Policy: anyone can read scores
CREATE POLICY "Anyone can view runner scores"
  ON runner_scores
  FOR SELECT
  USING (true);

-- Policy: anyone can insert their own score
CREATE POLICY "Anyone can insert runner scores"
  ON runner_scores
  FOR INSERT
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE runner_scores IS 'Stores high scores from the maintenance page runner game';
