import { useState } from 'react';
import { X, Clock, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BigTimePicker } from './TimePicker';
import { formatTime } from '../utils/time';
import type { TimeFormat } from '../types';

export interface TimeSuggestion {
  label: string;
  iso: string;
}

interface Props {
  title: string;
  subtitle?: string;
  /** Current value as ISO string, or null. */
  value: string | null;
  /** "yyyy-MM-dd" the chosen time is anchored to. */
  dateAnchor: string;
  format: TimeFormat;
  /** Optional quick-pick times (e.g. copy from another staff member). */
  suggestions?: TimeSuggestion[];
  onSave: (iso: string | null) => void;
  onClose: () => void;
}

/**
 * Generic clock-time editor for a standalone timestamp (staff arrival/leave,
 * client arrival/departure). Anchors the chosen HH:MM:SS to `dateAnchor`.
 */
export default function TimestampModal({ title, subtitle, value, dateAnchor, format, suggestions, onSave, onClose }: Props) {
  const current = value ? new Date(value) : new Date();
  const [hours, setHours] = useState(current.getHours());
  const [minutes, setMinutes] = useState(current.getMinutes());
  const [seconds, setSeconds] = useState(current.getSeconds());

  function useNow() {
    const now = new Date();
    setHours(now.getHours());
    setMinutes(now.getMinutes());
    setSeconds(now.getSeconds());
  }

  function applyIso(iso: string) {
    const d = new Date(iso);
    setHours(d.getHours());
    setMinutes(d.getMinutes());
    setSeconds(d.getSeconds());
  }

  function handleSave() {
    const [y, mo, d] = dateAnchor.split('-').map(Number);
    const dt = new Date(y, mo - 1, d, hours, minutes, seconds, 0);
    onSave(dt.toISOString());
    onClose();
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative z-10 w-full max-w-sm mx-4"
          initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 8 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        >
          <div className="rounded-2xl border border-show-border bg-show-card shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-show-border">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-slate-100">{title}</h3>
              </div>
              {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
              <button onClick={onClose}
                className="w-7 h-7 rounded-lg hover:bg-show-hover flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <BigTimePicker
                hours={hours} minutes={minutes} seconds={seconds}
                format={format}
                onChange={({ hours: h, minutes: m, seconds: s }) => { setHours(h); setMinutes(m); setSeconds(s); }}
              />

              <button onClick={useNow}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-show-border hover:bg-show-hover text-slate-400 hover:text-slate-200 text-sm transition-colors">
                <RotateCcw className="w-3.5 h-3.5" />
                Use Current Time
              </button>

              {suggestions && suggestions.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-1.5">Copy from</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((sg, i) => (
                      <button
                        key={i}
                        onClick={() => applyIso(sg.iso)}
                        className="px-2.5 py-1.5 rounded-lg border border-show-border hover:border-amber-500/40 text-xs text-slate-400 hover:text-amber-300 transition-colors"
                      >
                        {sg.label} · <span className="font-mono">{formatTime(sg.iso, format)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {value && (
                  <button onClick={() => { onSave(null); onClose(); }}
                    className="flex-1 py-2.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors">
                    Clear
                  </button>
                )}
                <button onClick={handleSave}
                  className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-show-base font-semibold text-sm transition-all">
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
