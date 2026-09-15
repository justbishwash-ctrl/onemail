import { Hono } from 'hono';
import { randomHex, encrypt, decrypt } from '../utils/crypto.ts';
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  revokeToken,
} from '../services/oauth/google.ts';
import {
  createSession,
  destroySession,
  getSessionIdFromRequest,
  getSession,
  buildSessionCookie,
  clearSessionCookie,
  switchActiveAccount,
} from '../services/oauth/session.ts';
import {
  getUserByGoogleId,
  createUser,
  getLinkedAccountByGoogleId,
  createLinkedAccount,
  updateLinkedAccount,
  upsertOAuthCredentials,
  getLinkedAccountsByUserId,
  getOAuthCredentials,
  deleteLinkedAccount,
} from '../db/queries.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimiter } from '../middleware/security.ts';
import type { Env, HonoVariables } from '../types/env.ts';

const auth = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

const STATE_TTL = 600; // 10 minutes

// ── GET /auth/google ────────────────────────────────────────
// Initiates OAuth. add_account=true links a new Gmail to an existing session.
auth.get('/google', async (c) => {
  const addAccount = c.req.query('add_account') === 'true';
  const loginHint = c.req.query('login_hint');

  const state = randomHex(24);

  // Persist state in KV; also encode add_account flag
  await c.env.OAUTH_STATE.put(
    `state:${state}`,
    JSON.stringify({ addAccount }),
    { expirationTtl: STATE_TTL }
  );

  // If adding account, include current session ID in state to associate later
  let sessionId: string | null = null;
  if (addAccount) {
    sessionId = getSessionIdFromRequest(c.req.raw);
    if (sessionId) {
      await c.env.OAUTH_STATE.put(
        `state:${state}`,
        JSON.stringify({ addAccount: true, sessionId }),
        { expirationTtl: STATE_TTL }
      );
    }
  }

  const url = buildAuthorizationUrl(c.env, state, loginHint ?? undefined, addAccount);
  return Response.redirect(url, 302);
});

// ── GET /auth/google/callback ───────────────────────────────
auth.get(
  '/google/callback',
  rateLimiter({ windowSeconds: 60, maxRequests: 20, keyPrefix: 'oauth_cb' }),
  async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');
    const appUrl = c.env.APP_URL;
    const isSecure = appUrl.startsWith('https');

    if (error) {
      return Response.redirect(`${appUrl}/auth/error?reason=${encodeURIComponent(error)}`, 302);
    }

    if (!code || !state) {
      return Response.redirect(`${appUrl}/auth/error?reason=missing_params`, 302);
    }

    // Validate state (CSRF protection)
    const stateRaw = await c.env.OAUTH_STATE.get(`state:${state}`);
    if (!stateRaw) {
      return Response.redirect(`${appUrl}/auth/error?reason=invalid_state`, 302);
    }
    await c.env.OAUTH_STATE.delete(`state:${state}`); // one-time use

    const stateData = JSON.parse(stateRaw) as { addAccount: boolean; sessionId?: string };

    // Exchange code for tokens
    let tokens;
    try {
      tokens = await exchangeCodeForTokens(c.env, code);
    } catch (err) {
      console.error('Token exchange error:', err);
      return Response.redirect(`${appUrl}/auth/error?reason=token_exchange`, 302);
    }

    if (!tokens.refresh_token) {
      // This happens if the user already granted access and prompt was not consent.
      // Should not happen with prompt=consent but handle gracefully.
      return Response.redirect(`${appUrl}/auth/error?reason=no_refresh_token`, 302);
    }

    // Fetch Google user info
    let googleUser;
    try {
      googleUser = await fetchGoogleUserInfo(tokens.access_token);
    } catch (err) {
      console.error('Userinfo error:', err);
      return Response.redirect(`${appUrl}/auth/error?reason=userinfo`, 302);
    }

    if (!googleUser.email_verified) {
      return Response.redirect(`${appUrl}/auth/error?reason=email_not_verified`, 302);
    }

    const expiresAt = Date.now() + tokens.expires_in * 1000;

    // Encrypt tokens
    const accessTokenEnc = await encrypt(tokens.access_token, c.env.TOKEN_ENCRYPTION_KEY);
    const refreshTokenEnc = await encrypt(tokens.refresh_token, c.env.TOKEN_ENCRYPTION_KEY);

    // ── Add Account flow ────────────────────────────────
    if (stateData.addAccount && stateData.sessionId) {
      const session = await getSession(c.env, stateData.sessionId);
      if (!session) {
        return Response.redirect(`${appUrl}/auth/error?reason=session_expired`, 302);
      }

      const existingLinked = await getLinkedAccountByGoogleId(
        c.env.DB,
        session.userId,
        googleUser.sub
      );

      let linkedAccountId: string;

      if (existingLinked) {
        // Update existing linked account info
        await updateLinkedAccount(c.env.DB, existingLinked.id, {
          email: googleUser.email,
          name: googleUser.name,
          avatar_url: googleUser.picture ?? '',
        });
        linkedAccountId = existingLinked.id;
      } else {
        const linked = await createLinkedAccount(c.env.DB, {
          userId: session.userId,
          googleId: googleUser.sub,
          email: googleUser.email,
          name: googleUser.name,
          avatarUrl: googleUser.picture,
          isPrimary: false,
        });
        linkedAccountId = linked.id;
      }

      await upsertOAuthCredentials(c.env.DB, {
        userId: session.userId,
        linkedAccountId,
        accessTokenEnc,
        refreshTokenEnc,
        expiresAt,
        scope: tokens.scope,
      });

      // Switch active account to the newly added one
      await switchActiveAccount(c.env, stateData.sessionId, linkedAccountId);

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${appUrl}/inbox`,
          'Set-Cookie': buildSessionCookie(stateData.sessionId, isSecure),
        },
      });
    }

    // ── Sign-in / Register flow ─────────────────────────
    let user = await getUserByGoogleId(c.env.DB, googleUser.sub);

    if (!user) {
      user = await createUser(c.env.DB, {
        googleId: googleUser.sub,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
      });
    }

    // Create or update linked account (primary)
    let linkedAccount = await getLinkedAccountByGoogleId(c.env.DB, user.id, googleUser.sub);

    if (!linkedAccount) {
      linkedAccount = await createLinkedAccount(c.env.DB, {
        userId: user.id,
        googleId: googleUser.sub,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
        isPrimary: true,
      });
    } else {
      await updateLinkedAccount(c.env.DB, linkedAccount.id, {
        email: googleUser.email,
        name: googleUser.name,
        avatar_url: googleUser.picture ?? '',
      });
    }

    await upsertOAuthCredentials(c.env.DB, {
      userId: user.id,
      linkedAccountId: linkedAccount.id,
      accessTokenEnc,
      refreshTokenEnc,
      expiresAt,
      scope: tokens.scope,
    });

    const sessionId = await createSession(c.env, user.id, linkedAccount.id);

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${appUrl}/inbox`,
        'Set-Cookie': buildSessionCookie(sessionId, isSecure),
      },
    });
  }
);

// ── POST /auth/logout ───────────────────────────────────────
auth.post('/logout', async (c) => {
  const sessionId = getSessionIdFromRequest(c.req.raw);
  const isSecure = c.env.APP_URL.startsWith('https');

  if (sessionId) {
    await destroySession(c.env, sessionId);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(isSecure),
    },
  });
});

// ── POST /auth/switch-account ───────────────────────────────
auth.post('/switch-account', requireAuth, async (c) => {
  const sessionId = getSessionIdFromRequest(c.req.raw)!;
  const body = await c.req.json<{ linkedAccountId: string }>();

  if (!body.linkedAccountId) {
    return c.json({ error: 'linkedAccountId required' }, 400);
  }

  const userId = c.get('userId');

  // Verify the linked account belongs to this user
  const accounts = await getLinkedAccountsByUserId(c.env.DB, userId);
  const target = accounts.find((a) => a.id === body.linkedAccountId);
  if (!target) {
    return c.json({ error: 'Account not found' }, 404);
  }

  await switchActiveAccount(c.env, sessionId, body.linkedAccountId);

  const isSecure = c.env.APP_URL.startsWith('https');
  return new Response(JSON.stringify({ ok: true, activeAccountId: body.linkedAccountId }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildSessionCookie(sessionId, isSecure),
    },
  });
});

// ── DELETE /auth/accounts/:id ───────────────────────────────
// Unlinks a Google account from the portal
auth.delete('/accounts/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const accountId = c.req.param('id');

  const accounts = await getLinkedAccountsByUserId(c.env.DB, userId);
  const target = accounts.find((a) => a.id === accountId);

  if (!target) return c.json({ error: 'Account not found' }, 404);

  // Cannot remove the only account
  if (accounts.length === 1) {
    return c.json({ error: 'Cannot remove the only linked account' }, 400);
  }

  // Revoke token best-effort
  try {
    const creds = await getOAuthCredentials(c.env.DB, accountId);
    if (creds) {
      const accessToken = await decrypt(creds.access_token_enc, c.env.TOKEN_ENCRYPTION_KEY);
      await revokeToken(accessToken);
    }
  } catch {
    // Best effort — continue with deletion
  }

  await deleteLinkedAccount(c.env.DB, accountId);

  return c.json({ ok: true });
});

export { auth as authRouter };
