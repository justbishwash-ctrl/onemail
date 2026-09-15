import { randomHex } from '../../utils/crypto.ts';
import { createSessionRecord, deleteSessionRecord, updateSessionActiveAccount } from '../../db/queries.ts';
import type { Env, SessionData } from '../../types/env.ts';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SESSION_COOKIE_NAME = 'om_session';

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function buildSessionCookie(sessionId: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'Path=/',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Path=/',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export async function createSession(
  env: Env,
  userId: string,
  activeAccountId: string
): Promise<string> {
  const sessionId = randomHex(32);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  const sessionData: SessionData = { userId, activeAccountId, expiresAt };

  // Store in KV for fast lookup
  await env.SESSIONS.put(sessionId, JSON.stringify(sessionData), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  // Audit row in D1
  await createSessionRecord(env.DB, sessionId, userId, activeAccountId, expiresAt);

  return sessionId;
}

export async function getSession(env: Env, sessionId: string): Promise<SessionData | null> {
  if (!sessionId || sessionId.length !== 64) return null;

  const raw = await env.SESSIONS.get(sessionId);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as SessionData;
    if (data.expiresAt < Math.floor(Date.now() / 1000)) {
      await destroySession(env, sessionId);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function destroySession(env: Env, sessionId: string): Promise<void> {
  await Promise.allSettled([
    env.SESSIONS.delete(sessionId),
    deleteSessionRecord(env.DB, sessionId),
  ]);
}

export async function switchActiveAccount(
  env: Env,
  sessionId: string,
  newAccountId: string
): Promise<void> {
  const raw = await env.SESSIONS.get(sessionId);
  if (!raw) throw new Error('Session not found');

  const data = JSON.parse(raw) as SessionData;
  data.activeAccountId = newAccountId;

  await env.SESSIONS.put(sessionId, JSON.stringify(data), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  await updateSessionActiveAccount(env.DB, sessionId, newAccountId);
}

export function getSessionIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), v.join('=').trim()];
    })
  );

  return cookies[SESSION_COOKIE_NAME] ?? null;
}
