import { encrypt, decrypt } from '../../utils/crypto.ts';
import { upsertOAuthCredentials, getOAuthCredentials } from '../../db/queries.ts';
import type { Env } from '../../types/env.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'openid',
  'email',
  'profile',
].join(' ');

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export function buildAuthorizationUrl(
  env: Env,
  state: string,
  loginHint?: string,
  addAccount = false
): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/auth/google/callback`,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    state,
    access_type: 'offline',
    // Force prompt so we always get a refresh token on re-auth
    prompt: addAccount ? 'consent select_account' : 'consent',
  });

  if (loginHint) params.set('login_hint', loginHint);

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  env: Env,
  code: string
): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.WORKER_URL}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return res.json<TokenResponse>();
}

export async function refreshAccessToken(
  env: Env,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 || res.status === 401) {
      throw new OAuthRevokedError(`Refresh token revoked or expired: ${text}`);
    }
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json<TokenResponse>();
  const expiresAt = Date.now() + data.expires_in * 1000;
  return { accessToken: data.access_token, expiresAt };
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Google user info: ${res.status}`);
  }

  return res.json<GoogleUserInfo>();
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
  });
  // Best-effort revocation; ignore errors
}

/**
 * Gets a valid access token for a linked account.
 * Refreshes automatically if expired or within 60 seconds of expiry.
 */
export async function getValidAccessToken(
  env: Env,
  linkedAccountId: string
): Promise<string> {
  const creds = await getOAuthCredentials(env.DB, linkedAccountId);
  if (!creds) throw new Error('OAuth credentials not found');

  const now = Date.now();
  const bufferMs = 60_000; // 60 seconds buffer

  // Return existing token if still valid
  if (creds.expires_at > now + bufferMs) {
    return decrypt(creds.access_token_enc, env.TOKEN_ENCRYPTION_KEY);
  }

  // Refresh
  const refreshToken = await decrypt(creds.refresh_token_enc, env.TOKEN_ENCRYPTION_KEY);
  const { accessToken, expiresAt } = await refreshAccessToken(env, refreshToken);

  // Store updated access token (keep existing refresh token)
  const accessTokenEnc = await encrypt(accessToken, env.TOKEN_ENCRYPTION_KEY);
  await upsertOAuthCredentials(env.DB, {
    userId: creds.user_id,
    linkedAccountId,
    accessTokenEnc,
    refreshTokenEnc: '', // empty string triggers CASE WHEN to keep existing
    expiresAt,
    scope: creds.scope,
  });

  return accessToken;
}

export class OAuthRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthRevokedError';
  }
}
