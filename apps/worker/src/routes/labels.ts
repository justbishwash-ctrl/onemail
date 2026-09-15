import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.ts';
import { getValidAccessToken } from '../services/oauth/google.ts';
import { listLabels, createLabel } from '../services/gmail/client.ts';
import type { Env, HonoVariables } from '../types/env.ts';

const labels = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// GET /api/labels
labels.get('/', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const accessToken = await getValidAccessToken(c.env, accountId);
  const list = await listLabels(accessToken);
  return c.json({ labels: list });
});

// POST /api/labels
labels.post('/', requireAuth, async (c) => {
  const accountId = c.get('activeAccountId');
  const body = await c.req.json<{ name: string; color?: { textColor: string; backgroundColor: string } }>();

  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400);
  }

  const accessToken = await getValidAccessToken(c.env, accountId);
  const label = await createLabel(accessToken, body.name.trim(), body.color);
  return c.json(label, 201);
});

export { labels as labelsRouter };
