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
const THREAD_PAGE_SIZE = 15;

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [labelUnread, setLabelUnread] = useState<Record<string, number>>({});
  const [searchInput, setSearchInput] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const [deletingThreadIds, setDeletingThreadIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState(0);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadingMoreRef = useRef(false);
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
    if (!reset && loadingMoreRef.current) return;
    if (!reset) loadingMoreRef.current = true;
    setLoadError(null);
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
        ? await searchApi.search(searchQuery, token, THREAD_PAGE_SIZE)
        : await threadsApi.list({ label: gmailLabel, pageToken: token, maxResults: THREAD_PAGE_SIZE });

      const combinedThreads = reset ? res.threads : [...threads, ...res.threads];
      setThreads(combinedThreads);
      setNextPageToken(res.nextPageToken);

      threadCache.set(cacheKey, {
          threads: combinedThreads,
          nextPageToken: res.nextPageToken,
      });

      if (reset) {
        setActiveThreadId(null);
        setActiveThread(null);
        setSelectedThreadIds([]);
      }
    } catch {
      if (reset || threads.length === 0) setLoadError('Failed to load messages');
      addToast('Failed to load messages', 'error');
    } finally {
      setLoading(false);
      if (!reset) loadingMoreRef.current = false;
    }
  }, [cacheKey, gmailLabel, isSearchMode, searchQuery, nextPageToken, threads]);

  useEffect(() => {
    loadThreads(true);
  }, [gmailLabel, me?.activeAccount.id]);

  // Open thread and mark read
  const openThread = useCallback(async (thread: ParsedThread) => {
    setActiveThreadId(thread.id);
    setActiveThread(thread);
    if (thread.detailsLoaded) {
      setThreadLoading(false);
      return;
    }
    setThreadLoading(true);

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

    try {
      const fullThread = await threadsApi.get(thread.id);
      setActiveThread(fullThread);
      setThreads((current) => current.map((item) => item.id === thread.id ? fullThread : item));
      const cached = threadCache.get(cacheKey);
      if (cached) {
        threadCache.set(cacheKey, {
          ...cached,
          threads: cached.threads.map((item) => item.id === thread.id ? fullThread : item),
        });
      }
    } catch {
      addToast('Failed to load conversation', 'error');
    } finally {
      setThreadLoading(false);
    }
  }, [cacheKey]);

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
      const permanentlyDelete = gmailLabel === 'TRASH';
      await (permanentlyDelete ? threadsApi.delete(threadId) : threadsApi.trash(threadId));
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      threadCache.delete(cacheKey);
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setActiveThread(null);
      }
      addToast(permanentlyDelete ? 'Deleted permanently' : 'Moved to trash', 'success');
    } catch {
      addToast(gmailLabel === 'TRASH' ? 'Failed to permanently delete message' : 'Failed to move message to trash', 'error');
    } finally {
      setDeletingThreadIds((ids) => ids.filter((id) => id !== threadId));
    }
  }, [activeThreadId, cacheKey]);

  const handleBulkTrash = useCallback(async () => {
    if (selectedThreadIds.length === 0) return;
    const idsToDelete = [...selectedThreadIds];

    setBulkDeleteConfirmOpen(false);
    setBulkDeleting(true);
    setBulkDeleteProgress(0);
    const deletedIds: string[] = [];
    for (const [index, id] of idsToDelete.entries()) {
      try {
        await (gmailLabel === 'TRASH' ? threadsApi.delete(id) : threadsApi.trash(id));
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
        ? gmailLabel === 'TRASH'
          ? `${deletedIds.length} conversations deleted permanently`
          : `${deletedIds.length} conversations moved to trash`
        : `${deletedIds.length} deleted; ${idsToDelete.length - deletedIds.length} failed`,
      deletedIds.length === idsToDelete.length ? 'success' : 'error'
    );
  }, [cacheKey, gmailLabel, selectedThreadIds]);

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
    Escape: () => {
      if (bulkDeleteConfirmOpen) setBulkDeleteConfirmOpen(false);
      else { setActiveThreadId(null); setActiveThread(null); }
    },
    Delete: () => { if (selectedThreadIds.length > 0 && !bulkDeleting) setBulkDeleteConfirmOpen(true); },
    'Shift+i': () => { if (activeThreadId) threadsApi.markRead(activeThreadId); },
    'Shift+u': () => { if (activeThreadId) threadsApi.markUnread(activeThreadId); },
  });

  const selectedEmailLabel = `${selectedThreadIds.length} email${selectedThreadIds.length === 1 ? '' : 's'}`;

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
                    title="Delete selected emails"
                    className="flex items-center gap-1.5 rounded-md border border-destructive/60 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
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
              error={loadError}
              onRetry={() => loadThreads(true)}
              selectedIds={selectedThreadIds}
              onToggleSelect={(threadId) => setSelectedThreadIds((ids) => ids.includes(threadId) ? ids.filter((id) => id !== threadId) : [...ids, threadId])}
              deletingIds={deletingThreadIds}
              loading={loading}
              onLoadMore={() => loadThreads(false)}
              hasMore={Boolean(nextPageToken)}
            />
          </div>

          {/* Message pane */}
          {activeThread && (
            <MessagePane
              thread={activeThread}
              loading={threadLoading}
              onArchive={dismissThread}
              onTrash={dismissThread}
              onClose={() => { setActiveThreadId(null); setActiveThread(null); }}
              onRefresh={() => loadThreads(true)}
            />
          )}
        </div>
      </div>

      {bulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 id="bulk-delete-title" className="text-base font-semibold text-foreground">Delete {selectedEmailLabel}?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Do you want to delete {selectedEmailLabel}?</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkDeleteConfirmOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkTrash()}
                className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
