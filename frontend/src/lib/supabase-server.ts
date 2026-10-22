// Server-only Supabase clients. Import this module ONLY from Server
// Components, Route Handlers, or Server Actions — never from client code.
import { createServerClient } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assertConfigured() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
    );
  }
}

// Server client bound to the request cookies (App Router)
export function createServerSupabaseClient(): SupabaseClient<Database> {
  assertConfigured();
  const cookieStore = cookies();
  return createServerClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — safe to ignore when middleware
          // refreshes sessions.
        }
      },
    },
  });
}

// Service role client (server only, bypasses RLS)
let serviceClient: SupabaseClient<Database> | null = null;

export function createServiceSupabaseClient(): SupabaseClient<Database> {
  assertConfigured();
  if (serviceClient) return serviceClient;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  serviceClient = createClient<Database>(supabaseUrl!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return serviceClient;
}

// Admin stats via service role (RLS-safe: only ever called server-side)
export async function getAdminStats() {
  const supabase = createServiceSupabaseClient();
  return supabase.rpc('get_admin_detection_stats');
}
