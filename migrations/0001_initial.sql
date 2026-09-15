-- ============================================================
-- Onemail D1 schema — migration 0001
-- ============================================================

-- Primary user account (the first Google account used to sign in)
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,           -- nanoid
  google_id   TEXT NOT NULL UNIQUE,       -- Google sub claim
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_email     ON users(email);

-- Additional Google accounts linked to a primary user
CREATE TABLE IF NOT EXISTS linked_accounts (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_id      TEXT NOT NULL,
  email          TEXT NOT NULL,
  name           TEXT NOT NULL,
  avatar_url     TEXT,
  is_primary     INTEGER NOT NULL DEFAULT 0,  -- 1 = primary account
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, google_id)
);

CREATE INDEX idx_linked_accounts_user_id   ON linked_accounts(user_id);
CREATE INDEX idx_linked_accounts_google_id ON linked_accounts(google_id);

-- Encrypted OAuth credentials per linked account
CREATE TABLE IF NOT EXISTS oauth_credentials (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_account_id   TEXT NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,
  access_token_enc    TEXT NOT NULL,   -- AES-256-GCM encrypted
  refresh_token_enc   TEXT NOT NULL,   -- AES-256-GCM encrypted
  expires_at          INTEGER NOT NULL,
  scope               TEXT NOT NULL,
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(linked_account_id)
);

CREATE INDEX idx_oauth_credentials_user_id          ON oauth_credentials(user_id);
CREATE INDEX idx_oauth_credentials_linked_account_id ON oauth_credentials(linked_account_id);

-- Application sessions (session ID lives in KV; D1 row is audit record)
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,      -- 32-byte random hex
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_account_id TEXT REFERENCES linked_accounts(id) ON DELETE SET NULL,
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Per-user, per-linked-account preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_account_id   TEXT REFERENCES linked_accounts(id) ON DELETE CASCADE,
  theme               TEXT NOT NULL DEFAULT 'system',   -- light | dark | system
  tracking_enabled    INTEGER NOT NULL DEFAULT 1,
  signature           TEXT,
  shortcuts_enabled   INTEGER NOT NULL DEFAULT 1,
  density             TEXT NOT NULL DEFAULT 'comfortable', -- compact | comfortable | spacious
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, linked_account_id)
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Tracked outbound emails (per linked account)
CREATE TABLE IF NOT EXISTS tracked_emails (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_account_id TEXT NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,
  gmail_message_id  TEXT NOT NULL,
  tracking_id       TEXT NOT NULL UNIQUE,   -- URL-safe random ID
  recipient_hash    TEXT NOT NULL,          -- SHA-256 of recipient email
  subject_preview   TEXT,                   -- truncated subject
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_tracked_emails_user_id          ON tracked_emails(user_id);
CREATE INDEX idx_tracked_emails_tracking_id      ON tracked_emails(tracking_id);
CREATE INDEX idx_tracked_emails_gmail_message_id ON tracked_emails(gmail_message_id);
CREATE INDEX idx_tracked_emails_created_at       ON tracked_emails(created_at);

-- Email open events
CREATE TABLE IF NOT EXISTS email_opens (
  id              TEXT PRIMARY KEY,
  tracking_id     TEXT NOT NULL REFERENCES tracked_emails(tracking_id) ON DELETE CASCADE,
  opened_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  user_agent      TEXT,
  ip_hash         TEXT,      -- SHA-256 of IP, never raw IP
  country_code    TEXT       -- from CF-IPCountry header
);

CREATE INDEX idx_email_opens_tracking_id ON email_opens(tracking_id);
CREATE INDEX idx_email_opens_opened_at   ON email_opens(opened_at);
