import { Clock, Trash2, ArrowRight } from 'lucide-react';
import AppLogo, { AppLogoMark } from './AppLogo';
import { motion } from 'framer-motion';
import { useShowStore } from '../store';
import { formatDateShort, formatDuration, formatTime } from '../utils/time';
import { getTotalRunningMs } from '../types';

export default function HistoryView() {
  const { shows, currentShowId, setCurrentShow, deleteShow, settings } = useShowStore();

  const sorted = [...shows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AppLogo size={52} className="mx-auto mb-3 opacity-60" />
          <p className="text-sm text-slate-600">No shows yet</p>
          <p className="text-xs mt-1 text-slate-700">Create your first show to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
        Show History
      </h2>
      <div className="space-y-2">
        {sorted.map((show, i) => {
          const totalMs = getTotalRunningMs(show, new Date());
          const isCurrent = show.id === currentShowId;
          const completedSegs = show.segments.filter(s => s.actualStart && s.actualEnd).length;
          const totalSegs = show.segments.length;

          return (
            <motion.div
              key={show.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`relative rounded-xl border p-4 transition-all ${
                isCurrent
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-show-border bg-show-card hover:border-show-border-light'
              }`}
            >
              {isCurrent && (
                <span className="absolute top-3 right-3 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  CURRENT
                </span>
              )}

              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isCurrent ? 'bg-amber-500/10' : 'bg-show-surface'
                }`}>
                  <AppLogoMark size={18} className={isCurrent ? 'opacity-100' : 'opacity-40'} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-200 text-sm truncate">
                    {show.production || show.title}
                  </p>
                  {show.production && show.title !== show.production && (
                    <p className="text-xs text-slate-500 truncate">{show.title}</p>
                  )}
                  <p className="text-xs text-slate-600 mt-0.5">{formatDateShort(show.date)}</p>

                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      {totalMs > 0 ? formatDuration(totalMs) : 'Not started'}
                    </span>
                    <span className="text-xs text-slate-700">
                      {completedSegs}/{totalSegs} segments
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => deleteShow(show.id)}
                    className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {!isCurrent && (
                    <button
                      onClick={() => setCurrentShow(show.id)}
                      className="w-7 h-7 rounded-lg hover:bg-amber-500/10 flex items-center justify-center text-slate-600 hover:text-amber-400 transition-colors"
                      title="Open show"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
