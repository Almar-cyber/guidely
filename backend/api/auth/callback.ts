// Step 2: Figma redirects here after user approves
// Exchanges the code for a token and stores it temporarily in Upstash Redis
import { Redis } from '@upstash/redis'

export const config = { runtime: 'edge' }

const TOKEN_TTL = 300 // 5 minutes — enough time for plugin to poll

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const redirectBase = process.env.FIGMA_REDIRECT_URI?.replace('/api/auth/callback', '')
    ?? new URL(req.url).origin

  // User denied or error
  if (error || !code || !state) {
    return Response.redirect(`${redirectBase}/auth-result.html?error=${error ?? 'missing_params'}`)
  }

  const clientId = process.env.FIGMA_CLIENT_ID!
  const clientSecret = process.env.FIGMA_CLIENT_SECRET!
  const redirectUri = process.env.FIGMA_REDIRECT_URI ?? `${redirectBase}/api/auth/callback`

  try {
    // Exchange authorization code for access token
    const tokenRes = await fetch('https://api.figma.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('Figma token exchange failed:', err)
      return Response.redirect(`${redirectBase}/auth-result.html?error=token_exchange_failed`)
    }

    const { access_token } = await tokenRes.json() as { access_token: string }

    // Store token in Upstash Redis with state as key (TTL: 5 min)
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    await redis.setex(`figma_auth:${state}`, TOKEN_TTL, access_token)

    // Redirect to success page — user can close the tab
    return Response.redirect(`${redirectBase}/auth-result.html?success=true`)
  } catch (err) {
    console.error('Auth callback error:', err)
    return Response.redirect(`${redirectBase}/auth-result.html?error=server_error`)
  }
}
