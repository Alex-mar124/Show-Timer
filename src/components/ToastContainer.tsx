import { X, Info, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useShowStore } from '../store';
import type { Toast } from '../types';

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  error: AlertCircle,
};

const COLORS = {
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  success: 'border-green-500/30 bg-green-500/10 text-green-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
};

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useShowStore();
  const Icon = ICONS[toast.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      className={`flex items-start gap-2.5 px-3.5 py-3 rounded-xl border text-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)] ${COLORS[toast.type]}`}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-xs">{toast.title}</p>
        {toast.message && (
          <p className="text-xs opacity-75 mt-0.5">{toast.message}</p>
        )}
      </div>
      <button onClick={() => removeToast(toast.id)} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export default function ToastContainer() {
  const { toasts } = useShowStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
