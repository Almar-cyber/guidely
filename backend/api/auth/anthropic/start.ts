import { Redis } from '@upstash/redis'

export const config = { runtime: 'edge' }

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function randomBase64url(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function s256(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const host = new URL(req.url).origin
  const redirectUri = process.env.ANTHROPIC_REDIRECT_URI
    ?? `${host}/api/auth/anthropic/callback`

  const state = randomBase64url(32)
  const codeVerifier = randomBase64url(48)
  const codeChallenge = await s256(codeVerifier)

  // Store codeVerifier in Redis keyed by state (2 min TTL)
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
  await redis.setex(`pkce:${state}`, 120, codeVerifier)

  const url = new URL('https://console.anthropic.com/oauth/authorize')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'org:create_api_key user:profile user:inference')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  return new Response(JSON.stringify({ url: url.toString(), state }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
