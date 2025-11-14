-- scripts/storage-player-photos-setup.sql
-- Create 'player-photos' bucket and permissive policies for uploads from the app.
-- This script is safe to run multiple times.

-- 1) Create bucket if missing (public so images can be viewed without signed URLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'player-photos'
  ) THEN
    PERFORM storage.create_bucket(
      bucket_id => 'player-photos',
      public => true,
      file_size_limit => 5242880 -- 5MB
    );
  END IF;
END $$;

-- 2) Policies on storage.objects for this bucket
-- Guard to avoid duplicate policy creation
DO $$
BEGIN
  -- Public read for this bucket (both anon and authenticated)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read player-photos'
  ) THEN
    CREATE POLICY "Public read player-photos"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'player-photos');
  END IF;

  -- Authenticated users can upload new files under players/*
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Upload player-photos by authenticated'
  ) THEN
    CREATE POLICY "Upload player-photos by authenticated"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'player-photos'
      AND (name LIKE 'players/%')
    );
  END IF;

  -- Authenticated users can update files in this bucket (for upsert/replace)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Update player-photos by authenticated'
  ) THEN
    CREATE POLICY "Update player-photos by authenticated"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'player-photos')
    WITH CHECK (bucket_id = 'player-photos');
  END IF;

  -- (Optional) Allow delete if you want in-app photo removal
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Delete player-photos by authenticated'
  ) THEN
    CREATE POLICY "Delete player-photos by authenticated"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'player-photos');
  END IF;
END $$;
