import { create } from 'zustand';
import type { MeResponse } from '../services/api';
import type { ParsedThread } from '../types/gmail';

interface AppState {
  // Auth
  me: MeResponse | null;
  setMe: (me: MeResponse | null) => void;

  // Active thread
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  activeThread: ParsedThread | null;
  setActiveThread: (thread: ParsedThread | null) => void;

  // Compose
  composeOpen: boolean;
  composeMode: 'new' | 'reply' | 'replyAll' | 'forward';
  composeContext: ParsedThread | null;
  openCompose: (mode?: AppState['composeMode'], context?: ParsedThread) => void;
  closeCompose: () => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isSearching: boolean;
  setIsSearching: (s: boolean) => void;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Toast queue
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  me: null,
  setMe: (me) => set({ me }),

  activeThreadId: null,
  setActiveThreadId: (id) => set({ activeThreadId: id }),
  activeThread: null,
  setActiveThread: (thread) => set({ activeThread: thread }),

  composeOpen: false,
  composeMode: 'new',
  composeContext: null,
  openCompose: (mode = 'new', context) =>
    set({ composeOpen: true, composeMode: mode, composeContext: context ?? null }),
  closeCompose: () =>
    set({ composeOpen: false, composeContext: null }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  isSearching: false,
  setIsSearching: (s) => set({ isSearching: s }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  theme: 'system',
  setTheme: (theme) => set({ theme }),

  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
