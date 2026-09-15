import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.ts';
import { requestSizeLimit } from '../middleware/security.ts';
import { getValidAccessToken } from '../services/oauth/google.ts';
import {
  getMessage,
  sendMessage,
  modifyMessage,
  trashMessage,
  untrashMessage,
  getAttachment,
  createDraft,
  updateDraft,
  deleteDraft,
  listDrafts,
  parseMessage,
} from '../services/gmail/client.ts';
import { getUserPreferences } from '../db/queries.ts';
import { registerTrackedEmail, buildTrackingPixelUrl } from '../services/tracking/tracker.ts';
import type { Env, HonoVariables } from '../types/env.ts';
import type { GmailSendRequest } from '../types/gmail.ts';

const messages = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// GET /api/messages/:id
messages.get('/:id', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  const msg = await getMessage(accessToken, messageId);
  return c.json(parseMessage(msg));
});

// GET /api/messages/:id/attachment/:attachmentId
messages.get('/:id/attachment/:attachmentId', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const attachmentId = c.req.param('attachmentId');
  const accessToken = await getValidAccessToken(c.env, accountId);
  const att = await getAttachment(accessToken, messageId, attachmentId);
  const binary = decodeBase64Url(att.data);
  const mimeType = getSafeMimeType(c.req.query('mimeType'));
  const filename = (c.req.query('filename') ?? 'attachment').replace(/[\r\n"\\]/g, '_');

  return new Response(binary, {
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(binary.byteLength),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

function decodeBase64Url(data: string): Uint8Array {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getSafeMimeType(value: string | undefined): string {
  return value && /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(value)
    ? value
    : 'application/octet-stream';
}

// POST /api/messages/send
messages.post(
  '/send',
  requireAuth,
  requestSizeLimit(25 * 1024 * 1024), // 25 MB
  async (c) => {
    const userId = c.get('userId');
    const accountId = c.get('activeAccountId');
    const linkedAccount = c.get('linkedAccount');

    const body = await c.req.json<GmailSendRequest & { trackingEnabled?: boolean }>();

    if (!body.to?.length || !body.subject) {
      return c.json({ error: 'to and subject are required' }, 400);
    }

    const accessToken = await getValidAccessToken(c.env, accountId);
    const prefs = await getUserPreferences(c.env.DB, userId, accountId);
    const trackingEnabled = body.trackingEnabled ?? (prefs?.tracking_enabled === 1);

    let trackingPixelUrl: string | undefined;
    let trackingId: string | undefined;

    if (trackingEnabled) {
      // We need to generate tracking ID before sending (pixel injected pre-send)
      const { generateTrackingId } = await import('../services/tracking/tracker.ts');
      trackingId = generateTrackingId();
      trackingPixelUrl = buildTrackingPixelUrl(c.env.WORKER_URL, trackingId);
    }

    const sent = await sendMessage(accessToken, body, trackingPixelUrl);

    // Save tracking record after send succeeds
    if (trackingEnabled && trackingId && sent.id) {
      await registerTrackedEmail(c.env, {
        userId,
        linkedAccountId: accountId,
        gmailMessageId: sent.id,
        recipientEmail: body.to[0], // track primary recipient
        subject: body.subject,
      });
    }

    return c.json({ id: sent.id, threadId: sent.threadId });
  }
);

// POST /api/messages/:id/read
messages.post('/:id/read', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyMessage(accessToken, messageId, [], ['UNREAD']);
  return c.json({ ok: true });
});

// POST /api/messages/:id/unread
messages.post('/:id/unread', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyMessage(accessToken, messageId, ['UNREAD'], []);
  return c.json({ ok: true });
});

// POST /api/messages/:id/star
messages.post('/:id/star', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyMessage(accessToken, messageId, ['STARRED'], []);
  return c.json({ ok: true });
});

// POST /api/messages/:id/unstar
messages.post('/:id/unstar', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyMessage(accessToken, messageId, [], ['STARRED']);
  return c.json({ ok: true });
});

// POST /api/messages/:id/archive
messages.post('/:id/archive', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyMessage(accessToken, messageId, [], ['INBOX']);
  return c.json({ ok: true });
});

// POST /api/messages/:id/trash
messages.post('/:id/trash', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await trashMessage(accessToken, messageId);
  return c.json({ ok: true });
});

// POST /api/messages/:id/restore
messages.post('/:id/restore', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await untrashMessage(accessToken, messageId);
  return c.json({ ok: true });
});

// POST /api/messages/:id/spam
messages.post('/:id/spam', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyMessage(accessToken, messageId, ['SPAM'], ['INBOX']);
  return c.json({ ok: true });
});

// POST /api/messages/:id/labels
messages.post('/:id/labels', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const messageId = c.req.param('id');
  const body = await c.req.json<{ add?: string[]; remove?: string[] }>();
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyMessage(accessToken, messageId, body.add ?? [], body.remove ?? []);
  return c.json({ ok: true });
});

// ── Drafts ──────────────────────────────────────────────────

// GET /api/drafts
messages.get('/drafts', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const pageToken = c.req.query('pageToken');
  const accessToken = await getValidAccessToken(c.env, accountId);
  const result = await listDrafts(accessToken, 20, pageToken);
  return c.json(result);
});

// POST /api/drafts
messages.post('/drafts', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const body = await c.req.json<GmailSendRequest>();
  const accessToken = await getValidAccessToken(c.env, accountId);
  const draft = await createDraft(accessToken, body);
  return c.json(draft, 201);
});

// PUT /api/drafts/:id
messages.put('/drafts/:id', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const draftId = c.req.param('id');
  const body = await c.req.json<GmailSendRequest>();
  const accessToken = await getValidAccessToken(c.env, accountId);
  const draft = await updateDraft(accessToken, draftId, body);
  return c.json(draft);
});

// DELETE /api/drafts/:id
messages.delete('/drafts/:id', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const draftId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await deleteDraft(accessToken, draftId);
  return c.json({ ok: true });
});

export { messages as messagesRouter };
