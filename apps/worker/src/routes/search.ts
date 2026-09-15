import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.ts';
import { getValidAccessToken } from '../services/oauth/google.ts';
import { searchThreads, getThread, parseThread } from '../services/gmail/client.ts';
import type { Env, HonoVariables } from '../types/env.ts';

const search = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// GET /api/search?q=from:someone&maxResults=20&pageToken=...
search.get('/', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const q = c.req.query('q');
  const pageToken = c.req.query('pageToken');
  const maxResults = Math.min(parseInt(c.req.query('maxResults') ?? '20', 10), 50);

  if (!q?.trim()) {
    return c.json({ error: 'q parameter is required' }, 400);
  }

  const accessToken = await getValidAccessToken(c.env, accountId);

  const response = await searchThreads(accessToken, q.trim(), maxResults, pageToken);

  const threadIds = (response.threads ?? []).map((t) => t.id);
  const BATCH = 10;
  const parsed = [];

  for (let i = 0; i < threadIds.length; i += BATCH) {
    const batch = threadIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((id) => getThread(accessToken, id).then(parseThread))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') parsed.push(r.value);
    }
  }

  return c.json({
    threads: parsed,
    nextPageToken: response.nextPageToken ?? null,
    resultSizeEstimate: response.resultSizeEstimate ?? 0,
    query: q,
  });
});

export { search as searchRouter };
