import { createClient } from 'npm:@supabase/supabase-js@2'

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.hostname.endsWith('.lecture-to-mastery.pages.dev') || url.hostname === 'lecture-to-mastery.pages.dev') return true;
    if (url.hostname.endsWith('.netlify.app')) return true;
    return false;
  } catch { return false; }
}

function corsHeaders(origin: string | null) {
  const allowOrigin = isAllowedOrigin(origin) ? origin : 'http://localhost:5173'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

// Web Push via the standardized API (Deno supports Web Push natively)
async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url: string },
  vapidPrivateKey: string,
  vapidPublicKey: string,
): Promise<{ ok: boolean; status?: number }> {
  const textPayload = JSON.stringify(payload)

  // Encode the payload for Web Push
  const encoder = new TextEncoder()
  const encoded = encoder.encode(textPayload)

  // Create a ReadableStream for the request body
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded)
      controller.close()
    },
  })

  // Build VAPID auth header (simplified — Deno's web push support varies)
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Urgency': 'normal',
      // VAPID headers via Authorization
      'Authorization': `WebPush ${vapidPublicKey}`,
    },
    body: stream,
  })

  return { ok: response.ok, status: response.status }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const { userId, immediate } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!

    if (!supabaseUrl || !supabaseServiceKey || !vapidPrivateKey || !vapidPublicKey) {
      throw new Error('Missing required environment variables')
    }

    // Use service-role to read subscriptions (bypass RLS) and fetch due count
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check auth if userId not provided — use caller's JWT
    let targetUserId = userId
    if (!targetUserId) {
      const authHeader = req.headers.get('Authorization') || ''
      const jwt = authHeader.replace('Bearer ', '')
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) throw new Error('Authentication required')
      targetUserId = user.id
    }

    // Count due flashcards
    const now = new Date().toISOString()
    const { count, error: countErr } = await supabase
      .from('flashcards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', targetUserId)
      .lte('due_at', now)

    if (countErr) throw countErr
    const dueCount = count ?? 0

    if (dueCount === 0 && !immediate) {
      // No cards due — skip sending notification
      return new Response(
        JSON.stringify({ ok: true, sent: false, reason: 'no_due_cards' }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // Fetch user's push subscriptions
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh_key, auth_key')
      .eq('user_id', targetUserId)

    if (subsErr) throw subsErr
    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: false, reason: 'no_subscriptions' }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const title = dueCount > 0
      ? `${dueCount} card${dueCount !== 1 ? 's' : ''} due`
      : 'No cards due — you\'re all caught up!'

    const body = dueCount > 0
      ? `You have ${dueCount} flashcard${dueCount !== 1 ? 's' : ''} to review. Keep your streak going!`
      : 'Come back tomorrow for new reviews.'

    const results: { endpoint: string; ok: boolean; status?: number }[] = []
    for (const sub of subs) {
      try {
        const result = await sendPushNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
          },
          { title, body, url: '/review' },
          vapidPrivateKey,
          vapidPublicKey,
        )
        results.push({ endpoint: sub.endpoint.slice(0, 40) + '...', ...result })

        // If subscription expired or invalid, remove it
        if (result.status === 410 || result.status === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      } catch (err) {
        results.push({ endpoint: sub.endpoint.slice(0, 40) + '...', ok: false })
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent: true, dueCount, results }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } },
    )
  }
})
