import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Polyfill WebSocket for Node.js < 22 / Jest test environments
if (typeof window === 'undefined' && typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class {} as any;
}

const DEFAULT_SUPABASE_URL = 'https://dzdclfqvwlpzehssryfi.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_SF6tRFkA3qCkZXjtD5yugQ_g1FFctP_';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('mock-ok-restaurant')
);

export const supabase = isSupabaseConfigured
  ? createSupabaseClient(supabaseUrl, supabaseAnonKey)
  : null;
