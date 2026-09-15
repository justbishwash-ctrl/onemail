import type { Context, Next } from 'hono';
import { getSessionIdFromRequest, getSession } from '../services/oauth/session.ts';
import { getUserById, getLinkedAccountById } from '../db/queries.ts';
import { jsonError } from '../utils/response.ts';
import type { Env, HonoVariables } from '../types/env.ts';

export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  next: Next
): Promise<Response | void> {
  const sessionId = getSessionIdFromRequest(c.req.raw);
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);

  const session = await getSession(c.env, sessionId);
  if (!session) return c.json({ error: 'Session expired' }, 401);

  const user = await getUserById(c.env.DB, session.userId);
  if (!user) return c.json({ error: 'User not found' }, 401);

  const linkedAccount = await getLinkedAccountById(c.env.DB, session.activeAccountId);
  if (!linkedAccount) return c.json({ error: 'Account not found' }, 401);

  c.set('userId', session.userId);
  c.set('activeAccountId', session.activeAccountId);
  c.set('user', user);
  c.set('linkedAccount', linkedAccount);

  await next();
}
