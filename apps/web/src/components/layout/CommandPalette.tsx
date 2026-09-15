import { useEffect } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import {
  Inbox, Star, FileText, Send, Archive, Trash2, Settings,
  BarChart2, Mail, Search, LogOut
} from 'lucide-react';
import { useStore } from '../../store';
import { authApi } from '../../services/api';

const COMMANDS = [
  { id: 'inbox',    label: 'Go to Inbox',    icon: Inbox,     path: '/inbox' },
  { id: 'starred',  label: 'Go to Starred',  icon: Star,      path: '/starred' },
  { id: 'drafts',   label: 'Go to Drafts',   icon: FileText,  path: '/drafts' },
  { id: 'sent',     label: 'Go to Sent',     icon: Send,      path: '/sent' },
  { id: 'archive',  label: 'Go to Archive',  icon: Archive,   path: '/archive' },
  { id: 'trash',    label: 'Go to Trash',    icon: Trash2,    path: '/trash' },
  { id: 'tracking', label: 'Tracking',       icon: BarChart2, path: '/tracking' },
  { id: 'settings', label: 'Settings',       icon: Settings,  path: '/settings' },
];

export default function CommandPalette() {
  const { open, setOpen, openCompose, setMe } = useStore((s) => ({
    open: s.commandPaletteOpen,
    setOpen: s.setCommandPaletteOpen,
    openCompose: s.openCompose,
    setMe: s.setMe,
  }));
  const navigate = useNavigate();

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  if (!open) return null;

  async function handleLogout() {
    await authApi.logout();
    setMe(null);
    navigate('/');
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="[&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Command.Input
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">ESC</kbd>
          </div>

          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group heading="Compose" className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              <CommandItem
                icon={<Mail className="w-4 h-4" />}
                label="New message"
                shortcut="C"
                onSelect={() => { openCompose('new'); setOpen(false); }}
              />
            </Command.Group>

            <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              {COMMANDS.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  icon={<cmd.icon className="w-4 h-4" />}
                  label={cmd.label}
                  onSelect={() => { navigate(cmd.path); setOpen(false); }}
                />
              ))}
            </Command.Group>

            <Command.Group heading="Account" className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              <CommandItem
                icon={<LogOut className="w-4 h-4" />}
                label="Sign out"
                onSelect={handleLogout}
                danger
              />
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function CommandItem({
  icon, label, shortcut, onSelect, danger,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors
        data-[selected=true]:bg-accent
        ${danger ? 'text-destructive' : 'text-foreground'}`}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
