import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr'

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

// Browser Client
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// Server Client Factory
export const createSupabaseServer = (context: any) => {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(key) {
        return context.cookies.get(key)?.value
      },
      set(key, value, options) {
        context.cookies.set(key, value, options)
      },
      remove(key, options) {
        context.cookies.delete(key, options)
      },
    },
  })
}
