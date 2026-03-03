export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  const { token } = await req.json() as { token: string }

  const res = await fetch('https://api.figma.com/v1/me', {
    headers: { 'X-Figma-Token': token },
  })

  const data = await res.json() as { email?: string; handle?: string; err?: string }

  return new Response(JSON.stringify({
    ok: res.ok,
    status: res.status,
    email: data.email,
    handle: data.handle,
    error: data.err,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
