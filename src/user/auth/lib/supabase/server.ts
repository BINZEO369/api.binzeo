import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const authorization = headerStore.get('authorization')

  return createServerClient(
    process.env.AUTH_SUPABASE_URL!,
    process.env.AUTH_SUPABASE_ANON_KEY!,
    {
      global: authorization ? { headers: { Authorization: authorization } } : undefined,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // called from Server Component — ignore
          }
        },
      },
    }
  )
}
