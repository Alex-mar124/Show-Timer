import { RotateCcw, ChevronRight, Coffee, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import { useShowStore } from '../store';
import { useClock } from '../hooks/useClock';
import { getSegmentStatus, getElapsedMs } from '../types';
import type { Show, Segment, TimeFormat } from '../types';
import { formatTime, formatDuration } from '../utils/time';
import { getIntervalBackAtTime, scheduleIntervalNotification } from '../utils/notifications';

interface Props {
  show: Show;
  timeFormat: TimeFormat;
  expectedStarts: Map<string, Date | null>;
}

// ── Arc sizes ─────────────────────────────────────────────────────────────────
const SZ   = 148;
const CX   = 74;
const CY   = 74;
const R    = 56;
const CIRC = 2 * Math.PI * R; // ≈ 351.9

interface ArcProps {
  progress:  number;   // 0–1
  isOver:    boolean;
  strokeColor: string;
  elapsed:   string;
  remaining: string | null;
  remainingColor: string;
}

function Arc({ progress, isOver, strokeColor, elapsed, remaining, remainingColor }: ArcProps) {
  // Always show at least a tiny cap so the arc is visible from the first second
  const visible  = Math.max(progress, 0.015);
  const offset   = CIRC * (1 - visible);

  return (
    <div className="relative shrink-0" style={{ width: SZ, height: SZ }}>
      <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`}>
        {/* Track ring */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1c2b42" strokeWidth="7" />

        {/* Progress arc — CSS transition, no Framer Motion (WebKit WebView compatibility) */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={strokeColor}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${CX} ${CY})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease-in-out, stroke 0.4s ease' }}
        />

        {/* Outer pulsing ring when over */}
        {isOver && (
          <circle
            cx={CX} cy={CY} r={R + 8}
            fill="none"
            stroke="rgba(239,68,68,0.2)"
            strokeWidth="3"
          />
        )}
      </svg>

      {/* Text inside arc */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span
          className="font-mono text-xl font-semibold tabular leading-none"
          style={{ color: strokeColor }}
        >
          {elapsed}
        </span>
        {remaining && (
          <span
            className="text-[11px] font-semibold leading-none mt-0.5"
            style={{ color: remainingColor }}
          >
            {remaining}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export default function ActiveSegmentPanel({ show, timeFormat, expectedStarts }: Props) {
  const now = useClock();
  const { holdSegment, resumeSegment, advanceSegment, settings, addToast } = useShowStore();

  const segments    = [...show.segments].sort((a, b) => a.order - b.order);
  const found       = segments.find(s => getSegmentStatus(s) === 'active');
  if (!found) return null;

  const active: Segment = found;
  const activeIdx   = segments.indexOf(active);
  const next: Segment | undefined = segments.find((s, i) => i > activeIdx && !s.actualStart && s.type !== 'performance_start');

  const elapsedMs   = getElapsedMs(active, now);
  const isOnHold    = active.holds.some(h => !h.endTime);
  const expectedMs  = active.expectedDurationMinutes ? active.expectedDurationMinutes * 60_000 : null;
  const overUnderMs = expectedMs !== null ? elapsedMs - expectedMs : null;
  const isOver      = overUnderMs !== null && overUnderMs > 0;

  const isInterval  = active.type === 'interval';
  const backAt      = isInterval ? getIntervalBackAtTime(active) : null;
  const countdownMs = backAt ? Math.max(0, backAt.getTime() - now.getTime()) : null;

  // Estimated end time (clock time, not duration)
  const estimatedEnd = active.actualStart && expectedMs
    ? new Date(new Date(active.actualStart).getTime() + expectedMs)
    : null;

  // Arc progress
  const progress = expectedMs
    ? isInterval
      ? Math.max(0, 1 - elapsedMs / expectedMs) // drains as interval runs down
      : Math.min(elapsedMs / expectedMs, 1)       // fills as act progresses
    : 0;

  // Urgency — escalates arc colour and tally speed when < 5 min remain
  const remainingMs = expectedMs !== null && !isOver && !isInterval && !isOnHold
    ? Math.max(0, expectedMs - elapsedMs)
    : null;
  const isUrgent   = remainingMs !== null && remainingMs < 5 * 60_000;
  const isCritical = remainingMs !== null && remainingMs < 2 * 60_000;

  // Arc colours
  const strokeColor = isOnHold
    ? '#a855f7'
    : isOver
    ? '#ef4444'
    : isInterval
    ? '#a855f7'
    : isCritical
    ? '#ef4444'
    : isUrgent
    ? '#f97316'
    : active.type === 'pre_show'   ? '#4ade80'
    : active.type === 'changeover' ? '#38bdf8'
    : active.type === 'post_show'  ? '#f472b6'
    : active.type === 'bump_in'   ? '#84cc16'
    : active.type === 'bump_out'  ? '#f43f5e'
    : active.type === 'rehearsal' ? '#14b8a6'
    : active.type === 'plotting'  ? '#6366f1'
    : active.type === 'doors'     ? '#0ea5e9'
    : '#f59e0b';

  // Label inside arc: elapsed for acts, countdown for intervals
  const arcElapsed = isInterval && backAt
    ? formatDuration(countdownMs ?? 0)
    : formatDuration(elapsedMs);

  // Sublabel inside arc: readable remaining / over text — NO negative sign
  let arcRemaining: string | null = null;
  let arcRemainingColor = strokeColor;

  if (isInterval && backAt) {
    arcRemaining = 'remaining';
    arcRemainingColor = '#a855f7';
  } else if (isOver && overUnderMs !== null) {
    const absOver = Math.abs(overUnderMs);
    const m = Math.floor(absOver / 60000);
    const s = Math.floor((absOver % 60000) / 1000);
    arcRemaining = `+${m > 0 ? `${m}m` : `${s}s`} over`;
    arcRemainingColor = '#ef4444';
  } else if (expectedMs !== null && overUnderMs !== null && overUnderMs < 0) {
    const leftMs = Math.abs(overUnderMs);
    const m = Math.floor(leftMs / 60000);
    const s = Math.floor((leftMs % 60000) / 1000);
    arcRemaining = `${m > 0 ? `${m}m` : `${s}s`} left`;
    arcRemainingColor = isCritical ? '#ef4444' : isUrgent ? '#f97316' : '#64748b';
  }

  const nextLabel    = next?.label ?? null;
  const nextExpected = next ? expectedStarts.get(next.id) : null;

  function handleHold() {
    if (isOnHold) {
      resumeSegment(show.id, active.id);
      addToast({ title: 'Resumed', message: `${active.label} running`, type: 'info' });
    } else {
      holdSegment(show.id, active.id);
      addToast({ title: 'Hold', message: `${active.label} paused`, type: 'warning' });
    }
  }

  function handleNext() {
    advanceSegment(show.id, active.id);
    if (next?.type === 'interval' && next.expectedDurationMinutes) {
      scheduleIntervalNotification(
        { ...next, actualStart: new Date().toISOString() },
        settings,
        timeFormat
      );
    }
    addToast({
      title: next ? `Started: ${next.label}` : 'Segment ended',
      message: next ? '' : `${active.label} complete`,
      type: 'success',
    });
  }

  const panelBorder = isInterval ? 'border-purple-500/25' : 'border-amber-500/25';
  const panelBg     = isInterval ? 'bg-show-panel-alt'    : 'bg-show-card-alt';
  const panelGlow   = isInterval
    ? '0 0 0 1px rgba(168,85,247,0.08), 0 8px 32px rgba(168,85,247,0.12)'
    : '0 0 0 1px rgba(245,158,11,0.06), 0 8px 32px rgba(245,158,11,0.10)';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={`mx-6 mb-3 rounded-xl border overflow-hidden ${panelBorder} ${panelBg}${isOnHold ? ' hold-border-pulse' : ''}`}
      style={isOnHold ? undefined : { boxShadow: panelGlow }}
    >
      <div className="px-4 pt-3 pb-3">

        {/* ── Top row: tally light + name ──────────────────────────────────── */}
        <div className="flex items-center gap-2.5 mb-3">
          {/* Tally light — broadcast-style indicator */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              isOnHold   ? 'bg-purple-400 animate-pulse' :
              isCritical ? 'bg-red-500 tally-urgent'    :
              isInterval ? 'bg-purple-500 tally-active'  :
              'bg-amber-500 tally-active'
            }`} />
            <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${
              isOnHold  ? 'text-purple-400' :
              isInterval ? 'text-purple-400' :
              'text-amber-400'
            }`}>
              {isOnHold ? 'Hold' : isInterval ? 'Interval' : 'Live'}
            </span>
          </div>

          <span className="text-[10px] text-slate-800 select-none">·</span>

          <span className="text-sm font-semibold text-slate-100 truncate flex-1">{active.label}</span>

          <span className="text-[11px] text-slate-600 font-mono tabular shrink-0">
            {formatTime(active.actualStart, timeFormat)}
            {active.expectedDurationMinutes ? <span className="text-slate-700"> · {active.expectedDurationMinutes}m</span> : null}
          </span>
        </div>

        {/* ── Middle: arc (left) + estimated info (right) ───────────────────── */}
        <div className="flex items-center gap-4">

          {/* Arc */}
          <Arc
            progress={progress}
            isOver={isOver && !isInterval}
            strokeColor={strokeColor}
            elapsed={arcElapsed}
            remaining={arcRemaining}
            remainingColor={arcRemainingColor}
          />

          {/* Right info column */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Est. end time — the key number */}
            {estimatedEnd && !isOver && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">
                  {isInterval ? 'Back at' : 'Est. end'}
                </p>
                <p className={`text-2xl font-bold font-mono tabular leading-none ${
                  isInterval ? 'text-purple-300' : 'text-amber-300'
                }`}>
                  {formatTime(estimatedEnd, timeFormat)}
                </p>
              </div>
            )}

            {/* Interval "back at" with Coffee */}
            {isInterval && backAt && (
              <div className="flex items-center gap-1.5">
                <Coffee className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="text-sm font-semibold text-purple-200">
                  {formatTime(backAt, timeFormat)}
                </span>
                {countdownMs !== null && countdownMs <= 5 * 60_000 && (
                  <span className="text-xs text-red-400 font-semibold animate-pulse">
                    — {formatDuration(countdownMs)} left
                  </span>
                )}
              </div>
            )}

            {/* Over indicator — shown instead of est. end when running over */}
            {isOver && overUnderMs !== null && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Running over</p>
                <p className="text-2xl font-bold font-mono tabular leading-none text-red-400">
                  +{formatDuration(overUnderMs)}
                </p>
              </div>
            )}

            {/* Up next */}
            {next && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Up next</p>
                <p className="text-sm font-semibold text-slate-300 truncate">{next.label}</p>
                {nextExpected && (
                  <p className="text-xs text-slate-600 font-mono tabular">
                    Est. {formatTime(nextExpected, timeFormat)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Action row ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
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
              End segment <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

      </div>
    </motion.div>
  );
}
