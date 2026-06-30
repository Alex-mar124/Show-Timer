import { useState } from 'react';
import { X } from 'lucide-react';
import AppLogo from './AppLogo';
import { useShowStore } from '../store';
import { todayISO } from '../utils/time';
import { schedulePreShowNotifications } from '../utils/notifications';
import { motion, AnimatePresence } from 'framer-motion';
import { CompactTimePicker } from './TimePicker';

function toISO(dateStr: string, timeStr: string): string | null {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(dateStr);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export default function ShowSetupModal() {
  const { newShowModalOpen, setNewShowModalOpen, createShow, settings } = useShowStore();
  const [production, setProduction] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [doorsTime, setDoorsTime] = useState('');
  const [showStartTime, setShowStartTime] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const label = title.trim() || production.trim();
    if (!label) return;

    const plannedStartTime = toISO(date, showStartTime);
    const doorsOpenTime = toISO(date, doorsTime);

    createShow({
      title: label,
      production: production.trim(),
      date,
      plannedStartTime,
      doorsOpenTime,
    });

    if (plannedStartTime && settings.preshowAlertsEnabled) {
      schedulePreShowNotifications(plannedStartTime, settings, settings.timeFormat);
    }

    setProduction('');
    setTitle('');
    setDate(todayISO());
    setDoorsTime('');
    setShowStartTime('');
  }

  return (
    <AnimatePresence>
      {newShowModalOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setNewShowModalOpen(false)}
          />

          <motion.div
            className="relative z-10 w-full max-w-md mx-4"
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="rounded-2xl border border-show-border bg-show-card shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-show-border">
                <div className="flex items-center gap-3">
                  <AppLogo size={36} />
                  <h2 className="text-lg font-semibold text-slate-100">New Show</h2>
                </div>
                <button
                  onClick={() => setNewShowModalOpen(false)}
                  className="w-8 h-8 rounded-lg hover:bg-show-hover flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Production */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                    Production Name
                  </label>
                  <input
                    type="text"
                    value={production}
                    onChange={e => setProduction(e.target.value)}
                    placeholder="e.g. Phantom of the Opera"
                    className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all text-sm"
                  />
                </div>

                {/* Show label */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                    Show Label <span className="normal-case text-slate-600">(e.g. Tue Evening)</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Tuesday Evening"
                    className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all text-sm"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all text-sm"
                  />
                </div>

                {/* Times row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                      Doors Open
                    </label>
                    <CompactTimePicker value={doorsTime} format={settings.timeFormat} onChange={setDoorsTime} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                      Show Start
                    </label>
                    <CompactTimePicker value={showStartTime} format={settings.timeFormat} onChange={setShowStartTime} />
                  </div>
                </div>

                {/* Hint */}
                {(doorsTime || showStartTime) && (
                  <p className="text-[11px] text-slate-600 -mt-1">
                    Expected segment start times will be calculated automatically from these times.
                  </p>
                )}

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={!title.trim() && !production.trim()}
                    className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-show-hover disabled:text-slate-600 text-show-base font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    Create Show
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
