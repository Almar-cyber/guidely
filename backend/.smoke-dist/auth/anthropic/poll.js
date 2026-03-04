"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = handler;
// Step 3: Plugin polls until the API key is available
const redis_1 = require("@upstash/redis");
exports.config = { runtime: 'edge' };
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};
async function handler(req) {
    if (req.method === 'OPTIONS')
        return new Response(null, { headers: CORS });
    const { searchParams } = new URL(req.url);
    const state = searchParams.get('state');
    if (!state) {
        return new Response(JSON.stringify({ error: 'Missing state' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS },
        });
    }
    const redis = new redis_1.Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    const key = await redis.get(`anthropic_auth:${state}`);
    if (!key) {
        return new Response(JSON.stringify({ status: 'pending' }), {
            headers: { 'Content-Type': 'application/json', ...CORS },
        });
    }
    // One-time use — delete immediately after retrieval
    await redis.del(`anthropic_auth:${state}`);
    return new Response(JSON.stringify({ status: 'done', key }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
    });
}
