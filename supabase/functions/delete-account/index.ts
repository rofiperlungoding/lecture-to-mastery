import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://30031c7a.lecture-to-mastery.pages.dev',
]

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      throw new Error('Missing required environment variables')
    }

    // Step 1: Verify the user's session using their JWT
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // Step 2: Use service role to delete the auth user.
    // Justification: Deleting an auth user requires the service_role key because
    // auth.users is an internal schema not accessible via the anon key or RLS.
    // All child rows (documents, chunks, flashcards, quiz_questions, rate_limits)
    // are deleted automatically via ON DELETE CASCADE on the user_id FK.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // Delete rate_limits rows explicitly (belt-and-suspenders before auth cascade)
    const { error: rateLimitErr } = await adminClient
      .from('rate_limits')
      .delete()
      .eq('user_id', user.id)

    if (rateLimitErr) {
      console.error('Failed to delete rate_limits:', rateLimitErr.message)
    }

    // Delete the auth user — this cascades to all user-owned rows
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user.id)

    if (deleteErr) {
      throw new Error(`Failed to delete user: ${deleteErr.message}`)
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } },
    )
  }
})
