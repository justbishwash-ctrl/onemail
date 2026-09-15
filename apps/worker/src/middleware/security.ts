import type { Context, Next } from 'hono';
import type { Env } from '../types/env.ts';
import { sha256Hex } from '../utils/crypto.ts';

export async function secureHeaders(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<void> {
  await next();

  const response = new Response(c.res.body, c.res);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  );
  c.res = response;
}

export async function corsHeaders(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<void> {
  const origin = c.req.header('Origin');
  const allowedOrigins = [
    c.env.APP_URL,
    'http://localhost:5173',
    'http://localhost:3000',
  ];

  if (c.req.method === 'OPTIONS') {
    if (origin && allowedOrigins.includes(origin)) {
      return c.newResponse(null, 204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      });
    }
    return c.newResponse(null, 204);
  }

  await next();

  if (origin && allowedOrigins.includes(origin)) {
    const response = new Response(c.res.body, c.res);
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
    c.res = response;
  }
}

/**
 * Simple rate limiter using Cloudflare KV.
 * Key: ip_hash:endpoint_group
 * Value: { count: number; windowStart: number }
 *
 * This is coarse-grained. For production, use Cloudflare Rate Limiting rules.
 */
export function rateLimiter(options: {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix: string;
}) {
  return async (c: Context<{ Bindings: Env }>, next: Next): Promise<void | Response> => {
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
    const ipHash = await sha256Hex(ip);
    const kvKey = `rl:${options.keyPrefix}:${ipHash}`;

    const raw = await c.env.SESSIONS.get(kvKey);
    const now = Math.floor(Date.now() / 1000);

    let count = 1;
    let windowStart = now;

    if (raw) {
      const data = JSON.parse(raw) as { count: number; windowStart: number };
      if (now - data.windowStart < options.windowSeconds) {
        count = data.count + 1;
        windowStart = data.windowStart;
      }
    }

    if (count > options.maxRequests) {
      return c.json({ error: 'Too many requests' }, 429);
    }

    await c.env.SESSIONS.put(
      kvKey,
      JSON.stringify({ count, windowStart }),
      { expirationTtl: options.windowSeconds }
    );

    await next();
  };
}

export function requestSizeLimit(maxBytes: number) {
  return async (c: Context, next: Next): Promise<void | Response> => {
    const contentLength = c.req.header('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      return c.json({ error: 'Request too large' }, 413);
    }
    await next();
  };
}
