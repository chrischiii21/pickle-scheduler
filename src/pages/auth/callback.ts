import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabase';

export const GET: APIRoute = async (context) => {
  const { url, redirect } = context;
  const code = url.searchParams.get('code');

  if (code) {
    const supabase = createSupabaseServer(context);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirect('/admin');
    }
  }

  return redirect('/login?error=Could not authenticate');
};
