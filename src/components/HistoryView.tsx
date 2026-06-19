import { useState } from 'react';
import { Clock, Trash2, ArrowRight, ChevronDown, FolderOpen, CheckCircle, Plus, CalendarClock } from 'lucide-react';
import AppLogo, { AppLogoMark } from './AppLogo';
import { motion, AnimatePresence } from 'framer-motion';
import { useShowStore } from '../store';
import { formatDateShort, formatDuration } from '../utils/time';
import { getTotalRunningMs } from '../types';
import type { PerformanceType } from '../types';

const PERF_TYPE_LABEL: Record<PerformanceType, string> = {
  matinee: 'Mat', evening: 'Eve', other: 'Other',
};

export default function HistoryView() {
  const {
    shows, runs, currentShowId,
    setCurrentShow, deleteShow,
    completeRun, deleteRun,
    setNewRunModalOpen,
    startNextPerformance, addToast,
  } = useShowStore();

  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  function toggleRun(id: string) {
    setExpandedRuns(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const hasStarted = (s: typeof shows[number]) =>
    !!s.completedAt || s.segments.some(seg => seg.actualStart);

  const standalone = shows.filter(s => !s.runId);

  // Upcoming = standalone shows not yet started (imported presets / planned).
  const upcomingShows = standalone
    .filter(s => !hasStarted(s))
    .sort((a, b) => a.date.localeCompare(b.date));

  const standaloneShows = standalone
    .filter(s => hasStarted(s))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const sortedRuns = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (shows.length === 0 && runs.length === 0) {
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
      {/* Upcoming shows — planned / imported presets not yet started */}
      {upcomingShows.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Upcoming Shows
          </h2>
          <div className="space-y-2">
            {upcomingShows.map((show, i) => {
              const isCurrent = show.id === currentShowId;
              return (
                <motion.div
                  key={show.id}
                  onClick={() => setCurrentShow(show.id)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                    isCurrent ? 'border-amber-500/30 bg-amber-500/5' : 'border-show-border bg-show-card hover:border-amber-500/20'
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-show-surface">
                    <CalendarClock className="w-4.5 h-4.5 text-amber-400/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-200 text-sm truncate">{show.production || show.title}</p>
                      <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full shrink-0">Ready</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {formatDateShort(show.date)}
                      {show.production && show.title !== show.production ? ` · ${show.title}` : ''}
                      {` · ${show.segments.length} segments`}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteShow(show.id); }}
                    className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Production Runs section — always shown so the button is discoverable */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            Production Runs
          </h2>
          <button
            onClick={() => setNewRunModalOpen(true)}
            className="flex items-center gap-1 text-xs text-slate-700 hover:text-amber-400 transition-colors"
          >
            <Plus className="w-3 h-3" />
            New Run
          </button>
        </div>

        {sortedRuns.length === 0 && (
          <p className="text-xs text-slate-700 py-2">
            No runs yet — group multiple performances of the same show into a production run.
          </p>
        )}

        <div className="space-y-2">
          {sortedRuns.map((run, ri) => {
              const runShows = run.showIds
                .map(id => shows.find(s => s.id === id))
                .filter(Boolean) as typeof shows;
              const completedShows = runShows.filter(s => s.completedAt);
              const totalMsArr = completedShows.map(s => getTotalRunningMs(s, new Date()));
              const avgMs = totalMsArr.length > 0
                ? totalMsArr.reduce((a, b) => a + b, 0) / totalMsArr.length
                : 0;
              const isExpanded = expandedRuns.has(run.id);
              const isComplete = !!run.completedAt;
              const perfShows = runShows.filter(s => !s.dayType || s.dayType === 'performance');
              const uniquePerfDates = new Set(perfShows.map(s => s.date)).size;
              const firstDate = runShows[0]?.date;
              const lastDate = runShows[runShows.length - 1]?.date;
              const dateRange = firstDate
                ? firstDate === lastDate ? formatDateShort(firstDate)
                  : `${formatDateShort(firstDate)} – ${formatDateShort(lastDate ?? firstDate)}`
                : 'No performances yet';
              const hasCurrentShow = runShows.some(s => s.id === currentShowId);
              const nextPerfNumber = perfShows.length + 1;

              return (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: ri * 0.04 }}
                  className={`rounded-xl border overflow-hidden transition-all ${
                    hasCurrentShow
                      ? 'border-amber-500/30'
                      : isComplete
                      ? 'border-show-border/50'
                      : 'border-show-border'
                  } bg-show-card`}
                >
                  {/* Run header row */}
                  <button
                    onClick={() => toggleRun(run.id)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-show-hover/30 transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      hasCurrentShow ? 'bg-amber-500/10' : 'bg-show-surface'
                    }`}>
                      {isComplete
                        ? <CheckCircle className="w-4.5 h-4.5 text-green-500 opacity-60" />
                        : <FolderOpen className="w-4.5 h-4.5 text-amber-400 opacity-70" />
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-200 text-sm truncate">{run.name}</p>
                        {isComplete && (
                          <span className="text-[10px] font-semibold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                            Complete
                          </span>
                        )}
                        {hasCurrentShow && !isComplete && (
                          <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                        {run.performanceType && (
                          <span className="text-[10px] text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded-full capitalize">
                            {run.performanceType}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-xs text-slate-600">{dateRange}</p>
                        <span className="text-xs text-slate-700">
                          {uniquePerfDates > 0
                            ? `${uniquePerfDates} night${uniquePerfDates !== 1 ? 's' : ''}${runShows.length > uniquePerfDates ? ` · ${runShows.length} shows` : ''}`
                            : `${runShows.length} day${runShows.length !== 1 ? 's' : ''}`}
                        </span>
                        {avgMs > 0 && (
                          <span className="flex items-center gap-1 text-xs text-slate-600">
                            <Clock className="w-3 h-3" />
                            avg {formatDuration(avgMs)}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronDown className={`w-4 h-4 text-slate-600 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded: performances list + actions */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-show-border">
                          {/* Per-night rows */}
                          {runShows.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-slate-700">No performances yet</p>
                          ) : (
                            runShows.map((show, si) => {
                              const totalMs = getTotalRunningMs(show, new Date());
                              const isCurrent = show.id === currentShowId;
                              const isDoubleHeader = show.segments.some(s => s.type === 'changeover');
                              return (
                                <div
                                  key={show.id}
                                  onClick={() => setCurrentShow(show.id)}
                                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-show-border/50 last:border-b-0 cursor-pointer ${
                                    isCurrent ? 'bg-amber-500/5' : 'hover:bg-show-hover/20'
                                  } transition-colors`}
                                >
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-xs font-mono text-slate-500 w-6">#{si + 1}</span>
                                    {show.dayType && show.dayType !== 'performance' ? (
                                      <span className={`text-[10px] px-1 py-0.5 rounded font-semibold ${
                                        show.dayType === 'rehearsal' ? 'text-teal-300 bg-teal-500/15' :
                                        show.dayType === 'plotting'  ? 'text-indigo-300 bg-indigo-500/15' :
                                        show.dayType === 'bump_in'   ? 'text-orange-300 bg-orange-500/15' :
                                        'text-rose-300 bg-rose-500/15'
                                      }`}>
                                        {show.dayType === 'rehearsal' ? 'Reh' :
                                         show.dayType === 'plotting'  ? 'Plot' :
                                         show.dayType === 'bump_in'   ? 'B.In' : 'B.Out'}
                                      </span>
                                    ) : isDoubleHeader ? (
                                      <span className="text-[10px] text-amber-300/80 bg-amber-500/10 px-1 py-0.5 rounded font-semibold">2×</span>
                                    ) : show.performanceType ? (
                                      <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1 py-0.5 rounded font-semibold">
                                        {PERF_TYPE_LABEL[show.performanceType]}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-300">
                                      {formatDateShort(show.date)}
                                      {isDoubleHeader && (
                                        <span className="ml-1.5 text-[10px] text-slate-600">double header</span>
                                      )}
                                    </p>
                                  </div>
                                  <span className="text-xs text-slate-600 font-mono shrink-0">
                                    {totalMs > 0 ? formatDuration(totalMs) : '—'}
                                  </span>
                                  {isCurrent && (
                                    <span className="text-[10px] text-amber-400 shrink-0">current</span>
                                  )}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={e => { e.stopPropagation(); deleteShow(show.id); }}
                                      className="w-6 h-6 rounded hover:bg-red-500/10 flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                    {!isCurrent && (
                                      <ArrowRight className="w-3 h-3 text-slate-700" />
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}

                          {/* Run actions */}
                          <div className="flex items-center justify-between px-4 py-2.5 bg-show-surface/40 border-t border-show-border">
                            <div className="flex items-center gap-2">
                              {!isComplete && (
                                <button
                                  onClick={() => {
                                    startNextPerformance(run.id);
                                    addToast({ title: `Night ${nextPerfNumber} started`, message: run.name, type: 'success' });
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold transition-all"
                                >
                                  <Plus className="w-3 h-3" />
                                  Night {nextPerfNumber}
                                </button>
                              )}
                              {!isComplete && (
                                <button
                                  onClick={() => completeRun(run.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-show-border text-slate-600 hover:text-green-400 hover:border-green-500/30 text-xs font-semibold transition-all"
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  Complete Run
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => deleteRun(run.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-show-border text-slate-700 hover:text-red-400 hover:border-red-500/30 text-xs transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete Run
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
        </div>
      </div>

      {/* Standalone shows */}
      {standaloneShows.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              {sortedRuns.length > 0 ? 'Standalone Shows' : 'Show History'}
            </h2>
          </div>
          <div className="space-y-2">
            {standaloneShows.map((show, i) => {
              const totalMs = getTotalRunningMs(show, new Date());
              const isCurrent = show.id === currentShowId;
              const completedSegs = show.segments.filter(s => s.actualStart && s.actualEnd).length;
              const totalSegs = show.segments.length;

              return (
                <motion.div
                  key={show.id}
                  onClick={() => setCurrentShow(show.id)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`relative rounded-xl border p-4 transition-all cursor-pointer ${
                    isCurrent
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-show-border bg-show-card hover:border-amber-500/20'
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
                        onClick={e => { e.stopPropagation(); deleteShow(show.id); }}
                        className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {!isCurrent && (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-700" />
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
