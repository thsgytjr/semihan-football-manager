-- DKSC upcoming_matches 테이블을 snake_case 스키마로 마이그레이션
-- 기존 camelCase 컬럼들을 snake_case로 변경
-- Mission FC와 동일한 스키마 구조로 통일

-- Step 1: 기존 테이블 백업 (optional, 안전을 위해)
-- CREATE TABLE IF NOT EXISTS upcoming_matches_backup AS SELECT * FROM upcoming_matches;

-- Step 2: 새로운 snake_case 테이블 생성
CREATE TABLE IF NOT EXISTS upcoming_matches_new (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  title text,
  note text,
  date_iso timestamptz not null,
  location jsonb default '{}'::jsonb,
  snapshot jsonb default '[]'::jsonb,
  participant_ids uuid[] default '{}'::uuid[],
  captain_ids uuid[] default '{}'::uuid[],
  formations jsonb default '[]'::jsonb,
  team_count int not null default 2 check (team_count between 2 and 8),
  is_draft_mode boolean not null default false,
  is_draft_complete boolean not null default false,
  draft_completed_at timestamptz,
  total_cost numeric,
  fees_disabled boolean not null default false,
  team_colors jsonb default '{}'::jsonb,
  criterion text default 'overall',
  status text default 'scheduled',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id, id)
);

-- Step 3: 기존 데이터 마이그레이션 (camelCase → snake_case)
INSERT INTO upcoming_matches_new (
  id,
  room_id,
  date_iso,
  location,
  participant_ids,
  formations,
  team_count,
  team_colors,
  criterion,
  created_at,
  updated_at
)
SELECT 
  id,
  COALESCE(room_id, 'DKSC-lite-room-1'),
  "dateISO",
  -- location이 TEXT일 수도 있으니 JSONB로 변환
  CASE 
    WHEN location IS NULL THEN '{}'::jsonb
    WHEN pg_typeof(location) = 'jsonb'::regtype THEN location
    ELSE jsonb_build_object('name', location)
  END as location,
  -- attendeeIds가 JSONB라면 array로 변환 필요
  CASE 
    WHEN jsonb_typeof("attendeeIds") = 'array' THEN 
      ARRAY(SELECT jsonb_array_elements_text("attendeeIds"))::uuid[]
    ELSE '{}'::uuid[]
  END as participant_ids,
  formations,
  COALESCE("teamCount", 2),
  COALESCE("teamColors", '{}'::jsonb),
  COALESCE(criterion, 'overall'),
  COALESCE(created_at, NOW()),
  COALESCE(updated_at, NOW())
FROM upcoming_matches
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'upcoming_matches' 
  AND column_name = 'dateISO'
);

-- Step 4: 기존 테이블 삭제 및 새 테이블로 교체
DROP TABLE IF EXISTS upcoming_matches CASCADE;
ALTER TABLE upcoming_matches_new RENAME TO upcoming_matches;

-- Step 5: 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_room_id ON upcoming_matches(room_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_date_iso ON upcoming_matches(date_iso);

-- Step 6: RLS 정책 (필요한 경우)
ALTER TABLE upcoming_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access"
  ON upcoming_matches FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert"
  ON upcoming_matches FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update"
  ON upcoming_matches FOR UPDATE
  USING (true);

CREATE POLICY "Authenticated users can delete"
  ON upcoming_matches FOR DELETE
  USING (true);

-- 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '✅ DKSC upcoming_matches 테이블이 snake_case 스키마로 마이그레이션되었습니다.';
  RAISE NOTICE '📊 Mission FC, Semihan과 동일한 스키마를 사용합니다.';
END $$;
