import { RotateCcw, ChevronRight, Coffee, Pause } from 'lucide-react';
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

// ── SVG arc that fills clockwise ──────────────────────────────────────────────
const ARC_SIZE = 144;
const ARC_CX   = 72;
const ARC_CY   = 72;
const ARC_R    = 54;
const ARC_CIRC = 2 * Math.PI * ARC_R; // ≈ 339.3

interface ArcProps {
  progress: number;   // 0–1, clamped for arc fill; can be >1 to signal "over"
  isOver: boolean;
  color: string;      // tailwind stroke colour via inline style
  label: string;      // time string shown inside
  sublabel?: string;  // over/under or "remaining"
  sublabelColor?: string;
}

function ProgressArc({ progress, isOver, color, label, sublabel, sublabelColor }: ArcProps) {
  const clamped = Math.min(progress, 1);
  const dashOffset = ARC_CIRC * (1 - clamped);

  return (
    <div className="relative shrink-0" style={{ width: ARC_SIZE, height: ARC_SIZE }}>
      <svg width={ARC_SIZE} height={ARC_SIZE} viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE}`} className="block">
        {/* Track */}
        <circle
          cx={ARC_CX} cy={ARC_CY} r={ARC_R}
          fill="none"
          stroke="#1c2b42"
          strokeWidth="7"
        />
        {/* Progress fill */}
        <motion.circle
          cx={ARC_CX} cy={ARC_CY} r={ARC_R}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={ARC_CIRC}
          transform={`rotate(-90 ${ARC_CX} ${ARC_CY})`}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          style={{ strokeDashoffset: dashOffset }}
        />
        {/* Secondary "over" ring — thin red pulse outside the main arc */}
        {isOver && (
          <circle
            cx={ARC_CX} cy={ARC_CY} r={ARC_R + 7}
            fill="none"
            stroke="rgba(239,68,68,0.25)"
            strokeWidth="3"
          />
        )}
      </svg>

      {/* Inner text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p
          className="font-mono text-xl font-light tabular leading-none"
          style={{ color }}
        >
          {label}
        </p>
        {sublabel && (
          <p className="text-xs font-semibold mt-1" style={{ color: sublabelColor ?? color }}>
            {sublabel}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export default function ActiveSegmentPanel({ show, timeFormat, expectedStarts }: Props) {
  const now = useClock();
  const { holdSegment, resumeSegment, advanceSegment, settings, addToast } = useShowStore();

  const segments     = [...show.segments].sort((a, b) => a.order - b.order);
  const found        = segments.find(s => getSegmentStatus(s) === 'active');

  if (!found) return null;
  const activeSegment: Segment = found;

  const activeIndex  = segments.indexOf(activeSegment);
  const nextSegment: Segment | undefined = segments.find((s, i) => i > activeIndex && !s.actualStart);

  const elapsedMs  = getElapsedMs(activeSegment, now);
  const isOnHold   = activeSegment.holds.some(h => !h.endTime);
  const expectedMs = activeSegment.expectedDurationMinutes
    ? activeSegment.expectedDurationMinutes * 60_000
    : null;
  const overUnderMs = expectedMs !== null ? elapsedMs - expectedMs : null;
  const isOver      = overUnderMs !== null && overUnderMs > 0;

  const isInterval  = activeSegment.type === 'interval';
  const backAt      = isInterval ? getIntervalBackAtTime(activeSegment) : null;
  const countdownMs = backAt ? Math.max(0, backAt.getTime() - now.getTime()) : null;

  const progress = expectedMs
    ? (isInterval && backAt
        ? Math.max(0, 1 - elapsedMs / expectedMs) // countdown for intervals
        : elapsedMs / expectedMs)
    : 0;

  // Arc colour
  const arcColor = isOnHold
    ? '#a855f7'
    : isOver
    ? '#ef4444'
    : isInterval
    ? '#a855f7'
    : '#f59e0b';

  // Arc label = elapsed for acts; countdown for intervals
  const arcLabel = isInterval && backAt
    ? formatDuration(countdownMs ?? 0)
    : formatDuration(elapsedMs);

  // Arc sublabel = over/under text or "remaining"
  const arcSublabel = isInterval && backAt
    ? 'remaining'
    : overUnderMs !== null && Math.abs(overUnderMs) > 5000
    ? `${formatOverUnder(overUnderMs).sign}${formatOverUnder(overUnderMs).label}`
    : undefined;

  const arcSublabelColor = isOver ? '#ef4444' : isInterval ? '#a855f7' : '#f59e0b';

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
      message: nextSegment ? '' : `${activeSegment.label} complete`,
      type: 'success',
    });
  }

  const nextLabel    = nextSegment?.label ?? null;
  const nextExpected = nextSegment ? expectedStarts.get(nextSegment.id) : null;

  // Panel border / background
  const panelBorder = isInterval ? 'border-purple-500/30' : 'border-amber-500/30';
  const panelBg     = isInterval ? 'bg-show-panel-alt'    : 'bg-show-card-alt';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={`mx-6 mb-3 rounded-xl border overflow-hidden ${panelBorder} ${panelBg}`}
    >
      <div className="px-4 py-3">

        {/* ── Row 1: info + arc ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-4">

          {/* Left: badge + name + meta */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 mb-1.5">
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

            {/* Interval back-at */}
            {isInterval && backAt && (
              <div className="mt-2 flex items-center gap-1.5">
                <Coffee className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="text-sm font-semibold text-purple-200">
                  Back at {formatTime(backAt, timeFormat)}
                </span>
                {countdownMs !== null && countdownMs <= 5 * 60_000 && (
                  <span className="text-xs text-red-400 font-semibold animate-pulse ml-1">
                    — {formatDuration(countdownMs)} left
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: arc progress */}
          <ProgressArc
            progress={progress}
            isOver={isOver && !isInterval}
            color={arcColor}
            label={arcLabel}
            sublabel={arcSublabel}
            sublabelColor={arcSublabelColor}
          />
        </div>

        {/* ── Row 2: action buttons ────────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-3">
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
          <p className="mt-2 text-xs text-slate-700">
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
