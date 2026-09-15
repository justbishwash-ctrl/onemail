/**
 * Onemail — Cloudflare Worker
 * Entry point for the API backend.
 */

import { Hono } from 'hono';
import { authRouter } from './routes/auth.ts';
import { meRouter } from './routes/me.ts';
import { threadsRouter } from './routes/threads.ts';
import { messagesRouter } from './routes/messages.ts';
import { labelsRouter } from './routes/labels.ts';
import { searchRouter } from './routes/search.ts';
import { trackingRouter } from './routes/tracking.ts';
import { secureHeaders, corsHeaders } from './middleware/security.ts';
import { GmailApiError, GmailAuthError, GmailRateLimitError } from './services/gmail/client.ts';
import type { Env, HonoVariables } from './types/env.ts';

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// ── Global middleware ───────────────────────────────────────
app.use('*', corsHeaders);
app.use('*', secureHeaders);

// ── Auth routes (no /api prefix — browser redirects) ───────
app.route('/auth', authRouter);

// ── Tracking pixel (public, no auth) ───────────────────────
app.route('/', trackingRouter);

// ── Protected API routes ────────────────────────────────────
app.route('/api/me', meRouter);
app.route('/api/threads', threadsRouter);
app.route('/api/messages', messagesRouter);
app.route('/api/labels', labelsRouter);
app.route('/api/search', searchRouter);

// ── Health check ────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true, version: '1.0.0' }));

// ── Global error handler ────────────────────────────────────
app.onError((err, c) => {
  console.error('[Worker Error]', err.message, err.stack);

  if (err instanceof GmailAuthError) {
    return c.json({ error: 'Google authorization expired. Please re-authenticate.', code: 'AUTH_REVOKED' }, 401);
  }

  if (err instanceof GmailRateLimitError) {
    return c.json({ error: 'Gmail rate limit reached. Please try again shortly.', code: 'RATE_LIMITED' }, 429);
  }

  if (err instanceof GmailApiError) {
    if (err.status === 404) return c.json({ error: 'Message not found', code: 'NOT_FOUND' }, 404);
    return c.json({ error: 'Gmail API error', code: 'GMAIL_ERROR' }, 502);
  }

  // Never expose stack traces in production
  const isProd = c.env.ENVIRONMENT === 'production';
  return c.json(
    {
      error: isProd ? 'Internal server error' : err.message,
      code: 'INTERNAL_ERROR',
    },
    500
  );
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
