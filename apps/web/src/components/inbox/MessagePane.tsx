import { useState } from 'react';
import DOMPurify from 'dompurify';
import {
  Archive, Trash2, Reply, ReplyAll, Forward,
  Star, Paperclip, ChevronDown, ChevronUp, ExternalLink, X
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatFullDate, extractDisplayName, formatFileSize, getInitials } from '../../utils/format';
import { useStore } from '../../store';
import { threadsApi, WORKER_URL } from '../../services/api';
import type { ParsedThread, ParsedMessage } from '../../types/gmail';

interface MessagePaneProps {
  thread: ParsedThread | null;
  loading?: boolean;
  onArchive: () => void;
  onTrash: () => void;
  onClose: () => void;
  onRefresh: () => void;
}

export default function MessagePane({ thread, loading = false, onArchive, onTrash, onClose, onRefresh }: MessagePaneProps) {
  const { openCompose, addToast } = useStore((s) => ({
    openCompose: s.openCompose,
    addToast: s.addToast,
  }));

  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Select a conversation</p>
          <p className="text-xs text-muted-foreground/60 mt-1">or press C to compose</p>
        </div>
      </div>
    );
  }

  async function handleArchive() {
    try {
      await threadsApi.archive(thread!.id);
      onArchive();
      addToast('Archived', 'success');
    } catch {
      addToast('Failed to archive', 'error');
    }
  }

  async function handleTrash() {
    try {
      await threadsApi.trash(thread!.id);
      onTrash();
      addToast('Moved to trash', 'success');
    } catch {
      addToast('Failed to trash', 'error');
    }
  }

  async function handleStar() {
    try {
      if (thread!.isStarred) {
        await threadsApi.unstar(thread!.id);
      } else {
        await threadsApi.star(thread!.id);
      }
      onRefresh();
    } catch {
      addToast('Failed to update star', 'error');
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground truncate max-w-lg">
            {thread.subject || '(no subject)'}
          </h2>
          {thread.messageCount > 1 && (
            <span className="text-sm text-muted-foreground">({thread.messageCount})</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ActionButton onClick={handleStar} title={thread.isStarred ? 'Unstar' : 'Star'}>
            <Star className={cn('w-4 h-4', thread.isStarred ? 'fill-amber-400 text-amber-400' : '')} />
          </ActionButton>
          <ActionButton onClick={handleArchive} title="Archive">
            <Archive className="w-4 h-4" />
          </ActionButton>
          <ActionButton onClick={handleTrash} title="Trash">
            <Trash2 className="w-4 h-4" />
          </ActionButton>
          <ActionButton onClick={() => openCompose('reply', thread)} title="Reply">
            <Reply className="w-4 h-4" />
          </ActionButton>
          <ActionButton onClick={() => openCompose('replyAll', thread)} title="Reply all">
            <ReplyAll className="w-4 h-4" />
          </ActionButton>
          <ActionButton onClick={() => openCompose('forward', thread)} title="Forward">
            <Forward className="w-4 h-4" />
          </ActionButton>
          <div className="w-px h-4 bg-border mx-1" />
          <ActionButton onClick={onClose} title="Close">
            <X className="w-4 h-4" />
          </ActionButton>
        </div>
      </div>

      {/* Messages */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading conversation...
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {thread.messages.map((msg, i) => (
          <MessageCard
            key={msg.id}
            message={msg}
            defaultExpanded={i === thread.messages.length - 1}
            onReply={() => openCompose('reply', thread)}
            onReplyAll={() => openCompose('replyAll', thread)}
            onForward={() => openCompose('forward', thread)}
          />
        ))}
      </div>
      )}
    </div>
  );
}

function ActionButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {children}
    </button>
  );
}

interface MessageCardProps {
  message: ParsedMessage;
  defaultExpanded: boolean;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
}

function MessageCard({ message, defaultExpanded, onReply, onReplyAll, onForward }: MessageCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const senderName = extractDisplayName(message.from);
  const initials = getInitials(senderName);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Message header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start gap-3 p-4 hover:bg-accent/30 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-sm font-medium text-foreground">{senderName}</span>
            <div className="flex items-center gap-1.5">
              {message.attachments.length > 0 && (
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">{formatFullDate(message.date)}</span>
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
          {!expanded && (
            <p className="text-xs text-muted-foreground truncate">{message.snippet}</p>
          )}
          {expanded && (
            <p className="text-xs text-muted-foreground">
              to {message.to.map(extractDisplayName).join(', ')}
              {message.cc.length > 0 && `, cc ${message.cc.map(extractDisplayName).join(', ')}`}
            </p>
          )}
        </div>
      </button>

      {/* Message body */}
      {expanded && (
        <div className="border-t border-border">
          <div className="px-4 py-4">
            {message.htmlBody ? (
              <EmailBody html={message.htmlBody} />
            ) : (
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">
                {message.plainBody ?? '(empty)'}
              </pre>
            )}
          </div>

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div className="px-4 pb-4 flex flex-wrap gap-2">
              {message.attachments.map((att) => (
                <a
                  key={att.id}
                  href={`${WORKER_URL}/api/messages/${message.id}/attachment/${att.attachmentId}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40 text-xs hover:bg-accent transition-colors"
                  download={att.filename}
                >
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground truncate max-w-[160px]">{att.filename}</p>
                    <p className="text-muted-foreground">{formatFileSize(att.size)}</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-muted-foreground ml-1" />
                </a>
              ))}
            </div>
          )}

          {/* Quick reply actions */}
          <div className="px-4 pb-4 flex items-center gap-2">
            <button
              onClick={onReply}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors"
            >
              <Reply className="w-3.5 h-3.5" />
              Reply
            </button>
            <button
              onClick={onReplyAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors"
            >
              <ReplyAll className="w-3.5 h-3.5" />
              Reply all
            </button>
            <button
              onClick={onForward}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors"
            >
              <Forward className="w-3.5 h-3.5" />
              Forward
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Renders sanitized email HTML in an isolated container.
 * DOMPurify runs client-side as an additional layer
 * (server-side sanitize-html already cleaned it).
 */
function EmailBody({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, {
    FORCE_BODY: true,
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    WHOLE_DOCUMENT: false,
  });

  return (
    <div
      className="prose prose-sm max-w-none text-foreground dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
