// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// Safety guard: when running in dev, avoid accidentally connecting to a Supabase
// instance (possibly production) unless the developer explicitly allows it by
// setting VITE_ALLOW_PROD=1 (or true) in their local env.
const allowProd = String(import.meta.env.VITE_ALLOW_PROD ?? '') === '1' || String(import.meta.env.VITE_ALLOW_PROD ?? '') === 'true'

if (!url || !anon) {
  console.error('Supabase env missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

if (import.meta.env.DEV && url && !allowProd) {
  // Abort early to avoid accidental writes to a production DB from local dev.
  // Intentionally throw so the issue is noticed immediately during development.
  console.error('Refusing to initialize Supabase client in development because VITE_SUPABASE_URL is set.\nSet VITE_ALLOW_PROD=1 to override if you really want to connect to that project from local dev.')
  throw new Error('Supabase client initialization blocked in development (VITE_ALLOW_PROD not set).')
}

export const supabase = createClient(url, anon)
