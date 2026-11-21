import { createClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://rgpydqsikztqnmtwzncx.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_jRAojpedbtH_vv_H9zZDOA_2rCJ9oF8';

function readEnvValue(key: string): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const val = env?.[key];
  return typeof val === 'string' ? val.trim() : '';
}

export const SUPABASE_URL = readEnvValue('VITE_SUPABASE_URL') || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  readEnvValue('VITE_SUPABASE_ANON_KEY') || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
