import { useState, useEffect } from 'react';
import Sidebar from '../components/layout/Sidebar';
import { SettingsLayout } from '../components/settings/SettingsLayout';
import { useStore } from '../store';
import { labelsApi } from '../services/api';
import type { GmailLabel } from '../types/gmail';
import { Menu } from 'lucide-react';

export default function SettingsPage() {
  const { me, sidebarOpen, setSidebarOpen } = useStore((s) => ({
    me: s.me,
    sidebarOpen: s.sidebarOpen,
    setSidebarOpen: s.setSidebarOpen,
  }));

  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [labelUnread, setLabelUnread] = useState<Record<string, number>>({});

  useEffect(() => {
    labelsApi.list().then(({ labels: list }) => {
      setLabels(list);
      const unread: Record<string, number> = {};
      list.forEach((l) => { if (l.threadsUnread) unread[l.id] = l.threadsUnread; });
      setLabelUnread(unread);
    }).catch(() => {});
  }, [me?.activeAccount.id]);

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && <Sidebar labels={labels} labelUnread={labelUnread} />}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0 bg-card">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
        </header>
        <SettingsLayout />
      </div>
    </div>
  );
}
