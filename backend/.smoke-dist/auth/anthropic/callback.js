"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = handler;
const redis_1 = require("@upstash/redis");
exports.config = { runtime: 'edge' };
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
function getBase(req) {
    return process.env.ANTHROPIC_REDIRECT_URI?.replace('/api/auth/anthropic/callback', '')
        ?? new URL(req.url).origin;
}
async function handler(req) {
    const BASE = getBase(req);
    const redirect = (path) => Response.redirect(`${BASE}/auth-result.html${path}`, 302);
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    if (error || !code || !state) {
        return redirect(`?error=${error ?? 'missing_params'}`);
    }
    const redis = new redis_1.Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    // Retrieve codeVerifier stored by start.ts
    const codeVerifier = await redis.get(`pkce:${state}`);
    if (!codeVerifier) {
        return redirect('?error=state_expired');
    }
    const redirectUri = process.env.ANTHROPIC_REDIRECT_URI
        ?? `${new URL(req.url).origin}/api/auth/anthropic/callback`;
    try {
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
        });
        if (!tokenRes.ok) {
            const errText = await tokenRes.text();
            console.error('Token exchange failed:', tokenRes.status, errText);
            return redirect('?error=token_exchange_failed');
        }
        const tokens = await tokenRes.json();
        // Store access token keyed by state (5 min TTL, one-time use)
        await redis.setex(`anthropic_auth:${state}`, 300, tokens.access_token);
        await redis.del(`pkce:${state}`);
        return redirect('?success=true');
    }
    catch (err) {
        console.error('Anthropic callback error:', err);
        return redirect('?error=server_error');
    }
}
