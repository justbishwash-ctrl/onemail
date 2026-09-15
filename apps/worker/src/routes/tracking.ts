import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimiter } from '../middleware/security.ts';
import { transparentGif } from '../utils/response.ts';
import {
  processTrackingOpen,
  getEmailTrackingStatus,
} from '../services/tracking/tracker.ts';
import {
  getTrackedEmailsForAccount,
  getTrackingStats,
} from '../db/queries.ts';
import type { Env, HonoVariables } from '../types/env.ts';

const tracking = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/**
 * GET /t/:trackingId.png
 *
 * Public endpoint — no auth required.
 * Records an open event and returns a 1x1 transparent GIF.
 * Rate-limited. Never returns user-identifying data.
 */
tracking.get(
  '/t/:trackingId.png',
  rateLimiter({ windowSeconds: 60, maxRequests: 100, keyPrefix: 'pixel' }),
  async (c) => {
    const trackingId = c.req.param('trackingId');

    // Validate format — URL-safe base64 only, max 32 chars
    if (!/^[A-Za-z0-9_-]{10,32}$/.test(trackingId)) {
      return transparentGif(); // always return GIF, never hint at validity
    }

    // Complete the write before responding so the dashboard cannot race the pixel request.
    await processTrackingOpen(c.env, trackingId, c.req.raw);

    return transparentGif();
  }
);

// GET /api/tracking — list tracked emails for active account
tracking.get('/api/tracking', requireAuth, async (c) => {
  const userId = c.get('userId');
  const accountId = c.get('activeAccountId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const trackedEmails = await getTrackedEmailsForAccount(
    c.env.DB,
    userId,
    accountId,
    limit,
    offset
  );

  // Enrich with open stats in parallel
  const enriched = await Promise.all(
    trackedEmails.map(async (te) => {
      const stats = await getTrackingStats(c.env.DB, te.tracking_id);
      return {
        id: te.id,
        trackingId: te.tracking_id,
        gmailMessageId: te.gmail_message_id,
        subjectPreview: te.subject_preview,
        createdAt: te.created_at,
        isOpened: stats.totalOpens > 0,
        totalOpens: stats.totalOpens,
        firstOpenedAt: stats.firstOpenedAt,
        lastOpenedAt: stats.lastOpenedAt,
      };
    })
  );

  return c.json({ trackedEmails: enriched, total: enriched.length });
});

// GET /api/tracking/:id — single tracked email stats
tracking.get('/api/tracking/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const accountId = c.get('activeAccountId');
  const trackingId = c.req.param('id');

  const status = await getEmailTrackingStatus(c.env, trackingId);
  if (!status) return c.json({ error: 'Not found' }, 404);

  return c.json(status);
});

export { tracking as trackingRouter };
