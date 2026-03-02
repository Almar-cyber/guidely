// Step 3: Plugin polls this endpoint until the token is available
import { Redis } from '@upstash/redis'

export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const { searchParams } = new URL(req.url)
  const state = searchParams.get('state')

  if (!state) {
    return new Response(JSON.stringify({ error: 'Missing state' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })

  const token = await redis.get<string>(`figma_auth:${state}`)

  if (!token) {
    // Not ready yet — plugin should keep polling
    return new Response(JSON.stringify({ status: 'pending' }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // Token found — delete it immediately (one-time use) and return
  await redis.del(`figma_auth:${state}`)

  return new Response(JSON.stringify({ status: 'done', token }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
