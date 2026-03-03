// Troca o authorization code pelo access token
// O access token é usado diretamente como Bearer nas chamadas à API Anthropic
import { Redis } from '@upstash/redis'

export const config = { runtime: 'edge' }

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'

// Auto-detect base URL from request if env var not set
function getBase(req: Request): string {
  return process.env.ANTHROPIC_REDIRECT_URI?.replace('/api/auth/anthropic/callback', '')
    ?? new URL(req.url).origin
}

export default async function handler(req: Request): Promise<Response> {
  const BASE = getBase(req)
  const redirect = (path: string) =>
    Response.redirect(`${BASE}/auth-result.html${path}`)

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const statePayload = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !statePayload) {
    return redirect(`?error=${error ?? 'missing_params'}`)
  }

  let state: string, codeVerifier: string
  try {
    const decoded = JSON.parse(
      atob(statePayload.replace(/-/g, '+').replace(/_/g, '/'))
    )
    state = decoded.state
    codeVerifier = decoded.codeVerifier
  } catch {
    return redirect('?error=invalid_state')
  }

  const redirectUri = process.env.ANTHROPIC_REDIRECT_URI
    ?? `${BASE}/api/auth/anthropic/callback`

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://console.anthropic.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', await tokenRes.text())
      return redirect('?error=token_exchange_failed')
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }

    // Store access token in Redis (5 min TTL, one-time use)
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    // Use statePayload (the full encoded string) as key — matches what poll.ts receives
    await redis.setex(`anthropic_auth:${statePayload}`, 300, tokens.access_token)

    return redirect('?success=true')
  } catch (err) {
    console.error('Anthropic callback error:', err)
    return redirect('?error=server_error')
  }
}
