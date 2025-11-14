-- scripts/add-fees-column.sql
-- Adds a fees column to public.matches if it doesn't exist.
-- Type: jsonb, nullable. Used to store aggregate match fee info.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'fees'
  ) THEN
    ALTER TABLE public.matches
      ADD COLUMN fees jsonb;

    COMMENT ON COLUMN public.matches.fees IS 'Aggregate fee info: { total:number, memberFee:number, guestFee:number, breakdown?: object }';
  END IF;
END
$$;