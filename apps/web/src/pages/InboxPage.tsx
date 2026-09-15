import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Search, X, Menu, Trash2, LoaderCircle } from 'lucide-react';
import Sidebar from '../components/layout/Sidebar';
import ThreadList from '../components/inbox/ThreadList';
import MessagePane from '../components/inbox/MessagePane';
import { useStore } from '../store';
import { threadsApi, labelsApi, searchApi } from '../services/api';
import { useKeyboard } from '../hooks/useKeyboard';
import type { GmailLabel, ParsedThread } from '../types/gmail';

// Maps URL path segments to Gmail label IDs
const PATH_TO_LABEL: Record<string, string> = {
  inbox:   'INBOX',
  starred: 'STARRED',
  drafts:  'DRAFT',
  sent:    'SENT',
  archive: 'ARCHIVE',
  spam:    'SPAM',
  trash:   'TRASH',
};

const threadCache = new Map<string, {
  threads: ParsedThread[];
  nextPageToken: string | null;
}>();

interface InboxPageProps {
  folder?: string; // passed from route
}

export default function InboxPage({ folder = 'inbox' }: InboxPageProps) {
  const { labelId } = useParams<{ labelId?: string }>();

  const {
    me,
    activeThreadId, setActiveThreadId,
    activeThread, setActiveThread,
    openCompose,
    searchQuery, setSearchQuery,
    sidebarOpen, setSidebarOpen,
    addToast,
  } = useStore((s) => ({
    me: s.me,
    activeThreadId: s.activeThreadId,
    setActiveThreadId: s.setActiveThreadId,
    activeThread: s.activeThread,
    setActiveThread: s.setActiveThread,
    openCompose: s.openCompose,
    searchQuery: s.searchQuery,
    setSearchQuery: s.setSearchQuery,
    sidebarOpen: s.sidebarOpen,
    setSidebarOpen: s.setSidebarOpen,
    addToast: s.addToast,
  }));

  const [threads, setThreads] = useState<ParsedThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [labelUnread, setLabelUnread] = useState<Record<string, number>>({});
  const [searchInput, setSearchInput] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const [deletingThreadIds, setDeletingThreadIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeIndex = threads.findIndex((t) => t.id === activeThreadId);

  // Resolve which Gmail label to fetch
  const gmailLabel = labelId ?? PATH_TO_LABEL[folder] ?? 'INBOX';
  const accountId = me?.activeAccount.id ?? '';
  const cacheKey = `${accountId}:${isSearchMode ? `search:${searchQuery}` : `label:${gmailLabel}`}`;

  // Load labels once for sidebar unread counts
  useEffect(() => {
    labelsApi.list().then(({ labels: list }) => {
      setLabels(list);
      const unread: Record<string, number> = {};
      list.forEach((l) => {
        if (l.threadsUnread) unread[l.id] = l.threadsUnread;
      });
      setLabelUnread(unread);
    }).catch(() => {});
  }, [me?.activeAccount.id]);

  // Load threads on label/folder change
  const loadThreads = useCallback(async (reset = true) => {
    const cached = reset ? threadCache.get(cacheKey) : undefined;
    if (cached) {
      setThreads(cached.threads);
      setNextPageToken(cached.nextPageToken);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const token = reset ? undefined : nextPageToken ?? undefined;
      const res = isSearchMode && searchQuery
        ? await searchApi.search(searchQuery, token)
        : await threadsApi.list({ label: gmailLabel, pageToken: token });

      setThreads((prev) => reset ? res.threads : [...prev, ...res.threads]);
      setNextPageToken(res.nextPageToken);

      if (reset) {
        threadCache.set(cacheKey, {
          threads: res.threads,
          nextPageToken: res.nextPageToken,
        });
      }

      if (reset) {
        setActiveThreadId(null);
        setActiveThread(null);
        setSelectedThreadIds([]);
      }
    } catch {
      addToast('Failed to load messages', 'error');
    } finally {
      setLoading(false);
    }
  }, [cacheKey, gmailLabel, isSearchMode, searchQuery, nextPageToken]);

  useEffect(() => {
    loadThreads(true);
  }, [gmailLabel, me?.activeAccount.id]);

  // Open thread and mark read
  const openThread = useCallback(async (thread: ParsedThread) => {
    setActiveThreadId(thread.id);
    setActiveThread(thread);

    if (thread.isUnread) {
      try {
        await threadsApi.markRead(thread.id);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === thread.id
              ? { ...t, isUnread: false, messages: t.messages.map((m) => ({ ...m, isUnread: false })) }
              : t
          )
        );
      } catch {
        // non-critical
      }
    }
  }, []);

  // Remove thread from list (after archive/trash)
  const dismissThread = useCallback(() => {
    setThreads((prev) => prev.filter((t) => t.id !== activeThreadId));
    setActiveThreadId(null);
    setActiveThread(null);
  }, [activeThreadId]);

  // Star toggle from thread list
  const handleStar = useCallback(async (threadId: string, starred: boolean) => {
    try {
      await (starred ? threadsApi.star(threadId) : threadsApi.unstar(threadId));
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, isStarred: starred } : t))
      );
    } catch {
      addToast('Failed to update star', 'error');
    }
  }, []);

  const handleTrash = useCallback(async (threadId: string) => {
    setDeletingThreadIds((ids) => [...ids, threadId]);
    try {
      await threadsApi.trash(threadId);
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      threadCache.delete(cacheKey);
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setActiveThread(null);
      }
      addToast('Moved to trash', 'success');
    } catch {
      addToast('Failed to move message to trash', 'error');
    } finally {
      setDeletingThreadIds((ids) => ids.filter((id) => id !== threadId));
    }
  }, [activeThreadId, cacheKey]);

  const handleBulkTrash = useCallback(async () => {
    if (selectedThreadIds.length === 0) return;
    const idsToDelete = [...selectedThreadIds];
    setBulkDeleting(true);
    setBulkDeleteProgress(0);
    const deletedIds: string[] = [];
    for (const [index, id] of idsToDelete.entries()) {
      try {
        await threadsApi.trash(id);
        deletedIds.push(id);
        setThreads((current) => current.filter((thread) => thread.id !== id));
      } catch {
        // Continue deleting the remaining selected conversations.
      } finally {
        setBulkDeleteProgress(index + 1);
      }
    }
    if (deletedIds.length > 0) threadCache.delete(cacheKey);
    setSelectedThreadIds([]);
    setBulkDeleting(false);
    addToast(
      deletedIds.length === idsToDelete.length
        ? `${deletedIds.length} conversations moved to trash`
        : `${deletedIds.length} deleted; ${idsToDelete.length - deletedIds.length} failed`,
      deletedIds.length === idsToDelete.length ? 'success' : 'error'
    );
  }, [cacheKey, selectedThreadIds]);

  // Search submit
  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setIsSearchMode(false);
      setSearchQuery('');
      loadThreads(true);
      return;
    }
    setIsSearchMode(true);
    setSearchQuery(q);
    setLoading(true);
    try {
      const res = await searchApi.search(q.trim());
      setThreads(res.threads);
      setNextPageToken(res.nextPageToken);
      setActiveThreadId(null);
      setActiveThread(null);
    } catch {
      addToast('Search failed', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Keyboard shortcuts
  useKeyboard({
    c: () => openCompose('new'),
    '/': () => searchInputRef.current?.focus(),
    j: () => {
      const next = Math.min(activeIndex + 1, threads.length - 1);
      if (threads[next]) openThread(threads[next]);
    },
    k: () => {
      const prev = Math.max(activeIndex - 1, 0);
      if (threads[prev]) openThread(threads[prev]);
    },
    o: () => { if (activeThread) setActiveThread(activeThread); },
    e: () => { if (activeThreadId) { threadsApi.archive(activeThreadId).then(dismissThread); } },
    s: () => {
      if (activeThread) handleStar(activeThread.id, !activeThread.isStarred);
    },
    Escape: () => { setActiveThreadId(null); setActiveThread(null); },
    'Shift+i': () => { if (activeThreadId) threadsApi.markRead(activeThreadId); },
    'Shift+u': () => { if (activeThreadId) threadsApi.markUnread(activeThreadId); },
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <Sidebar labels={labels} labelUnread={labelUnread} />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0 bg-card">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Search bar */}
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch(searchInput);
                if (e.key === 'Escape') {
                  setSearchInput('');
                  setIsSearchMode(false);
                  setSearchQuery('');
                  loadThreads(true);
                  searchInputRef.current?.blur();
                }
              }}
              placeholder="Search mail"
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-muted/50 border border-transparent focus:border-border focus:bg-background text-sm outline-none transition-colors placeholder:text-muted-foreground"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  setIsSearchMode(false);
                  setSearchQuery('');
                  loadThreads(true);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>

        {/* Thread list + message pane */}
        <div className="flex-1 flex min-h-0">
          {/* Thread list panel */}
          <div className={`flex flex-col border-r border-border ${activeThread ? 'w-80 shrink-0' : 'flex-1'}`}>
            {/* Folder title */}
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  checked={threads.length > 0 && selectedThreadIds.length === threads.length}
                  onChange={(event) => setSelectedThreadIds(event.target.checked ? threads.map((thread) => thread.id) : [])}
                  aria-label="Select all conversations"
                  className="h-3.5 w-3.5 accent-primary"
                />
                <h1 className="text-sm font-semibold text-foreground capitalize truncate">
                  {isSearchMode ? `Results for "${searchQuery}"` : folder}
                </h1>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {selectedThreadIds.length > 0 && (
                  <button
                    onClick={handleBulkTrash}
                    disabled={bulkDeleting}
                    title="Move selected conversations to trash"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    {bulkDeleting ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    {bulkDeleting ? `Deleting ${bulkDeleteProgress}/${selectedThreadIds.length}` : `Delete ${selectedThreadIds.length}`}
                  </button>
                )}
                {loading && <LoaderCircle className="w-3.5 h-3.5 animate-spin text-primary" />}
              </div>
            </div>

            <ThreadList
              threads={threads}
              activeThreadId={activeThreadId}
              onSelect={openThread}
              onStar={handleStar}
              onTrash={handleTrash}
              selectedIds={selectedThreadIds}
              onToggleSelect={(threadId) => setSelectedThreadIds((ids) => ids.includes(threadId) ? ids.filter((id) => id !== threadId) : [...ids, threadId])}
              deletingIds={deletingThreadIds}
              loading={loading}
            />

            {/* Load more */}
            {nextPageToken && !loading && (
              <button
                onClick={() => loadThreads(false)}
                className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground border-t border-border transition-colors"
              >
                Load more
              </button>
            )}
          </div>

          {/* Message pane */}
          {activeThread && (
            <MessagePane
              thread={activeThread}
              onArchive={dismissThread}
              onTrash={dismissThread}
              onClose={() => { setActiveThreadId(null); setActiveThread(null); }}
              onRefresh={() => loadThreads(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
