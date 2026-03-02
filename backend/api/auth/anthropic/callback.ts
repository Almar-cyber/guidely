// Step 2: Anthropic redirects here → exchange code → create API key → store in Redis
import { Redis } from '@upstash/redis'

export const config = { runtime: 'edge' }

const BASE = process.env.ANTHROPIC_REDIRECT_URI?.replace('/api/auth/anthropic/callback', '')
  ?? 'https://ux-guidelines-proxy.vercel.app'

function redirect(path: string) {
  return Response.redirect(`${BASE}/auth-result.html${path}`)
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const statePayload = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !statePayload) {
    return redirect(`?error=${error ?? 'missing_params'}`)
  }

  // Decode state payload to recover codeVerifier
  let state: string, codeVerifier: string
  try {
    const decoded = JSON.parse(atob(statePayload.replace(/-/g, '+').replace(/_/g, '/')))
    state = decoded.state
    codeVerifier = decoded.codeVerifier
  } catch {
    return redirect('?error=invalid_state')
  }

  const clientId = process.env.ANTHROPIC_CLIENT_ID!
  const clientSecret = process.env.ANTHROPIC_CLIENT_SECRET ?? ''
  const redirectUri = process.env.ANTHROPIC_REDIRECT_URI
    ?? `${BASE}/api/auth/anthropic/callback`

  try {
    // 1. Exchange authorization code for access token
    const tokenRes = await fetch('https://console.anthropic.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', await tokenRes.text())
      return redirect('?error=token_exchange_failed')
    }

    const { access_token } = await tokenRes.json() as { access_token: string }

    // 2. Use access token to create a permanent API key
    const keyRes = await fetch('https://api.anthropic.com/api/oauth/create_api_key', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ name: 'Guidely Plugin' }),
    })

    if (!keyRes.ok) {
      console.error('Key creation failed:', await keyRes.text())
      return redirect('?error=key_creation_failed')
    }

    const { key } = await keyRes.json() as { key: string }

    // 3. Store key in Redis (5 min TTL, one-time use)
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    await redis.setex(`anthropic_auth:${state}`, 300, key)

    return redirect('?success=true')
  } catch (err) {
    console.error('Anthropic auth callback error:', err)
    return redirect('?error=server_error')
  }
}
