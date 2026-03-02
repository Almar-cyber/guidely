// Step 1: Plugin calls this to get the Figma OAuth URL + a state token
export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default function handler(req: Request): Response {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const clientId = process.env.FIGMA_CLIENT_ID
  const redirectUri = process.env.FIGMA_REDIRECT_URI ?? 'https://ux-guidelines-proxy.vercel.app/api/auth/callback'

  if (!clientId) {
    return new Response(JSON.stringify({ error: 'FIGMA_CLIENT_ID not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // Generate a random state to prevent CSRF and identify the polling session
  const state = crypto.randomUUID()

  const url = new URL('https://www.figma.com/oauth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'file_content:read')
  url.searchParams.set('state', state)
  url.searchParams.set('response_type', 'code')

  return new Response(JSON.stringify({ url: url.toString(), state }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
