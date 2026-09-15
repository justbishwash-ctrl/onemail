import { Star, Paperclip, Trash2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import {
  formatEmailDate,
  extractDisplayName,
  getInitials,
  truncate,
} from '../../utils/format';
import type { ParsedThread } from '../../types/gmail';

interface ThreadListProps {
  threads: ParsedThread[];
  activeThreadId: string | null;
  onSelect: (thread: ParsedThread) => void;
  onStar: (threadId: string, starred: boolean) => void;
  onTrash: (threadId: string) => void;
  loading?: boolean;
}

export default function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  onStar,
  onTrash,
  loading,
}: ThreadListProps) {
  if (loading && threads.length === 0) {
    return (
      <div className="flex-1 space-y-0.5 p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <ThreadSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!loading && threads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No messages here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {threads.map((thread) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          isActive={thread.id === activeThreadId}
          onSelect={onSelect}
          onStar={onStar}
          onTrash={onTrash}
        />
      ))}
    </div>
  );
}

interface ThreadRowProps {
  thread: ParsedThread;
  isActive: boolean;
  onSelect: (thread: ParsedThread) => void;
  onStar: (threadId: string, starred: boolean) => void;
  onTrash: (threadId: string) => void;
}

function ThreadRow({ thread, isActive, onSelect, onStar, onTrash }: ThreadRowProps) {
  const lastMessage = thread.messages[thread.messages.length - 1];
  const senderName = extractDisplayName(lastMessage?.from ?? '');
  const initials = getInitials(senderName);

  return (
    <button
      onClick={() => onSelect(thread)}
      className={cn(
        'thread-row w-full flex items-start gap-3 px-4 py-3 border-b border-border/50 text-left group hover:bg-accent/50',
        isActive && 'bg-accent',
        thread.isUnread && !isActive && 'bg-background'
      )}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0 mt-0.5">
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {thread.isUnread && (
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            )}
            <span
              className={cn(
                'text-sm truncate',
                thread.isUnread ? 'font-semibold text-foreground' : 'text-foreground/80'
              )}
            >
              {senderName}
            </span>
            {thread.messageCount > 1 && (
              <span className="text-xs text-muted-foreground shrink-0">
                ({thread.messageCount})
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {thread.hasAttachments && (
              <Paperclip className="w-3 h-3 text-muted-foreground" />
            )}
            <span className="text-[11px] text-muted-foreground">
              {formatEmailDate(lastMessage?.date ?? thread.lastDate)}
            </span>
          </div>
        </div>

        <p
          className={cn(
            'text-sm truncate mb-0.5',
            thread.isUnread ? 'font-medium text-foreground' : 'text-foreground/70'
          )}
        >
          {thread.subject || '(no subject)'}
        </p>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground truncate">
            {truncate(thread.snippet, 80)}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStar(thread.id, !thread.isStarred);
            }}
            className={cn(
              'ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity',
              thread.isStarred && 'opacity-100'
            )}
          >
            <Star
              className={cn(
                'w-3.5 h-3.5',
                thread.isStarred
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-muted-foreground hover:text-amber-400'
              )}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTrash(thread.id);
            }}
            title="Move to trash"
            aria-label={`Move ${thread.subject || 'conversation'} to trash`}
            className="ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </button>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/50">
      <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between">
          <div className="h-3.5 bg-muted rounded animate-pulse w-28" />
          <div className="h-3 bg-muted rounded animate-pulse w-12" />
        </div>
        <div className="h-3.5 bg-muted rounded animate-pulse w-48" />
        <div className="h-3 bg-muted rounded animate-pulse w-full" />
      </div>
    </div>
  );
}
