import { createClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://rgpydqsikztqnmtwzncx.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_jRAojpedbtH_vv_H9zZDOA_2rCJ9oF8';

export const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim() ||
  DEFAULT_SUPABASE_URL;

export const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  DEFAULT_SUPABASE_ANON_KEY;

export const supabaseServer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
