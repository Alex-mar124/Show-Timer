import { Pause, RotateCcw, ChevronRight, Coffee } from 'lucide-react';
import { motion } from 'framer-motion';
import { useShowStore } from '../store';
import { useClock } from '../hooks/useClock';
import { getSegmentStatus, getElapsedMs } from '../types';
import type { Show, Segment, TimeFormat } from '../types';
import { formatTime, formatDuration, formatOverUnder } from '../utils/time';
import { getIntervalBackAtTime, scheduleIntervalNotification } from '../utils/notifications';

interface Props {
  show: Show;
  timeFormat: TimeFormat;
  expectedStarts: Map<string, Date | null>;
}

export default function ActiveSegmentPanel({ show, timeFormat, expectedStarts }: Props) {
  const now = useClock();
  const { holdSegment, resumeSegment, advanceSegment, settings, addToast } = useShowStore();

  const segments = [...show.segments].sort((a, b) => a.order - b.order);
  const activeSegment = segments.find(s => getSegmentStatus(s) === 'active') ?? null;

  if (!activeSegment) return null;

  const activeIndex = segments.indexOf(activeSegment);
  const nextSegment: Segment | undefined = segments.find((s, i) => i > activeIndex && !s.actualStart);

  const elapsedMs = getElapsedMs(activeSegment, now);
  const isOnHold = activeSegment.holds.some(h => !h.endTime);
  const expectedMs = activeSegment.expectedDurationMinutes
    ? activeSegment.expectedDurationMinutes * 60_000
    : null;
  const overUnderMs = expectedMs !== null ? elapsedMs - expectedMs : null;

  const isInterval = activeSegment.type === 'interval';
  const backAt = isInterval ? getIntervalBackAtTime(activeSegment) : null;
  const countdownMs = backAt ? Math.max(0, backAt.getTime() - now.getTime()) : null;

  function handleHold() {
    if (isOnHold) {
      resumeSegment(show.id, activeSegment.id);
      addToast({ title: 'Resumed', message: `${activeSegment.label} running`, type: 'info' });
    } else {
      holdSegment(show.id, activeSegment.id);
      addToast({ title: 'Hold', message: `${activeSegment.label} paused`, type: 'warning' });
    }
  }

  function handleNext() {
    advanceSegment(show.id, activeSegment.id);
    if (nextSegment?.type === 'interval' && nextSegment.expectedDurationMinutes) {
      scheduleIntervalNotification(
        { ...nextSegment, actualStart: new Date().toISOString() },
        settings,
        timeFormat
      );
    }
    addToast({
      title: nextSegment ? `Started: ${nextSegment.label}` : 'Segment ended',
      message: nextSegment ? '' : activeSegment.label + ' complete',
      type: 'success',
    });
  }

  const nextLabel = nextSegment?.label ?? null;
  const nextExpected = nextSegment ? expectedStarts.get(nextSegment.id) : null;

  // Colour theming per segment type
  const accentClass = isInterval
    ? 'border-l-purple-500 bg-[#0e0a18]'
    : 'border-l-amber-500 bg-[#141a0a]';
  const elapsedColor = isInterval
    ? (isOnHold ? 'text-purple-400' : 'text-purple-300')
    : (isOnHold ? 'text-purple-400' : 'text-amber-400');

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={`mx-6 mb-3 rounded-xl border border-l-4 overflow-hidden ${accentClass} ${
        isInterval ? 'border-purple-500/30' : 'border-amber-500/40'
      } ${isInterval ? '' : 'shadow-amber-glow'}`}
    >
      <div className="px-4 py-3">
        {/* Row 1: label + big elapsed */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Segment type badge + name */}
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                isInterval
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}>
                {isInterval ? 'Interval' : 'Live'}
              </span>
              {isOnHold && (
                <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 animate-pulse">
                  Hold
                </span>
              )}
            </div>
            <h3 className="text-xl font-bold text-slate-100 leading-tight truncate">
              {activeSegment.label}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Started {formatTime(activeSegment.actualStart, timeFormat)}
              {activeSegment.expectedDurationMinutes && ` · Exp ${activeSegment.expectedDurationMinutes}m`}
            </p>
          </div>

          {/* Elapsed / countdown */}
          <div className="text-right shrink-0">
            {isInterval && backAt ? (
              <>
                <p className={`font-mono text-3xl font-light tabular leading-none ${elapsedColor}`}>
                  {formatDuration(countdownMs ?? 0)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  remaining
                </p>
              </>
            ) : (
              <>
                <p className={`font-mono text-3xl font-light tabular leading-none ${elapsedColor}`}>
                  {formatDuration(elapsedMs)}
                </p>
                {overUnderMs !== null && Math.abs(overUnderMs) > 5000 && (
                  <p className={`text-xs font-semibold mt-1 ${
                    overUnderMs > 5 * 60_000 ? 'text-red-400' :
                    overUnderMs > 0 ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    {formatOverUnder(overUnderMs).sign}{formatOverUnder(overUnderMs).label}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Interval: "Back at" display */}
        {isInterval && backAt && (
          <div className="mt-2 flex items-center gap-2">
            <Coffee className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-sm font-semibold text-purple-200">
              Back at {formatTime(backAt, timeFormat)}
            </span>
            {countdownMs !== null && countdownMs <= 5 * 60_000 && (
              <span className="text-xs text-red-400 font-semibold animate-pulse">
                — {formatDuration(countdownMs)} left
              </span>
            )}
          </div>
        )}

        {/* Row 2: action buttons */}
        <div className="flex items-center justify-between mt-3">
          {/* Hold / Resume */}
          <button
            onClick={handleHold}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
              isOnHold
                ? 'bg-purple-500 hover:bg-purple-400 text-white border-purple-400'
                : 'border-show-border text-slate-500 hover:text-slate-300 hover:border-slate-600'
            }`}
          >
            {isOnHold ? <RotateCcw className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isOnHold ? 'Resume' : 'Hold'}
          </button>

          {/* Next segment */}
          {nextLabel ? (
            <button
              onClick={handleNext}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                isInterval
                  ? 'bg-purple-600 hover:bg-purple-500 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-show-base shadow-amber-glow-sm'
              }`}
            >
              {isInterval ? 'Start ' : 'End & go to '}
              <span className="max-w-[120px] truncate">{nextLabel}</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-all"
            >
              End segment
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Up next hint */}
        {nextSegment && (
          <p className="mt-2 text-[11px] text-slate-700">
            Up next: <span className="text-slate-500">{nextSegment.label}</span>
            {nextExpected && (
              <span className="text-slate-700"> · Est. {formatTime(nextExpected, timeFormat)}</span>
            )}
          </p>
        )}
      </div>
    </motion.div>
  );
}
