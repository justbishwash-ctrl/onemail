/**
 * Gmail API client.
 * All calls go through this module — never call Gmail directly from routes.
 */

import type {
  GmailMessage,
  GmailThread,
  GmailLabel,
  GmailListThreadsResponse,
  GmailListMessagesResponse,
  GmailSendRequest,
  ParsedMessage,
  ParsedThread,
  ParsedAttachment,
} from '../../types/gmail.ts';
import { buildMimeMessage } from './mime.ts';
import { sanitizeHtml } from './sanitize.ts';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailFetch<T>(
  accessToken: string,
  path: string,
  options?: RequestInit
): Promise<T> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${GMAIL_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });
    if (res.ok || ![429, 500, 502, 503, 504].includes(res.status) || attempt >= 2) break;
    const retryAfter = Number(res.headers.get('Retry-After'));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 250 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new GmailAuthError(`Gmail 401: ${body}`);
    if (res.status === 429) throw new GmailRateLimitError(`Gmail rate limit: ${body}`);
    throw new GmailApiError(`Gmail API error ${res.status}: ${body}`, res.status);
  }

  // 204 No Content
  if (res.status === 204) return {} as T;
  return res.json<T>();
}

// ── Profile ────────────────────────────────────────────────

export async function getProfile(accessToken: string): Promise<{ emailAddress: string; messagesTotal: number; threadsTotal: number }> {
  return gmailFetch(accessToken, '/profile');
}

// ── Labels ─────────────────────────────────────────────────

export async function listLabels(accessToken: string): Promise<GmailLabel[]> {
  const data = await gmailFetch<{ labels: GmailLabel[] }>(accessToken, '/labels');
  return data.labels ?? [];
}

export async function createLabel(
  accessToken: string,
  name: string,
  color?: { textColor: string; backgroundColor: string }
): Promise<GmailLabel> {
  return gmailFetch(accessToken, '/labels', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  });
}

// ── Threads ────────────────────────────────────────────────

export async function listThreads(
  accessToken: string,
  params: {
    labelIds?: string[];
    q?: string;
    maxResults?: number;
    pageToken?: string;
  }
): Promise<GmailListThreadsResponse> {
  const qs = new URLSearchParams();
  if (params.labelIds?.length) params.labelIds.forEach((l) => qs.append('labelIds', l));
  if (params.q) qs.set('q', params.q);
  if (params.maxResults) qs.set('maxResults', String(params.maxResults));
  if (params.pageToken) qs.set('pageToken', params.pageToken);

  return gmailFetch(accessToken, `/threads?${qs.toString()}`);
}

export async function getThread(
  accessToken: string,
  threadId: string,
  format: 'full' | 'metadata' = 'full'
): Promise<GmailThread> {
  const qs = new URLSearchParams({ format });
  if (format === 'metadata') {
    for (const header of ['Subject', 'From', 'To', 'Cc', 'Date']) {
      qs.append('metadataHeaders', header);
    }
  }
  return gmailFetch(accessToken, `/threads/${encodeURIComponent(threadId)}?${qs.toString()}`);
}

export async function modifyThread(
  accessToken: string,
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  await gmailFetch(accessToken, `/threads/${encodeURIComponent(threadId)}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

export async function trashThread(accessToken: string, threadId: string): Promise<void> {
  await gmailFetch(accessToken, `/threads/${encodeURIComponent(threadId)}/trash`, {
    method: 'POST',
    body: '{}',
  });
}

export async function deleteThread(accessToken: string, threadId: string): Promise<void> {
  await gmailFetch(accessToken, `/threads/${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
  });
}

export async function untrashThread(accessToken: string, threadId: string): Promise<void> {
  await gmailFetch(accessToken, `/threads/${encodeURIComponent(threadId)}/untrash`, {
    method: 'POST',
    body: '{}',
  });
}

// ── Messages ───────────────────────────────────────────────

export async function getMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
  return gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}?format=full`);
}

export async function listMessages(
  accessToken: string,
  params: { labelIds?: string[]; q?: string; maxResults?: number; pageToken?: string }
): Promise<GmailListMessagesResponse> {
  const qs = new URLSearchParams();
  if (params.labelIds?.length) params.labelIds.forEach((l) => qs.append('labelIds', l));
  if (params.q) qs.set('q', params.q);
  if (params.maxResults) qs.set('maxResults', String(params.maxResults));
  if (params.pageToken) qs.set('pageToken', params.pageToken);

  return gmailFetch(accessToken, `/messages?${qs.toString()}`);
}

export async function modifyMessage(
  accessToken: string,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

export async function trashMessage(accessToken: string, messageId: string): Promise<void> {
  await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}/trash`, {
    method: 'POST',
    body: '{}',
  });
}

export async function untrashMessage(accessToken: string, messageId: string): Promise<void> {
  await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}/untrash`, {
    method: 'POST',
    body: '{}',
  });
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<{ size: number; data: string }> {
  return gmailFetch(
    accessToken,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
  );
}

// ── Send ───────────────────────────────────────────────────

export async function sendMessage(
  accessToken: string,
  request: GmailSendRequest,
  trackingPixelUrl?: string
): Promise<GmailMessage> {
  const raw = await buildMimeMessage(request, trackingPixelUrl);
  return gmailFetch(accessToken, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      raw,
      ...(request.threadId ? { threadId: request.threadId } : {}),
    }),
  });
}

// ── Drafts ─────────────────────────────────────────────────

export async function createDraft(
  accessToken: string,
  request: GmailSendRequest
): Promise<{ id: string; message: GmailMessage }> {
  const raw = await buildMimeMessage(request);
  return gmailFetch(accessToken, '/drafts', {
    method: 'POST',
    body: JSON.stringify({ message: { raw } }),
  });
}

export async function updateDraft(
  accessToken: string,
  draftId: string,
  request: GmailSendRequest
): Promise<{ id: string; message: GmailMessage }> {
  const raw = await buildMimeMessage(request);
  return gmailFetch(accessToken, `/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PUT',
    body: JSON.stringify({ message: { raw } }),
  });
}

export async function deleteDraft(accessToken: string, draftId: string): Promise<void> {
  await gmailFetch(accessToken, `/drafts/${encodeURIComponent(draftId)}`, {
    method: 'DELETE',
  });
}

export async function listDrafts(
  accessToken: string,
  maxResults = 20,
  pageToken?: string
): Promise<{ drafts?: Array<{ id: string; message: { id: string; threadId: string } }>; nextPageToken?: string }> {
  const qs = new URLSearchParams({ maxResults: String(maxResults) });
  if (pageToken) qs.set('pageToken', pageToken);
  return gmailFetch(accessToken, `/drafts?${qs.toString()}`);
}

export async function sendDraft(accessToken: string, draftId: string): Promise<GmailMessage> {
  return gmailFetch(accessToken, '/drafts/send', {
    method: 'POST',
    body: JSON.stringify({ id: draftId }),
  });
}

// ── Search ─────────────────────────────────────────────────

export async function searchThreads(
  accessToken: string,
  query: string,
  maxResults = 20,
  pageToken?: string
): Promise<GmailListThreadsResponse> {
  return listThreads(accessToken, { q: query, maxResults, pageToken });
}

// ── Parsing helpers ────────────────────────────────────────

export function parseMessage(raw: GmailMessage): ParsedMessage {
  const headers = raw.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  const { html, plain, attachments } = extractParts(raw.payload);

  return {
    id: raw.id,
    threadId: raw.threadId,
    labelIds: raw.labelIds ?? [],
    snippet: raw.snippet ?? '',
    subject: getHeader('Subject'),
    from: getHeader('From'),
    to: getHeader('To')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    cc: getHeader('Cc')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    date: getHeader('Date'),
    htmlBody: html ? sanitizeHtml(html) : null,
    plainBody: plain,
    attachments,
    isUnread: (raw.labelIds ?? []).includes('UNREAD'),
    isStarred: (raw.labelIds ?? []).includes('STARRED'),
    internalDate: raw.internalDate ? parseInt(raw.internalDate, 10) : 0,
    messageId: getHeader('Message-ID') || null,
    inReplyTo: getHeader('In-Reply-To') || null,
    references: getHeader('References') || null,
  };
}

export function parseThread(raw: GmailThread, detailsLoaded = true): ParsedThread {
  const messages = (raw.messages ?? []).map(parseMessage);
  const last = messages[messages.length - 1];

  const participantSet = new Set<string>();
  messages.forEach((m) => {
    if (m.from) participantSet.add(m.from);
    m.to.forEach((t) => participantSet.add(t));
  });

  return {
    id: raw.id,
    snippet: raw.snippet ?? last?.snippet ?? '',
    messages,
    subject: last?.subject ?? '(no subject)',
    participants: Array.from(participantSet),
    lastDate: last?.date ?? '',
    isUnread: messages.some((m) => m.isUnread),
    isStarred: messages.some((m) => m.isStarred),
    hasAttachments: messages.some((m) => m.attachments.length > 0),
    messageCount: messages.length,
    detailsLoaded,
  };
}

function extractParts(
  part?: GmailMessage['payload']
): { html: string | null; plain: string | null; attachments: ParsedAttachment[] } {
  if (!part) return { html: null, plain: null, attachments: [] };

  let html: string | null = null;
  let plain: string | null = null;
  const attachments: ParsedAttachment[] = [];

  function walk(p: NonNullable<typeof part>): void {
    const mime = p.mimeType ?? '';

    if (p.filename && p.body?.attachmentId) {
      attachments.push({
        id: p.partId ?? generatePartId(),
        filename: p.filename,
        mimeType: mime,
        size: p.body.size ?? 0,
        attachmentId: p.body.attachmentId,
      });
      return;
    }

    if (mime === 'text/html' && p.body?.data) {
      html = decodeBase64Url(p.body.data);
    } else if (mime === 'text/plain' && p.body?.data) {
      plain = decodeBase64Url(p.body.data);
    }

    if (p.parts) {
      p.parts.forEach(walk);
    }
  }

  walk(part);
  return { html, plain, attachments };
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
  try {
    return decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
  } catch {
    return atob(padded);
  }
}

let _partCounter = 0;
function generatePartId(): string {
  return `part_${++_partCounter}`;
}

// ── Errors ─────────────────────────────────────────────────

export class GmailApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GmailApiError';
    this.status = status;
  }
}

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailAuthError';
  }
}

export class GmailRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailRateLimitError';
  }
}
