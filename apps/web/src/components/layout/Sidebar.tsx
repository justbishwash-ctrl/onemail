import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Inbox, Star, FileText, Send, Archive, AlertCircle, Trash2,
  Tag, Settings, ChevronDown, Plus, LogOut, Check,
  BarChart2, Mail
} from 'lucide-react';
import { useStore } from '../../store';
import { authApi } from '../../services/api';
import { getInitials } from '../../utils/format';
import { cn } from '../../utils/cn';
import type { GmailLabel } from '../../types/gmail';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  gmailLabel?: string;
  badge?: number;
}

const SYSTEM_NAV: NavItem[] = [
  { label: 'Inbox', icon: <Inbox className="w-4 h-4" />, path: '/inbox', gmailLabel: 'INBOX' },
  { label: 'Starred', icon: <Star className="w-4 h-4" />, path: '/starred', gmailLabel: 'STARRED' },
  { label: 'Drafts', icon: <FileText className="w-4 h-4" />, path: '/drafts', gmailLabel: 'DRAFT' },
  { label: 'Sent', icon: <Send className="w-4 h-4" />, path: '/sent', gmailLabel: 'SENT' },
  { label: 'Archive', icon: <Archive className="w-4 h-4" />, path: '/archive', gmailLabel: 'ARCHIVE' },
  { label: 'Spam', icon: <AlertCircle className="w-4 h-4" />, path: '/spam', gmailLabel: 'SPAM' },
  { label: 'Trash', icon: <Trash2 className="w-4 h-4" />, path: '/trash', gmailLabel: 'TRASH' },
];

interface SidebarProps {
  labels: GmailLabel[];
  labelUnread: Record<string, number>;
}

export default function Sidebar({ labels, labelUnread }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, setMe, addToast, openCompose } = useStore((s) => ({
    me: s.me,
    setMe: s.setMe,
    addToast: s.addToast,
    openCompose: s.openCompose,
  }));

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const userLabels = labels.filter(
    (l) => l.type === 'user' && l.name !== 'CHAT' && l.name !== 'SENT'
  );

  async function handleLogout() {
    await authApi.logout();
    setMe(null);
    navigate('/');
  }

  async function handleSwitchAccount(accountId: string) {
    try {
      const res = await fetch('/auth/switch-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedAccountId: accountId }),
      });
      if (res.ok) {
        window.location.href = '/inbox';
      }
    } catch {
      addToast('Failed to switch account', 'error');
    }
    setAccountMenuOpen(false);
  }

  const activeAccount = me?.activeAccount;

  return (
    <aside className="w-56 shrink-0 h-full flex flex-col bg-card border-r border-border">
      {/* Logo + Account Switcher */}
      <div className="p-3 border-b border-border">
        <button
          onClick={() => setAccountMenuOpen((o) => !o)}
          className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
            {activeAccount ? getInitials(activeAccount.name) : 'O'}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-medium truncate text-foreground">{activeAccount?.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{activeAccount?.email}</p>
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', accountMenuOpen && 'rotate-180')} />
        </button>

        {/* Account dropdown */}
        {accountMenuOpen && (
          <div className="mt-1 bg-background border border-border rounded-lg shadow-lg overflow-hidden animate-scale-in">
            {me?.linkedAccounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => handleSwitchAccount(acc.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                  {getInitials(acc.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{acc.email}</p>
                </div>
                {acc.id === activeAccount?.id && (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
              </button>
            ))}

            <div className="border-t border-border mt-1">
              <a
                href="/auth/google?add_account=true"
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
              >
                <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Add account</span>
              </a>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
              >
                <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Sign out</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Compose button */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={() => openCompose('new')}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Mail className="w-3.5 h-3.5" />
          Compose
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {SYSTEM_NAV.map((item) => {
          const isActive = location.pathname === item.path;
          const unread = item.gmailLabel ? labelUnread[item.gmailLabel] : 0;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {unread > 0 && (
                <span className="text-[10px] font-semibold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}

        {/* User labels */}
        {userLabels.length > 0 && (
          <div className="pt-3">
            <p className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Labels
            </p>
            {userLabels.map((label) => (
              <button
                key={label.id}
                onClick={() => navigate(`/label/${label.id}`)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                  location.pathname === `/label/${label.id}`
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Tag
                  className="w-4 h-4 shrink-0"
                  style={label.color ? { color: label.color.textColor } : undefined}
                />
                <span className="flex-1 text-left truncate">{label.name}</span>
                {(label.threadsUnread ?? 0) > 0 && (
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {label.threadsUnread}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-border px-2 py-2 space-y-0.5">
        <button
          onClick={() => navigate('/tracking')}
          className={cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
            location.pathname === '/tracking'
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <BarChart2 className="w-4 h-4" />
          Tracking
        </button>
        <button
          onClick={() => navigate('/settings')}
          className={cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
            location.pathname.startsWith('/settings')
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </aside>
  );
}
