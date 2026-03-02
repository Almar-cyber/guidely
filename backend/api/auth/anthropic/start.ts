// Step 1: Generate PKCE challenge + state, return Anthropic OAuth URL
export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Generate a random base64url string
function randomBase64url(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// SHA-256 hash → base64url (PKCE S256 challenge)
async function s256(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const clientId = process.env.ANTHROPIC_CLIENT_ID
  const redirectUri = process.env.ANTHROPIC_REDIRECT_URI
    ?? 'https://ux-guidelines-proxy.vercel.app/api/auth/anthropic/callback'

  if (!clientId) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_CLIENT_ID not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const state = randomBase64url(32)
  const codeVerifier = randomBase64url(48)
  const codeChallenge = await s256(codeVerifier)

  // Store verifier temporarily in the state payload (encoded)
  // We'll need it for the code exchange in the callback
  const statePayload = btoa(JSON.stringify({ state, codeVerifier }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const url = new URL('https://console.anthropic.com/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', statePayload)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('scope', 'org:create_api_key user:profile')

  return new Response(JSON.stringify({ url: url.toString(), state: statePayload }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
