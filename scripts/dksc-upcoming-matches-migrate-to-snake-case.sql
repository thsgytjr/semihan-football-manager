-- DKSC upcoming_matches 테이블을 snake_case 스키마로 마이그레이션
-- 기존 camelCase 컬럼들을 snake_case로 변경
-- Mission FC와 동일한 스키마 구조로 통일

-- Step 0: 기존 테이블 확인
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'upcoming_matches'
  ) THEN
    RAISE NOTICE '⚠️  upcoming_matches 테이블이 존재하지 않습니다. 새로 생성합니다.';
  ELSE
    RAISE NOTICE '✅ 기존 upcoming_matches 테이블을 발견했습니다. 마이그레이션을 시작합니다.';
  END IF;
END $$;

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
-- 테이블이 존재하고 데이터가 있을 경우에만 실행
DO $$
DECLARE
  table_exists boolean;
  has_camel_case boolean;
BEGIN
  -- 테이블 존재 확인
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'upcoming_matches'
  ) INTO table_exists;
  
  -- camelCase 컬럼 존재 확인
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'upcoming_matches' 
    AND column_name = 'dateISO'
  ) INTO has_camel_case;
  
  IF table_exists AND has_camel_case THEN
    RAISE NOTICE '📦 기존 데이터를 마이그레이션합니다...';
    
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
        WHEN pg_typeof(location) = 'jsonb'::regtype THEN location
        ELSE jsonb_build_object('name', location::text)
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
    FROM upcoming_matches;
    
    RAISE NOTICE '✅ 데이터 마이그레이션 완료';
  ELSIF table_exists THEN
    RAISE NOTICE '⚠️  기존 테이블이 이미 snake_case 스키마입니다. 데이터 마이그레이션을 건너뜁니다.';
  ELSE
    RAISE NOTICE 'ℹ️  기존 테이블이 없습니다. 새 테이블만 생성합니다.';
  END IF;
END $$;

-- Step 4: 기존 테이블 삭제 및 새 테이블로 교체
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'upcoming_matches'
  ) THEN
    DROP TABLE upcoming_matches CASCADE;
    RAISE NOTICE '🗑️  기존 테이블 삭제 완료';
  END IF;
  
  ALTER TABLE upcoming_matches_new RENAME TO upcoming_matches;
  RAISE NOTICE '✅ 새 테이블로 교체 완료';
END $$;

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
