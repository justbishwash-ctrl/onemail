export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string; // base64url encoded
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  sizeEstimate?: number;
  raw?: string;
}

export interface GmailThread {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
  snippet?: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  messageListVisibility?: string;
  labelListVisibility?: string;
  type?: 'system' | 'user';
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
  color?: {
    textColor?: string;
    backgroundColor?: string;
  };
}

export interface GmailListThreadsResponse {
  threads?: Array<{ id: string; snippet?: string; historyId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GmailListMessagesResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GmailSendRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  plainBody?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    data: string; // base64
  }>;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export interface GmailDraftRequest {
  message: GmailSendRequest;
  id?: string; // existing draft ID for updates
}

export interface ParsedMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  date: string;
  htmlBody: string | null;
  plainBody: string | null;
  attachments: ParsedAttachment[];
  isUnread: boolean;
  isStarred: boolean;
  internalDate: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
}

export interface ParsedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface ParsedThread {
  id: string;
  snippet: string;
  messages: ParsedMessage[];
  subject: string;
  participants: string[];
  lastDate: string;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  messageCount: number;
}
