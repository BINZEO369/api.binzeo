import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function getSupabaseAdmin() {
  const url = process.env.AUTH_SUPABASE_URL
  const serviceRoleKey = process.env.AUTH_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase admin environment variables are not configured')
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
