// Step 3: Plugin polls until the API key is available
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

  const key = await redis.get<string>(`anthropic_auth:${state}`)

  if (!key) {
    return new Response(JSON.stringify({ status: 'pending' }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // One-time use — delete immediately after retrieval
  await redis.del(`anthropic_auth:${state}`)

  return new Response(JSON.stringify({ status: 'done', key }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
