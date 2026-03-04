"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = handler;
exports.config = { runtime: 'edge' };
async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }
    const { token } = await req.json();
    const res = await fetch('https://api.figma.com/v1/me', {
        headers: { 'X-Figma-Token': token },
    });
    const data = await res.json();
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
    });
}
