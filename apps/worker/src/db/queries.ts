import type { Env, User, LinkedAccount, OAuthCredentials, UserPreferences, TrackedEmail, EmailOpen } from '../types/env.ts';
import { generateId } from '../utils/id.ts';

// ── Users ──────────────────────────────────────────────────

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
  return row ?? null;
}

export async function getUserByGoogleId(db: D1Database, googleId: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE google_id = ?')
    .bind(googleId)
    .first<User>();
  return row ?? null;
}

export async function createUser(
  db: D1Database,
  data: { googleId: string; email: string; name: string; avatarUrl?: string }
): Promise<User> {
  const id = generateId();
  await db
    .prepare(
      `INSERT INTO users (id, google_id, email, name, avatar_url)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, data.googleId, data.email, data.name, data.avatarUrl ?? null)
    .run();
  return (await getUserById(db, id))!;
}

export async function updateUser(
  db: D1Database,
  id: string,
  data: Partial<{ email: string; name: string; avatar_url: string }>
): Promise<void> {
  const fields = Object.keys(data)
    .map((k) => `${k} = ?`)
    .join(', ');
  const values = Object.values(data);
  await db
    .prepare(`UPDATE users SET ${fields}, updated_at = unixepoch() WHERE id = ?`)
    .bind(...values, id)
    .run();
}

// ── Linked Accounts ────────────────────────────────────────

export async function getLinkedAccountsByUserId(
  db: D1Database,
  userId: string
): Promise<LinkedAccount[]> {
  const result = await db
    .prepare('SELECT * FROM linked_accounts WHERE user_id = ? ORDER BY is_primary DESC, created_at ASC')
    .bind(userId)
    .all<LinkedAccount>();
  return result.results ?? [];
}

export async function getLinkedAccountById(
  db: D1Database,
  id: string
): Promise<LinkedAccount | null> {
  const row = await db
    .prepare('SELECT * FROM linked_accounts WHERE id = ?')
    .bind(id)
    .first<LinkedAccount>();
  return row ?? null;
}

export async function getLinkedAccountByGoogleId(
  db: D1Database,
  userId: string,
  googleId: string
): Promise<LinkedAccount | null> {
  const row = await db
    .prepare('SELECT * FROM linked_accounts WHERE user_id = ? AND google_id = ?')
    .bind(userId, googleId)
    .first<LinkedAccount>();
  return row ?? null;
}

export async function createLinkedAccount(
  db: D1Database,
  data: {
    userId: string;
    googleId: string;
    email: string;
    name: string;
    avatarUrl?: string;
    isPrimary?: boolean;
  }
): Promise<LinkedAccount> {
  const id = generateId();
  await db
    .prepare(
      `INSERT INTO linked_accounts (id, user_id, google_id, email, name, avatar_url, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.userId,
      data.googleId,
      data.email,
      data.name,
      data.avatarUrl ?? null,
      data.isPrimary ? 1 : 0
    )
    .run();
  return (await getLinkedAccountById(db, id))!;
}

export async function updateLinkedAccount(
  db: D1Database,
  id: string,
  data: Partial<{ email: string; name: string; avatar_url: string }>
): Promise<void> {
  const fields = Object.keys(data)
    .map((k) => `${k} = ?`)
    .join(', ');
  const values = Object.values(data);
  await db
    .prepare(`UPDATE linked_accounts SET ${fields}, updated_at = unixepoch() WHERE id = ?`)
    .bind(...values, id)
    .run();
}

export async function deleteLinkedAccount(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM linked_accounts WHERE id = ?').bind(id).run();
}

// ── OAuth Credentials ──────────────────────────────────────

export async function getOAuthCredentials(
  db: D1Database,
  linkedAccountId: string
): Promise<OAuthCredentials | null> {
  const row = await db
    .prepare('SELECT * FROM oauth_credentials WHERE linked_account_id = ?')
    .bind(linkedAccountId)
    .first<OAuthCredentials>();
  return row ?? null;
}

export async function upsertOAuthCredentials(
  db: D1Database,
  data: {
    userId: string;
    linkedAccountId: string;
    accessTokenEnc: string;
    refreshTokenEnc: string;
    expiresAt: number;
    scope: string;
  }
): Promise<void> {
  const id = generateId();
  await db
    .prepare(
      `INSERT INTO oauth_credentials
         (id, user_id, linked_account_id, access_token_enc, refresh_token_enc, expires_at, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(linked_account_id) DO UPDATE SET
         access_token_enc = excluded.access_token_enc,
         refresh_token_enc = CASE
           WHEN excluded.refresh_token_enc != '' THEN excluded.refresh_token_enc
           ELSE refresh_token_enc
         END,
         expires_at  = excluded.expires_at,
         scope       = excluded.scope,
         updated_at  = unixepoch()`
    )
    .bind(
      id,
      data.userId,
      data.linkedAccountId,
      data.accessTokenEnc,
      data.refreshTokenEnc,
      data.expiresAt,
      data.scope
    )
    .run();
}

// ── Sessions ───────────────────────────────────────────────

export async function createSessionRecord(
  db: D1Database,
  sessionId: string,
  userId: string,
  activeAccountId: string,
  expiresAt: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, active_account_id, expires_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(sessionId, userId, activeAccountId, expiresAt)
    .run();
}

export async function deleteSessionRecord(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

export async function updateSessionActiveAccount(
  db: D1Database,
  sessionId: string,
  activeAccountId: string
): Promise<void> {
  await db
    .prepare('UPDATE sessions SET active_account_id = ? WHERE id = ?')
    .bind(activeAccountId, sessionId)
    .run();
}

// ── User Preferences ───────────────────────────────────────

export async function getUserPreferences(
  db: D1Database,
  userId: string,
  linkedAccountId?: string
): Promise<UserPreferences | null> {
  const row = await db
    .prepare(
      `SELECT * FROM user_preferences
       WHERE user_id = ? AND (linked_account_id = ? OR linked_account_id IS NULL)
       ORDER BY linked_account_id DESC LIMIT 1`
    )
    .bind(userId, linkedAccountId ?? null)
    .first<UserPreferences>();
  return row ?? null;
}

export async function upsertUserPreferences(
  db: D1Database,
  data: Partial<UserPreferences> & { user_id: string }
): Promise<void> {
  const id = generateId();
  await db
    .prepare(
      `INSERT INTO user_preferences
         (id, user_id, linked_account_id, theme, tracking_enabled, signature, shortcuts_enabled, density)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, linked_account_id) DO UPDATE SET
         theme             = excluded.theme,
         tracking_enabled  = excluded.tracking_enabled,
         signature         = excluded.signature,
         shortcuts_enabled = excluded.shortcuts_enabled,
         density           = excluded.density,
         updated_at        = unixepoch()`
    )
    .bind(
      id,
      data.user_id,
      data.linked_account_id ?? null,
      data.theme ?? 'system',
      data.tracking_enabled ?? 1,
      data.signature ?? null,
      data.shortcuts_enabled ?? 1,
      data.density ?? 'comfortable'
    )
    .run();
}

// ── Tracked Emails ─────────────────────────────────────────

export async function createTrackedEmail(
  db: D1Database,
  data: {
    userId: string;
    linkedAccountId: string;
    gmailMessageId: string;
    trackingId: string;
    recipientHash: string;
    subjectPreview?: string;
  }
): Promise<void> {
  const id = generateId();
  await db
    .prepare(
      `INSERT INTO tracked_emails
         (id, user_id, linked_account_id, gmail_message_id, tracking_id, recipient_hash, subject_preview)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.userId,
      data.linkedAccountId,
      data.gmailMessageId,
      data.trackingId,
      data.recipientHash,
      data.subjectPreview ?? null
    )
    .run();
}

export async function getTrackedEmailByTrackingId(
  db: D1Database,
  trackingId: string
): Promise<TrackedEmail | null> {
  const row = await db
    .prepare('SELECT * FROM tracked_emails WHERE tracking_id = ?')
    .bind(trackingId)
    .first<TrackedEmail>();
  return row ?? null;
}

export async function getTrackedEmailsForAccount(
  db: D1Database,
  userId: string,
  linkedAccountId: string,
  limit = 50,
  offset = 0
): Promise<TrackedEmail[]> {
  const result = await db
    .prepare(
      `SELECT * FROM tracked_emails
       WHERE user_id = ? AND linked_account_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(userId, linkedAccountId, limit, offset)
    .all<TrackedEmail>();
  return result.results ?? [];
}

// ── Email Opens ────────────────────────────────────────────

export async function recordEmailOpen(
  db: D1Database,
  data: {
    trackingId: string;
    userAgent?: string;
    ipHash?: string;
    countryCode?: string;
  }
): Promise<void> {
  const id = generateId();
  await db
    .prepare(
      `INSERT INTO email_opens (id, tracking_id, user_agent, ip_hash, country_code)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.trackingId,
      data.userAgent ?? null,
      data.ipHash ?? null,
      data.countryCode ?? null
    )
    .run();
}

export interface TrackingStats {
  totalOpens: number;
  firstOpenedAt: number | null;
  lastOpenedAt: number | null;
  opens: EmailOpen[];
}

export async function getTrackingStats(
  db: D1Database,
  trackingId: string
): Promise<TrackingStats> {
  const opens = await db
    .prepare(
      `SELECT * FROM email_opens WHERE tracking_id = ? ORDER BY opened_at ASC`
    )
    .bind(trackingId)
    .all<EmailOpen>();

  const list = opens.results ?? [];
  return {
    totalOpens: list.length,
    firstOpenedAt: list.length > 0 ? list[0].opened_at : null,
    lastOpenedAt: list.length > 0 ? list[list.length - 1].opened_at : null,
    opens: list,
  };
}
