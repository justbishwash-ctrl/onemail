export interface Env {
  // D1
  DB: D1Database;

  // KV
  SESSIONS: KVNamespace;
  OAUTH_STATE: KVNamespace;

  // R2
  ATTACHMENTS: R2Bucket;

  // Secrets (set via wrangler secret put)
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  APP_URL: string;
  WORKER_URL: string;
  ENVIRONMENT: string;
}

export interface SessionData {
  userId: string;
  activeAccountId: string;
  expiresAt: number;
}

export interface User {
  id: string;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
}

export interface LinkedAccount {
  id: string;
  user_id: string;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_primary: number;
  created_at: number;
  updated_at: number;
}

export interface OAuthCredentials {
  id: string;
  user_id: string;
  linked_account_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: number;
  scope: string;
  updated_at: number;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  linked_account_id: string | null;
  theme: 'light' | 'dark' | 'system';
  tracking_enabled: number;
  signature: string | null;
  shortcuts_enabled: number;
  density: 'compact' | 'comfortable' | 'spacious';
  updated_at: number;
}

export interface TrackedEmail {
  id: string;
  user_id: string;
  linked_account_id: string;
  gmail_message_id: string;
  tracking_id: string;
  recipient_hash: string;
  subject_preview: string | null;
  created_at: number;
}

export interface EmailOpen {
  id: string;
  tracking_id: string;
  opened_at: number;
  user_agent: string | null;
  ip_hash: string | null;
  country_code: string | null;
}

// Context variable type for Hono
export interface HonoVariables {
  userId: string;
  activeAccountId: string;
  user: User;
  linkedAccount: LinkedAccount;
}
