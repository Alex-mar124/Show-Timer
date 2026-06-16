import { useState } from 'react';
import { X, Clock, RotateCcw, Sunrise } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShowStore } from '../store';
import type { Segment } from '../types';
import { BigTimePicker } from './TimePicker';

interface Props {
  showId: string;
  /** "yyyy-MM-dd" of the show — used to anchor the saved ISO to the right date. */
  dateAnchor: string;
  segment: Segment;
  field: 'actualStart' | 'actualEnd';
  onClose: () => void;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function TimeEditModal({ showId, dateAnchor, segment, field, onClose }: Props) {
  const { setSegmentTime, settings } = useShowStore();
  const current = segment[field] ? new Date(segment[field]!) : new Date();

  const [hours,   setHours]   = useState(current.getHours());
  const [minutes, setMinutes] = useState(current.getMinutes());
  const [seconds, setSeconds] = useState(current.getSeconds());

  // Detect if existing value is already next-day relative to the anchor.
  const [nextDay, setNextDay] = useState(() => {
    if (!segment[field]) return false;
    const [y, mo, d] = dateAnchor.split('-').map(Number);
    const anchor = new Date(y, mo - 1, d);
    const saved = new Date(segment[field]!);
    return saved.getDate() !== anchor.getDate() || saved.getMonth() !== anchor.getMonth();
  });

  const label = field === 'actualStart' ? 'Start Time' : 'End Time';

  function useNow() {
    const now = new Date();
    setHours(now.getHours());
    setMinutes(now.getMinutes());
    setSeconds(now.getSeconds());
    setNextDay(now.getHours() < 6);
  }

  function handleTimeChange(h: number, m: number, s: number) {
    setHours(h); setMinutes(m); setSeconds(s);
    if (h < 6 && !nextDay) setNextDay(true);
    if (h >= 6 && nextDay) setNextDay(false);
  }

  function handleSave() {
    const [y, mo, d] = dateAnchor.split('-').map(Number);
    const dt = new Date(y, mo - 1, d + (nextDay ? 1 : 0), hours, minutes, seconds, 0);
    setSegmentTime(showId, segment.id, field, dt);
    onClose();
  }

  function handleClear() {
    setSegmentTime(showId, segment.id, field, null);
    onClose();
  }

  const hasCurrent = !!segment[field];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className="relative z-10 w-full max-w-sm mx-4"
          initial={{ scale: 0.95, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 8 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        >
          <div className="rounded-2xl border border-show-border bg-show-card shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-show-border">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-slate-100">Edit {label}</h3>
              </div>
              <p className="text-xs text-slate-500">{segment.label}</p>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg hover:bg-show-hover flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Spinner */}
              <BigTimePicker
                hours={hours}
                minutes={minutes}
                seconds={seconds}
                format={settings.timeFormat}
                onChange={({ hours: h, minutes: m, seconds: s }) => handleTimeChange(h, m, s)}
              />

              {/* Use Now + next-day */}
              <div className="flex gap-2">
                <button
                  onClick={useNow}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-show-border hover:bg-show-hover text-slate-400 hover:text-slate-200 text-sm transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Use Current Time
                </button>
                <button
                  onClick={() => setNextDay(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    nextDay
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-show-border text-slate-600 hover:text-slate-400'
                  }`}
                  title="Time is past midnight — next calendar day"
                >
                  <Sunrise className="w-3.5 h-3.5" />
                  +1 day
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {hasCurrent && (
                  <button
                    onClick={handleClear}
                    className="flex-1 py-2.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-show-base font-semibold text-sm transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
