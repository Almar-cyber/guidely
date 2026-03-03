// Anthropic OAuth — mesmo client_id usado pelo Claude Code e ferramentas open-source
// Referência: https://github.com/taciturnaxolotl/anthropic-api-key
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

  const redirectUri = process.env.ANTHROPIC_REDIRECT_URI
    ?? 'https://ux-guidelines-proxy.vercel.app/api/auth/anthropic/callback'

  const state = randomBase64url(32)
  const codeVerifier = randomBase64url(48)
  const codeChallenge = await s256(codeVerifier)

  // Encode verifier in state so callback can retrieve it (stateless)
  const statePayload = btoa(JSON.stringify({ state, codeVerifier }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  // Enterprise/Console accounts use console.anthropic.com (not claude.ai)
  const url = new URL('https://console.anthropic.com/oauth/authorize')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'org:create_api_key user:profile user:inference')
  url.searchParams.set('state', statePayload)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  return new Response(JSON.stringify({ url: url.toString(), state: statePayload }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
