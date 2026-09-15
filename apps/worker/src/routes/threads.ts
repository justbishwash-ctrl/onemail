import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.ts';
import { getValidAccessToken, OAuthRevokedError } from '../services/oauth/google.ts';
import {
  listThreads,
  getThread,
  modifyThread,
  trashThread,
  untrashThread,
  parseThread,
} from '../services/gmail/client.ts';
import type { Env, HonoVariables } from '../types/env.ts';

const threads = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// GET /api/threads
threads.get('/', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const label = c.req.query('label') ?? 'INBOX';
  const q = c.req.query('q');
  const pageToken = c.req.query('pageToken');
  const maxResults = Math.min(parseInt(c.req.query('maxResults') ?? '50', 10), 100);

  try {
    const accessToken = await getValidAccessToken(c.env, accountId);

    const response = await listThreads(accessToken, {
      labelIds: q ? undefined : [label],
      q: q || undefined,
      maxResults,
      pageToken: pageToken || undefined,
    });

    // Fetch metadata only for the list; full bodies load when a thread opens.
    const threadIds = (response.threads ?? []).map((t) => t.id);
    const BATCH = 5;
    const parsed = [];

    for (let i = 0; i < threadIds.length; i += BATCH) {
      const batch = threadIds.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((id) => getThread(accessToken, id, 'metadata').then((thread) => parseThread(thread, false)))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') parsed.push(r.value);
      }
    }

    return c.json({
      threads: parsed,
      nextPageToken: response.nextPageToken ?? null,
      resultSizeEstimate: response.resultSizeEstimate ?? 0,
    });
  } catch (err) {
    if (err instanceof OAuthRevokedError) {
      return c.json({ error: 'Google authorization revoked', code: 'AUTH_REVOKED' }, 401);
    }
    throw err;
  }
});

// GET /api/threads/:id
threads.get('/:id', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const threadId = c.req.param('id');

  try {
    const accessToken = await getValidAccessToken(c.env, accountId);
    const thread = await getThread(accessToken, threadId);
    return c.json(parseThread(thread));
  } catch (err) {
    if (err instanceof OAuthRevokedError) {
      return c.json({ error: 'Google authorization revoked', code: 'AUTH_REVOKED' }, 401);
    }
    throw err;
  }
});

// POST /api/threads/:id/archive
threads.post('/:id/archive', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const threadId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyThread(accessToken, threadId, [], ['INBOX']);
  return c.json({ ok: true });
});

// POST /api/threads/:id/trash
threads.post('/:id/trash', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const threadId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await trashThread(accessToken, threadId);
  return c.json({ ok: true });
});

// POST /api/threads/:id/restore
threads.post('/:id/restore', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const threadId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await untrashThread(accessToken, threadId);
  return c.json({ ok: true });
});

// POST /api/threads/:id/read
threads.post('/:id/read', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const threadId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyThread(accessToken, threadId, [], ['UNREAD']);
  return c.json({ ok: true });
});

// POST /api/threads/:id/unread
threads.post('/:id/unread', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const threadId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyThread(accessToken, threadId, ['UNREAD'], []);
  return c.json({ ok: true });
});

// POST /api/threads/:id/star
threads.post('/:id/star', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const threadId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyThread(accessToken, threadId, ['STARRED'], []);
  return c.json({ ok: true });
});

// POST /api/threads/:id/unstar
threads.post('/:id/unstar', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const threadId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyThread(accessToken, threadId, [], ['STARRED']);
  return c.json({ ok: true });
});

// POST /api/threads/:id/spam
threads.post('/:id/spam', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const threadId = c.req.param('id');
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyThread(accessToken, threadId, ['SPAM'], ['INBOX']);
  return c.json({ ok: true });
});

// POST /api/threads/:id/labels
threads.post('/:id/labels', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const threadId = c.req.param('id');
  const body = await c.req.json<{ add?: string[]; remove?: string[] }>();
  const accessToken = await getValidAccessToken(c.env, accountId);
  await modifyThread(accessToken, threadId, body.add ?? [], body.remove ?? []);
  return c.json({ ok: true });
});

export { threads as threadsRouter };
