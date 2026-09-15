import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.ts';
import { getLinkedAccountsByUserId, getUserPreferences, upsertUserPreferences } from '../db/queries.ts';
import type { Env, HonoVariables } from '../types/env.ts';

const me = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// GET /api/me
me.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const activeAccount = c.get('linkedAccount');
  const accounts = await getLinkedAccountsByUserId(c.env.DB, user.id);
  const prefs = await getUserPreferences(c.env.DB, user.id, activeAccount.id);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
    },
    activeAccount: {
      id: activeAccount.id,
      email: activeAccount.email,
      name: activeAccount.name,
      avatarUrl: activeAccount.avatar_url,
      isPrimary: activeAccount.is_primary === 1,
    },
    linkedAccounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      avatarUrl: a.avatar_url,
      isPrimary: a.is_primary === 1,
    })),
    preferences: prefs
      ? {
          theme: prefs.theme,
          trackingEnabled: prefs.tracking_enabled === 1,
          signature: prefs.signature,
          shortcutsEnabled: prefs.shortcuts_enabled === 1,
          density: prefs.density,
        }
      : {
          theme: 'system',
          trackingEnabled: true,
          signature: null,
          shortcutsEnabled: true,
          density: 'comfortable',
        },
  });
});

// PATCH /api/me/preferences
me.patch('/preferences', requireAuth, async (c) => {
  const userId = c.get('userId');
  const activeAccountId = c.get('activeAccountId');
  const body = await c.req.json<{
    theme?: 'light' | 'dark' | 'system';
    trackingEnabled?: boolean;
    signature?: string;
    shortcutsEnabled?: boolean;
    density?: 'compact' | 'comfortable' | 'spacious';
  }>();

  const current = await getUserPreferences(c.env.DB, userId, activeAccountId);
  await upsertUserPreferences(c.env.DB, {
    user_id: userId,
    linked_account_id: activeAccountId,
    theme: body.theme ?? current?.theme ?? 'system',
    tracking_enabled: body.trackingEnabled === undefined
      ? current?.tracking_enabled ?? 1
      : body.trackingEnabled ? 1 : 0,
    signature: body.signature === undefined ? current?.signature ?? null : body.signature,
    shortcuts_enabled: body.shortcutsEnabled === undefined
      ? current?.shortcuts_enabled ?? 1
      : body.shortcutsEnabled ? 1 : 0,
    density: body.density ?? current?.density ?? 'comfortable',
  });

  return c.json({ ok: true });
});

export { me as meRouter };
