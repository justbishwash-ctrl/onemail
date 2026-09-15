/**
 * Typed API client for the Onemail Worker backend.
 * All fetch calls go through this module.
 */

import type { ParsedThread, ParsedMessage, GmailLabel, GmailSendRequest } from '../types/gmail';

export const WORKER_URL = 'https://onemail-cf.therealbishwash.workers.dev';
const BASE = `${WORKER_URL}/api`;

class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (res.status === 401) {
    const data = await res.json() as { error: string; code?: string };
    if (data.code === 'AUTH_REVOKED') {
      // Redirect to re-auth
      window.location.href = `${WORKER_URL}/auth/google`;
    }
    throw new ApiError(data.error, 401, data.code);
  }

  if (!res.ok) {
    const data = await res.json().then((value) => value as { error: string; code?: string }).catch(() => ({
      error: 'Unknown error',
      code: undefined,
    }));
    throw new ApiError(data.error, res.status, data.code);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// ── Me ─────────────────────────────────────────────────────

export interface MeResponse {
  user: { id: string; email: string; name: string; avatarUrl: string | null };
  activeAccount: { id: string; email: string; name: string; avatarUrl: string | null; isPrimary: boolean };
  linkedAccounts: Array<{ id: string; email: string; name: string; avatarUrl: string | null; isPrimary: boolean }>;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    trackingEnabled: boolean;
    signature: string | null;
    shortcutsEnabled: boolean;
    density: 'compact' | 'comfortable' | 'spacious';
  };
}

export const meApi = {
  get: () => apiFetch<MeResponse>('/me'),
  updatePreferences: (prefs: Partial<MeResponse['preferences']>) =>
    apiFetch<{ ok: boolean }>('/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    }),
};

// ── Threads ────────────────────────────────────────────────

export interface ThreadsResponse {
  threads: ParsedThread[];
  nextPageToken: string | null;
  resultSizeEstimate: number;
}

export const threadsApi = {
  list: (params: { label?: string; q?: string; pageToken?: string; maxResults?: number }) => {
    const qs = new URLSearchParams();
    if (params.label) qs.set('label', params.label);
    if (params.q) qs.set('q', params.q);
    if (params.pageToken) qs.set('pageToken', params.pageToken);
    if (params.maxResults) qs.set('maxResults', String(params.maxResults));
    return apiFetch<ThreadsResponse>(`/threads?${qs.toString()}`);
  },
  get: (id: string) => apiFetch<ParsedThread>(`/threads/${id}`),
  archive: (id: string) => apiFetch<{ ok: boolean }>(`/threads/${id}/archive`, { method: 'POST' }),
  trash: (id: string) => apiFetch<{ ok: boolean }>(`/threads/${id}/trash`, { method: 'POST' }),
  restore: (id: string) => apiFetch<{ ok: boolean }>(`/threads/${id}/restore`, { method: 'POST' }),
  markRead: (id: string) => apiFetch<{ ok: boolean }>(`/threads/${id}/read`, { method: 'POST' }),
  markUnread: (id: string) => apiFetch<{ ok: boolean }>(`/threads/${id}/unread`, { method: 'POST' }),
  star: (id: string) => apiFetch<{ ok: boolean }>(`/threads/${id}/star`, { method: 'POST' }),
  unstar: (id: string) => apiFetch<{ ok: boolean }>(`/threads/${id}/unstar`, { method: 'POST' }),
  spam: (id: string) => apiFetch<{ ok: boolean }>(`/threads/${id}/spam`, { method: 'POST' }),
  modifyLabels: (id: string, add: string[], remove: string[]) =>
    apiFetch<{ ok: boolean }>(`/threads/${id}/labels`, {
      method: 'POST',
      body: JSON.stringify({ add, remove }),
    }),
};

// ── Messages ───────────────────────────────────────────────

export const messagesApi = {
  get: (id: string) => apiFetch<ParsedMessage>(`/messages/${id}`),
  send: (data: GmailSendRequest & { trackingEnabled?: boolean }) =>
    apiFetch<{ id: string; threadId: string }>('/messages/send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getAttachment: (messageId: string, attachmentId: string) =>
    apiFetch<{ data: string; size: number }>(`/messages/${messageId}/attachment/${attachmentId}`),
  markRead: (id: string) =>
    apiFetch<{ ok: boolean }>(`/messages/${id}/read`, { method: 'POST' }),
  markUnread: (id: string) =>
    apiFetch<{ ok: boolean }>(`/messages/${id}/unread`, { method: 'POST' }),
  star: (id: string) =>
    apiFetch<{ ok: boolean }>(`/messages/${id}/star`, { method: 'POST' }),
  unstar: (id: string) =>
    apiFetch<{ ok: boolean }>(`/messages/${id}/unstar`, { method: 'POST' }),
  archive: (id: string) =>
    apiFetch<{ ok: boolean }>(`/messages/${id}/archive`, { method: 'POST' }),
  trash: (id: string) =>
    apiFetch<{ ok: boolean }>(`/messages/${id}/trash`, { method: 'POST' }),
};

// ── Drafts ─────────────────────────────────────────────────

export const draftsApi = {
  list: (pageToken?: string) => {
    const qs = pageToken ? `?pageToken=${pageToken}` : '';
    return apiFetch<{ drafts?: Array<{ id: string }> }>(`/messages/drafts${qs}`);
  },
  create: (data: GmailSendRequest) =>
    apiFetch<{ id: string }>('/messages/drafts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: GmailSendRequest) =>
    apiFetch<{ id: string }>(`/messages/drafts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/messages/drafts/${id}`, { method: 'DELETE' }),
};

// ── Labels ─────────────────────────────────────────────────

export const labelsApi = {
  list: () => apiFetch<{ labels: GmailLabel[] }>('/labels'),
  create: (name: string, color?: { textColor: string; backgroundColor: string }) =>
    apiFetch<GmailLabel>('/labels', { method: 'POST', body: JSON.stringify({ name, color }) }),
};

// ── Search ─────────────────────────────────────────────────

export const searchApi = {
  search: (q: string, pageToken?: string) => {
    const qs = new URLSearchParams({ q });
    if (pageToken) qs.set('pageToken', pageToken);
    return apiFetch<ThreadsResponse>(`/search?${qs.toString()}`);
  },
};

// ── Tracking ───────────────────────────────────────────────

export interface TrackedEmailItem {
  id: string;
  trackingId: string;
  gmailMessageId: string;
  subjectPreview: string | null;
  createdAt: number;
  isOpened: boolean;
  totalOpens: number;
  firstOpenedAt: number | null;
  lastOpenedAt: number | null;
}

export const trackingApi = {
  list: (limit = 50, offset = 0) =>
    apiFetch<{ trackedEmails: TrackedEmailItem[]; total: number }>(
      `/tracking?limit=${limit}&offset=${offset}`
    ),
  get: (trackingId: string) => apiFetch<TrackedEmailItem>(`/tracking/${trackingId}`),
};

// ── Auth ────────────────────────────────────────────────────

export const authApi = {
  logout: () =>
    fetch(`${WORKER_URL}/auth/logout`, { method: 'POST', credentials: 'include' }),
  switchAccount: (linkedAccountId: string) =>
    fetch(`${WORKER_URL}/auth/switch-account`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedAccountId }),
    }).then((r) => r.json() as Promise<{ ok: boolean; activeAccountId: string }>),
  removeAccount: (accountId: string) =>
    fetch(`${WORKER_URL}/auth/accounts/${accountId}`, { method: 'DELETE', credentials: 'include' })
      .then((r) => r.json() as Promise<{ ok: boolean }>),
};

export { ApiError };
