import { useStore } from '../../store';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../utils/cn';

export default function ToastContainer() {
  const { toasts, removeToast } = useStore((s) => ({
    toasts: s.toasts,
    removeToast: s.removeToast,
  }));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border shadow-lg text-sm animate-fade-in min-w-[240px] max-w-sm"
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-primary shrink-0" />}
          <span className={cn(
            'flex-1 text-foreground',
            toast.type === 'error' && 'text-destructive'
          )}>
            {toast.message}
          </span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
