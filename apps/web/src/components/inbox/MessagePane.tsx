import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  Archive, Trash2, Reply, ReplyAll, Forward,
  Star, Paperclip, ChevronDown, ChevronUp, Download, Printer, X, Copy, Check, BadgeCheck,
  FileText, Image, Video, Music, Loader2
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatFullDate, extractDisplayName, extractEmailAddress, formatFileSize, getInitials, isVerifiedGovernmentSender } from '../../utils/format';
import { useStore } from '../../store';
import { messagesApi, threadsApi } from '../../services/api';
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

function ActionButton({ onClick, title, children, disabled = false }: { onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:pointer-events-none disabled:opacity-40"
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
  const senderEmail = extractEmailAddress(message.from);
  const verifiedSender = isVerifiedGovernmentSender(message.from);
  const recipientEmails = message.to.map(extractEmailAddress).join('; ');
  const initials = getInitials(senderName);
  const [copiedAddress, setCopiedAddress] = useState<'from' | 'to' | null>(null);

  function copyAddress(value: string, type: 'from' | 'to') {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedAddress(type);
      window.setTimeout(() => setCopiedAddress(null), 1500);
    });
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Message header */}
      <div
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') setExpanded((e) => !e);
        }}
        role="button"
        tabIndex={0}
        className="w-full flex items-start gap-3 p-4 hover:bg-accent/30 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-0.5">
            <div className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                {senderName}
                {verifiedSender && (
                  <span title="Verified .gov.np sender" className="shrink-0">
                    <BadgeCheck className="w-3.5 h-3.5 text-sky-500" />
                  </span>
                )}
              </span>
              <div className="space-y-0.5 text-xs text-muted-foreground">
                <div className="flex min-w-0 items-start gap-1">
                  <span className="shrink-0 font-medium text-foreground/70">From:</span>
                  <span className="min-w-0 break-words">{senderEmail}</span>
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); copyAddress(senderEmail, 'from'); }}
                    title="Copy sender email"
                    aria-label="Copy sender email"
                    className="shrink-0 rounded p-0.5 hover:bg-accent hover:text-foreground"
                  >
                    {copiedAddress === 'from' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <div className="flex min-w-0 items-start gap-1">
                  <span className="shrink-0 font-medium text-foreground/70">To:</span>
                  <span className="min-w-0 break-words">{recipientEmails}</span>
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); copyAddress(recipientEmails, 'to'); }}
                    title="Copy recipient email"
                    aria-label="Copy recipient email"
                    className="shrink-0 rounded p-0.5 hover:bg-accent hover:text-foreground"
                  >
                    {copiedAddress === 'to' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            </div>
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
          {expanded && message.cc.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">cc:</span>{' '}
              {message.cc.map(extractDisplayName).join('; ')}
            </p>
          )}
        </div>
      </div>

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
                <AttachmentButton
                  key={att.id}
                  messageId={message.id}
                  attachment={att}
                />
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

function AttachmentButton({
  messageId,
  attachment,
}: {
  messageId: string;
  attachment: ParsedMessage['attachments'][number];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40 text-xs hover:bg-accent transition-colors text-left"
        title={`Open ${attachment.filename}`}
      >
        <AttachmentIcon mimeType={attachment.mimeType} />
        <div>
          <p className="font-medium text-foreground truncate max-w-[160px]">{attachment.filename}</p>
          <p className="text-muted-foreground">{formatFileSize(attachment.size)}</p>
        </div>
      </button>
      {open && (
        <AttachmentViewer
          messageId={messageId}
          attachment={attachment}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AttachmentViewer({
  messageId,
  attachment,
  onClose,
}: {
  messageId: string;
  attachment: ParsedMessage['attachments'][number];
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const url = messagesApi.getAttachmentUrl(
    messageId,
    attachment.attachmentId,
    attachment.mimeType,
    attachment.filename
  );

  const previewType = getPreviewType(attachment.mimeType);
  const printable = previewType === 'image' || previewType === 'pdf' || previewType === 'text';

  function download() {
    messagesApi.getAttachment(messageId, attachment.attachmentId, attachment.mimeType, attachment.filename)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = attachment.filename;
        link.click();
        URL.revokeObjectURL(objectUrl);
      });
  }

      const [loaded, setLoaded] = useState(previewType === 'unsupported');
      const [loadError, setLoadError] = useState(false);
  function print() {
    if (!printable) return;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    const content = previewType === 'image'
      ? `<img src="${url}" style="max-width:100%;max-height:100vh;object-fit:contain" />`
      : previewType === 'pdf'
        ? `<iframe src="${url}" style="width:100%;height:100vh;border:0"></iframe>`
        : `<iframe src="${url}" style="width:100%;height:100vh;border:0"></iframe>`;
    printWindow.document.write(`<title>${escapeHtml(attachment.filename)}</title>${content}`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.addEventListener('load', () => printWindow.print(), { once: true });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={attachment.filename}>
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <AttachmentIcon mimeType={attachment.mimeType} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{attachment.filename}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ActionButton onClick={download} title="Download">
              <Download className="w-4 h-4" />
            </ActionButton>
            {printable && (
              <ActionButton onClick={print} title="Print">
                <Printer className="w-4 h-4" />
              </ActionButton>
            )}
            <ActionButton onClick={onClose} title="Close">
              <X className="w-4 h-4" />
            </ActionButton>
          </div>
        </div>
        <div className="relative flex min-h-[280px] flex-1 items-center justify-center overflow-auto bg-muted/20 p-4">
          {!loaded && !loadError && <Loader2 className="absolute h-7 w-7 animate-spin text-muted-foreground" />}
          {loadError && <p className="text-sm text-destructive">This attachment could not be previewed. Use download instead.</p>}
          {previewType === 'image' && !loadError && <img src={url} alt={attachment.filename} onLoad={() => setLoaded(true)} onError={() => setLoadError(true)} className={cn('max-h-[70vh] max-w-full object-contain', !loaded && 'invisible')} />}
          {previewType === 'pdf' && !loadError && <iframe src={url} title={attachment.filename} onLoad={() => setLoaded(true)} className={cn('h-[70vh] w-full', !loaded && 'invisible')} />}
          {previewType === 'video' && !loadError && <video src={url} controls onLoadedData={() => setLoaded(true)} onError={() => setLoadError(true)} className={cn('max-h-[70vh] max-w-full', !loaded && 'invisible')} />}
          {previewType === 'audio' && !loadError && <audio src={url} controls onLoadedData={() => setLoaded(true)} onError={() => setLoadError(true)} className={cn('w-full max-w-lg', !loaded && 'invisible')} />}
          {previewType === 'text' && !loadError && <iframe src={url} title={attachment.filename} onLoad={() => setLoaded(true)} className={cn('h-[70vh] w-full bg-background', !loaded && 'invisible')} />}
          {previewType === 'unsupported' && (
            <div className="text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Preview is unavailable for this file type.</p>
              <button type="button" onClick={download} className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">Download file</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <Image className="h-3.5 w-3.5 text-muted-foreground" />;
  if (mimeType.startsWith('video/')) return <Video className="h-3.5 w-3.5 text-muted-foreground" />;
  if (mimeType.startsWith('audio/')) return <Music className="h-3.5 w-3.5 text-muted-foreground" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

function getPreviewType(mimeType: string): 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'unsupported' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/')) return 'text';
  return 'unsupported';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
