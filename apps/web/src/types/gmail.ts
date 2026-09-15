export interface GmailLabel {
  id: string;
  name: string;
  type?: 'system' | 'user';
  messagesUnread?: number;
  threadsUnread?: number;
  color?: { textColor?: string; backgroundColor?: string };
}

export interface ParsedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
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
  detailsLoaded?: boolean;
}

export interface GmailSendRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  plainBody?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: string }>;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}
