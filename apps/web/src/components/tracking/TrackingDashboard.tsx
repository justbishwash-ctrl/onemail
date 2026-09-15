import { useEffect, useState } from 'react';
import { Eye, EyeOff, Clock, BarChart2, RefreshCw } from 'lucide-react';
import { trackingApi, type TrackedEmailItem } from '../../services/api';
import { formatRelativeDate, truncate } from '../../utils/format';
import { cn } from '../../utils/cn';

export default function TrackingDashboard() {
  const [emails, setEmails] = useState<TrackedEmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  async function load(reset = false) {
    setLoading(true);
    setError(null);
    try {
      const start = reset ? 0 : offset;
      const data = await trackingApi.list(LIMIT, start);
      if (reset) {
        setEmails(data.trackedEmails);
        setOffset(0);
      } else {
        setEmails((prev) => [...prev, ...data.trackedEmails]);
      }
    } catch (err) {
      setError('Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
  }, []);

  const opened = emails.filter((e) => e.isOpened).length;
  const notOpened = emails.filter((e) => !e.isOpened).length;
  const openRate = emails.length > 0 ? Math.round((opened / emails.length) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Email Tracking</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              See when recipients open emails you sent
            </p>
          </div>
          <button
            onClick={() => load(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Tracked emails"
            value={emails.length.toString()}
            icon={<BarChart2 className="w-4 h-4" />}
          />
          <StatCard
            label="Opened"
            value={`${opened} (${openRate}%)`}
            icon={<Eye className="w-4 h-4" />}
            color="text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            label="Not opened"
            value={notOpened.toString()}
            icon={<EyeOff className="w-4 h-4" />}
            color="text-muted-foreground"
          />
        </div>

        {/* Email list */}
        {error ? (
          <div className="text-center py-8 text-sm text-muted-foreground">{error}</div>
        ) : loading && emails.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : emails.length === 0 ? (
          <div className="text-center py-12">
            <BarChart2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tracked emails yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Enable tracking when composing to see read receipts
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {emails.map((email) => (
              <TrackingRow key={email.id} email={email} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={cn('text-2xl font-semibold text-foreground', color)}>{value}</p>
    </div>
  );
}

function TrackingRow({ email }: { email: TrackedEmailItem }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-accent/30 transition-colors">
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
        email.isOpened ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-muted'
      )}>
        {email.isOpened ? (
          <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <EyeOff className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {email.subjectPreview ?? '(no subject)'}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-muted-foreground">
            Sent {formatRelativeDate(email.createdAt)}
          </span>
          {email.isOpened && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {email.totalOpens === 1
                ? `Opened ${formatRelativeDate(email.firstOpenedAt!)}`
                : `${email.totalOpens} opens, last ${formatRelativeDate(email.lastOpenedAt!)}`}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {email.isOpened ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
            Opened
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            Pending
          </span>
        )}
      </div>
    </div>
  );
}
