-- Create ref_sessions table for referee mode session management
-- This table tracks active referee sessions and enables real-time sync across devices

CREATE TABLE IF NOT EXISTS public.ref_sessions (
  match_id TEXT NOT NULL,
  game_index INTEGER NOT NULL,
  room_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, cancelled, completed
  duration INTEGER NOT NULL DEFAULT 20, -- match duration in minutes
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, game_index, room_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ref_sessions_room_status 
  ON public.ref_sessions(room_id, status);

CREATE INDEX IF NOT EXISTS idx_ref_sessions_updated 
  ON public.ref_sessions(updated_at DESC);

-- Enable RLS
ALTER TABLE public.ref_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations (adjust based on your auth requirements)
CREATE POLICY "Allow all on ref_sessions" ON public.ref_sessions
  FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ref_sessions;

COMMENT ON TABLE public.ref_sessions IS 'Tracks active referee mode sessions for real-time sync across devices';
