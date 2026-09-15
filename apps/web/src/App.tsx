import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { meApi } from './services/api';
import { useStore } from './store';
import { useTheme } from './hooks/useTheme';

import Login from './pages/Login';
import AuthError from './pages/AuthError';
import InboxPage from './pages/InboxPage';
import TrackingPage from './pages/TrackingPage';
import SettingsPage from './pages/SettingsPage';

import ComposeWindow from './components/compose/ComposeWindow';
import CommandPalette from './components/layout/CommandPalette';
import ToastContainer from './components/layout/ToastContainer';

function ThemeInit() {
  useTheme();
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { me, setMe } = useStore((s) => ({ me: s.me, setMe: s.setMe }));
  const [loading, setLoading] = useState(!me);
  const navigate = useNavigate();

  useEffect(() => {
    if (me) return;
    meApi.get()
      .then((data) => {
        setMe(data);
        useStore.setState({ theme: data.preferences.theme });
      })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading Onemail...</p>
        </div>
      </div>
    );
  }

  if (!me) return null;
  return <>{children}</>;
}

function AppShell() {
  const { composeOpen, composeMode, composeContext, closeCompose } = useStore((s) => ({
    composeOpen: s.composeOpen,
    composeMode: s.composeMode,
    composeContext: s.composeContext,
    closeCompose: s.closeCompose,
  }));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const state = useStore.getState();
      if (state.composeOpen) {
        event.preventDefault();
        state.closeCompose();
      } else if (state.commandPaletteOpen) {
        event.preventDefault();
        state.setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/inbox"         element={<AuthGuard><InboxPage folder="inbox" /></AuthGuard>} />
        <Route path="/starred"       element={<AuthGuard><InboxPage folder="starred" /></AuthGuard>} />
        <Route path="/drafts"        element={<AuthGuard><InboxPage folder="drafts" /></AuthGuard>} />
        <Route path="/sent"          element={<AuthGuard><InboxPage folder="sent" /></AuthGuard>} />
        <Route path="/archive"       element={<AuthGuard><InboxPage folder="archive" /></AuthGuard>} />
        <Route path="/spam"          element={<AuthGuard><InboxPage folder="spam" /></AuthGuard>} />
        <Route path="/trash"         element={<AuthGuard><InboxPage folder="trash" /></AuthGuard>} />
        <Route path="/label/:labelId" element={<AuthGuard><InboxPage folder="label" /></AuthGuard>} />
        <Route path="/tracking"      element={<AuthGuard><TrackingPage /></AuthGuard>} />
        <Route path="/settings"      element={<AuthGuard><SettingsPage /></AuthGuard>} />
        <Route path="/auth/error"    element={<AuthError />} />
        <Route path="*"              element={<Navigate to="/inbox" replace />} />
      </Routes>

      {/* Global overlays */}
      {composeOpen && (
        <ComposeWindow
          mode={composeMode}
          context={composeContext}
          onClose={closeCompose}
        />
      )}
      <CommandPalette />
      <ToastContainer />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeInit />
      <AppShell />
    </BrowserRouter>
  );
}
