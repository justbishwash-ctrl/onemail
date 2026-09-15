import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Palette, Shield, Keyboard, ChevronRight, ArrowLeft, Trash2, LoaderCircle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useStore } from '../../store';
import { authApi, meApi, WORKER_URL } from '../../services/api';
import { useTheme } from '../../hooks/useTheme';
import { shortcuts } from '../../hooks/useKeyboard';

type SettingsTab = 'account' | 'appearance' | 'privacy' | 'shortcuts';

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'account',    label: 'Account',    icon: <User className="w-4 h-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
  { id: 'privacy',    label: 'Privacy',    icon: <Shield className="w-4 h-4" /> },
  { id: 'shortcuts',  label: 'Shortcuts',  icon: <Keyboard className="w-4 h-4" /> },
];

export function SettingsLayout() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Settings sidebar */}
      <aside className="w-52 shrink-0 border-r border-border bg-card overflow-y-auto">
        <div className="p-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <h2 className="text-sm font-semibold text-foreground mb-3">Settings</h2>
          <nav className="space-y-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  activeTab === tab.id
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {tab.icon}
                {tab.label}
                {activeTab === tab.id && (
                  <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-lg">
          {activeTab === 'account'    && <AccountSettings />}
          {activeTab === 'appearance' && <AppearanceSettings />}
          {activeTab === 'privacy'    && <PrivacySettings />}
          {activeTab === 'shortcuts'  && <ShortcutsSettings />}
        </div>
      </div>
    </div>
  );
}

// ── Account ────────────────────────────────────────────────

function AccountSettings() {
  const { me, setMe, addToast } = useStore((s) => ({ me: s.me, setMe: s.setMe, addToast: s.addToast }));
  const [accountToRemove, setAccountToRemove] = useState<{ id: string; email: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountToRemove(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  if (!me) return null;

  async function removeAccount() {
    if (!accountToRemove) return;
    setRemoving(true);
    try {
      await authApi.removeAccount(accountToRemove.id);
      setMe(await meApi.get());
      setAccountToRemove(null);
      addToast('Linked account removed', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to remove account', 'error');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-6">Account</h3>

      {/* Primary account info */}
      <Section title="Profile">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
            {me.user.name[0].toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-foreground">{me.user.name}</p>
            <p className="text-sm text-muted-foreground">{me.user.email}</p>
          </div>
        </div>
      </Section>

      {/* Linked accounts */}
      <Section title="Linked Google accounts">
        <div className="space-y-2">
          {me.linkedAccounts.map((acc) => (
            <div
              key={acc.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border',
                acc.id === me.activeAccount.id
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border'
              )}
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                {acc.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{acc.email}</p>
                <p className="text-xs text-muted-foreground">{acc.name}</p>
              </div>
              {acc.id === me.activeAccount.id && (
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  Active
                </span>
              )}
              {acc.isPrimary && (
                <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                  Primary
                </span>
              )}
              {!acc.isPrimary && (
                <button
                  type="button"
                  onClick={() => setAccountToRemove({ id: acc.id, email: acc.email })}
                  title={`Remove ${acc.email}`}
                  aria-label={`Remove ${acc.email}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          <a
            href={`${WORKER_URL}/auth/google?add_account=true`}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
          >
            + Add another Google account
          </a>
        </div>
      </Section>

      {accountToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="remove-account-title">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 id="remove-account-title" className="text-base font-semibold text-foreground">Remove linked account?</h2>
            <p className="mt-2 break-words text-sm text-muted-foreground">Remove {accountToRemove.email} and stop access to its mail?</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAccountToRemove(null)} disabled={removing} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void removeAccount()} disabled={removing} className="flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50">
                {removing && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Appearance ─────────────────────────────────────────────

function AppearanceSettings() {
  const { me, setMe, addToast } = useStore((s) => ({
    me: s.me,
    setMe: s.setMe,
    addToast: s.addToast,
  }));
  const { theme, setTheme } = useTheme();

  const prefs = me?.preferences;

  async function save(updates: Partial<typeof prefs>) {
    if (!prefs) return;
    const merged = { ...prefs, ...updates };
    try {
      await meApi.updatePreferences(merged);
      setMe(me ? { ...me, preferences: merged as typeof prefs } : null);
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    }
  }

  const themes = [
    { value: 'light',  label: 'Light' },
    { value: 'dark',   label: 'Dark' },
    { value: 'system', label: 'System' },
  ] as const;

  const densities = [
    { value: 'compact',     label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious',    label: 'Spacious' },
  ] as const;

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-6">Appearance</h3>

      <Section title="Theme">
        <div className="flex gap-2">
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setTheme(t.value);
                save({ theme: t.value });
              }}
              className={cn(
                'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                theme === t.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Density">
        <div className="flex gap-2">
          {densities.map((d) => (
            <button
              key={d.value}
              onClick={() => save({ density: d.value })}
              className={cn(
                'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                prefs?.density === d.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Email signature">
        <SignatureEditor
          value={prefs?.signature ?? ''}
          onSave={(sig) => save({ signature: sig })}
        />
      </Section>
    </div>
  );
}

function SignatureEditor({ value, onSave }: { value: string; onSave: (s: string) => void }) {
  const [draft, setDraft] = useState(value);

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground resize-none outline-none focus:ring-1 focus:ring-primary"
        placeholder="-- \nYour signature"
      />
      <button
        onClick={() => onSave(draft)}
        className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Save signature
      </button>
    </div>
  );
}

// ── Privacy ────────────────────────────────────────────────

function PrivacySettings() {
  const { me, setMe, addToast } = useStore((s) => ({
    me: s.me,
    setMe: s.setMe,
    addToast: s.addToast,
  }));

  const prefs = me?.preferences;

  async function toggle(key: 'trackingEnabled', value: boolean) {
    if (!prefs || !me) return;
    const merged = { ...prefs, [key]: value };
    try {
      await meApi.updatePreferences(merged);
      setMe({ ...me, preferences: merged });
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-6">Privacy</h3>

      <Section title="Email tracking">
        <ToggleRow
          label="Enable open tracking"
          description="Inserts a tracking pixel in outgoing emails to detect when recipients open them. IP addresses are hashed and never stored in plain text."
          checked={prefs?.trackingEnabled ?? true}
          onChange={(v) => toggle('trackingEnabled', v)}
        />
      </Section>
    </div>
  );
}

// ── Keyboard shortcuts ─────────────────────────────────────

function ShortcutsSettings() {
  const { me, setMe, addToast } = useStore((s) => ({
    me: s.me,
    setMe: s.setMe,
    addToast: s.addToast,
  }));
  const prefs = me?.preferences;

  async function toggle(value: boolean) {
    if (!prefs || !me) return;
    const merged = { ...prefs, shortcutsEnabled: value };
    try {
      await meApi.updatePreferences(merged);
      setMe({ ...me, preferences: merged });
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-6">Keyboard shortcuts</h3>

      <Section title="Enable shortcuts">
        <ToggleRow
          label="Keyboard shortcuts"
          description="Use keys to navigate and act on emails without touching the mouse."
          checked={prefs?.shortcutsEnabled ?? true}
          onChange={toggle}
        />
      </Section>

      {prefs?.shortcutsEnabled && (
        <Section title="Shortcut reference">
          <div className="space-y-1">
            {Object.entries(shortcuts).map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">{desc}</span>
                <kbd className="text-xs bg-muted text-foreground px-2 py-0.5 rounded font-mono">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Shared primitives ──────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </p>
      {children}
    </div>
  );
}

function ToggleRow({
  label, description, checked, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          checked ? 'bg-primary' : 'bg-muted'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
}
