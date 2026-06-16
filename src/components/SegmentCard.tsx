import { useState, useRef, useEffect } from 'react';
import {
  Play, Square, Pause, RotateCcw, Pencil, Trash2,
  ChevronDown, ChevronUp, GripVertical, Flag, Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useShowStore } from '../store';
import type { Segment, TimeFormat, SegmentType } from '../types';
import { getSegmentStatus, getElapsedMs } from '../types';
import { useClock } from '../hooks/useClock';
import { formatTime, formatDuration, formatOverUnder } from '../utils/time';
import { scheduleIntervalNotification, getIntervalBackAtTime } from '../utils/notifications';
import TimeEditModal from './TimeEditModal';
import { InlineHmPicker } from './TimePicker';

interface Props {
  showId: string;
  /** "yyyy-MM-dd" of the show — forwarded to TimeEditModal for overnight support. */
  dateAnchor: string;
  segment: Segment;
  timeFormat: TimeFormat;
  expectedStartAt?: Date | null;
}

function ExpectedMinInput({
  value, onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(value?.toString() ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const n = parseInt(raw, 10);
    onChange(isNaN(n) || n <= 0 ? null : n);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="1"
        max="999"
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commit(); }}
        className="w-14 bg-show-surface border border-amber-500/50 rounded px-1.5 py-1 text-center text-xs font-mono tabular text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
        style={{ appearance: 'textfield' }}
      />
    );
  }

  return (
    <button
      onClick={() => { setRaw(value?.toString() ?? ''); setEditing(true); }}
      className="group flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-slate-700 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all"
      title="Click to set expected duration"
    >
      <span className="text-xs text-slate-600 group-hover:text-amber-500/70 transition-colors">Exp</span>
      <span className="font-mono text-xs font-semibold text-slate-500 group-hover:text-amber-300 transition-colors tabular">
        {value !== null ? value : '--'}
      </span>
      <span className="text-xs text-slate-700 group-hover:text-amber-500/50 transition-colors">m</span>
    </button>
  );
}

export default function SegmentCard({ showId, dateAnchor, segment, timeFormat, expectedStartAt }: Props) {
  const {
    startSegment, stopSegment, holdSegment, resumeSegment, removeSegment,
    settings, addToast, updateSegmentLabel, updateSegmentExpected, updateSegmentNotes,
    updateSegmentSchedule,
  } = useShowStore();
  const now = useClock();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: segment.id,
  });
  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const status    = getSegmentStatus(segment);
  const elapsedMs = getElapsedMs(segment, now);
  const isOnHold  = status === 'active' && segment.holds.some(h => !h.endTime);
  const isActive  = status === 'active';
  const isComplete = status === 'complete';
  const isShowEnd  = segment.type === 'show_end';

  // Status-first left bar — wider (3px) and driven by live state, falls back to segment-type colour
  const leftBar = isActive && isOnHold
    ? 'border-l-[3px] border-l-purple-500'
    : isActive
    ? 'border-l-[3px] border-l-amber-500'
    : isComplete
    ? 'border-l-[3px] border-l-green-600/50'
    : segment.type === 'bump_in'   ? 'border-l-[3px] border-l-orange-500/40'
    : segment.type === 'bump_out'  ? 'border-l-[3px] border-l-rose-500/40'
    : segment.type === 'rehearsal' ? 'border-l-[3px] border-l-teal-500/40'
    : segment.type === 'plotting'  ? 'border-l-[3px] border-l-indigo-500/40'
    : 'border-l-[3px] border-l-white/5';

  const SCHEDULE_TYPES: Set<SegmentType> = new Set(['bump_in', 'bump_out', 'rehearsal', 'plotting', 'doors']);
  const showSchedule = SCHEDULE_TYPES.has(segment.type);

  const [editModal,    setEditModal]    = useState<'actualStart' | 'actualEnd' | null>(null);
  const [notesOpen,    setNotesOpen]    = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelVal,     setLabelVal]     = useState(segment.label);
  const [plannedField, setPlannedField] = useState<'plannedStart' | 'plannedEnd' | null>(null);

  const expectedMs  = segment.expectedDurationMinutes ? segment.expectedDurationMinutes * 60_000 : null;
  const overUnderMs = expectedMs !== null && status !== 'pending' ? elapsedMs - expectedMs : null;

  const backAt      = segment.type === 'interval' && status === 'active' ? getIntervalBackAtTime(segment) : null;
  const backAtStr   = backAt ? formatTime(backAt, timeFormat) : null;
  const countdownMs = backAt ? Math.max(0, backAt.getTime() - now.getTime()) : null;

  function handleStart() {
    startSegment(showId, segment.id);
    if (segment.type === 'interval') {
      scheduleIntervalNotification(
        { ...segment, actualStart: new Date().toISOString() },
        settings,
        timeFormat
      );
    }
  }

  function handleStop() {
    stopSegment(showId, segment.id);
    if (settings.autoStartNext) {
      addToast({ title: 'Next segment started', message: 'Timer auto-advanced to next segment', type: 'info' });
    }
  }

  function handleHoldToggle() {
    if (isOnHold) {
      resumeSegment(showId, segment.id);
      addToast({ title: 'Resumed', message: `${segment.label} running again`, type: 'info' });
    } else {
      holdSegment(showId, segment.id);
      addToast({ title: 'Hold', message: `${segment.label} paused`, type: 'warning' });
    }
  }

  // ── Cue light dot ────────────────────────────────────────────────────────────
  const cueDot = isActive && isOnHold
    ? 'bg-purple-500 animate-cue-hold'
    : isActive
    ? 'bg-amber-500 animate-cue-pulse'
    : isComplete
    ? 'bg-green-500/80'
    : 'bg-show-border';

  // ── Row background ───────────────────────────────────────────────────────────
  const rowBg = isActive
    ? 'bg-show-card-alt'
    : isComplete
    ? 'bg-transparent'
    : 'bg-transparent';

  return (
    <>
      <motion.div
        ref={setNodeRef}
        style={dragStyle}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: isDragging ? 0.55 : 1, y: 0 }}
        className={`relative border-b border-show-border last:border-b-0 transition-colors duration-300 ${rowBg} ${leftBar}`}
      >
        <div className="px-4 py-3">

          {/* ── Main row ────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2.5">

            {/* Cue light */}
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all duration-300 ${cueDot}`} />

            {/* Drag handle */}
            <button
              {...attributes}
              {...listeners}
              className="shrink-0 cursor-grab active:cursor-grabbing text-slate-800 hover:text-slate-600 transition-colors touch-none"
              tabIndex={-1}
              aria-label="Drag to reorder"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>

            {/* Label */}
            <div className="flex-1 min-w-0">
              {editingLabel ? (
                <input
                  autoFocus
                  value={labelVal}
                  onChange={e => setLabelVal(e.target.value)}
                  onBlur={() => { updateSegmentLabel(showId, segment.id, labelVal); setEditingLabel(false); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      updateSegmentLabel(showId, segment.id, labelVal);
                      setEditingLabel(false);
                    }
                  }}
                  className="bg-transparent border-b border-amber-500/50 text-slate-100 font-semibold text-sm focus:outline-none w-full"
                />
              ) : (
                <button
                  onDoubleClick={() => setEditingLabel(true)}
                  className={`text-left text-sm font-semibold transition-colors ${
                    isActive   ? 'text-amber-100' :
                    isComplete ? 'text-slate-400' :
                                 'text-slate-200'
                  } hover:text-amber-300`}
                >
                  {segment.label}
                </button>
              )}
            </div>

            {/* Times */}
            <div className="flex items-center gap-2 shrink-0">
              {isShowEnd ? (
                isComplete ? (
                  <button
                    onClick={() => setEditModal('actualStart')}
                    className="font-mono text-sm tabular text-green-400 hover:text-amber-300 transition-colors font-semibold"
                  >
                    {formatTime(segment.actualStart, timeFormat)}
                  </button>
                ) : expectedStartAt ? (
                  <span className="font-mono text-xs tabular font-medium text-slate-500 bg-show-surface border border-show-border px-2 py-0.5 rounded-md">
                    Est. {formatTime(expectedStartAt, timeFormat)}
                  </span>
                ) : null
              ) : (
                <>
                  {segment.actualStart ? (
                    <button
                      onClick={() => setEditModal('actualStart')}
                      className="font-mono text-sm tabular text-slate-300 hover:text-amber-300 transition-colors"
                    >
                      {formatTime(segment.actualStart, timeFormat)}
                    </button>
                  ) : expectedStartAt ? (
                    <span className="font-mono text-sm tabular text-slate-500">
                      ~{formatTime(expectedStartAt, timeFormat)}
                    </span>
                  ) : (
                    <button
                      onClick={() => setEditModal('actualStart')}
                      className="font-mono text-sm tabular text-slate-700 hover:text-slate-500 transition-colors"
                    >
                      --:--
                    </button>
                  )}

                  {isActive && (
                    <>
                      <span className="text-slate-700 text-xs">→</span>
                      <span className={`font-mono text-sm tabular font-bold ${isOnHold ? 'text-purple-400' : 'text-amber-400'}`}>
                        {formatDuration(elapsedMs)}
                      </span>
                    </>
                  )}

                  {isComplete && segment.actualEnd && (
                    <>
                      <span className="text-slate-700 text-xs">→</span>
                      <button
                        onClick={() => setEditModal('actualEnd')}
                        className="font-mono text-sm tabular text-slate-400 hover:text-amber-300 transition-colors"
                      >
                        {formatTime(segment.actualEnd, timeFormat)}
                      </button>
                      <span className="font-mono text-xs text-slate-600 tabular">
                        ({formatDuration(elapsedMs)})
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Planned schedule row (qualifying types only) ─────────────────── */}
          {showSchedule && (() => {
            const fmtPlanned = (hm: string | null) => {
              if (!hm) return null;
              const [h, m] = hm.split(':').map(Number);
              const d = new Date(); d.setHours(h, m, 0, 0);
              return formatTime(d, timeFormat);
            };
            const plannedDiff = (() => {
              if (!segment.plannedStart || !segment.plannedEnd) return null;
              const [sh, sm] = segment.plannedStart.split(':').map(Number);
              const [eh, em] = segment.plannedEnd.split(':').map(Number);
              let diffMin = (eh * 60 + em) - (sh * 60 + sm);
              if (diffMin < 0) diffMin += 1440;
              if (diffMin <= 0) return null;
              const h = Math.floor(diffMin / 60), m = diffMin % 60;
              return `${h > 0 ? `${h}h ` : ''}${m > 0 ? `${m}m` : ''}`.trim();
            })();

            const PlannedBtn = ({ field, label }: { field: 'plannedStart' | 'plannedEnd'; label: string }) => {
              const val = segment[field];
              const open = plannedField === field;
              return (
                <button
                  onClick={() => setPlannedField(open ? null : field)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors ${
                    open ? 'border-amber-500/50 bg-amber-500/5' : 'border-show-border hover:border-slate-600'
                  }`}
                  title={`Planned ${label.toLowerCase()}`}
                >
                  <span className="text-[9px] text-slate-600 uppercase tracking-wider">{label}</span>
                  <span className={`font-mono tabular ${val ? 'text-slate-300' : 'text-slate-600'}`}>
                    {fmtPlanned(val) ?? 'set'}
                  </span>
                </button>
              );
            };

            return (
              <div className="mt-2 pl-[46px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <Clock className="w-3 h-3 text-slate-600 shrink-0" />
                  <PlannedBtn field="plannedStart" label="Start" />
                  <span className="text-slate-700 text-xs">→</span>
                  <PlannedBtn field="plannedEnd" label="End" />
                  {plannedDiff && <span className="text-[10px] text-slate-600">{plannedDiff}</span>}
                </div>
                <AnimatePresence>
                  {plannedField && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.16 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-show-surface border border-show-border w-fit">
                        <InlineHmPicker
                          value={segment[plannedField] ?? ''}
                          format={timeFormat}
                          onChange={v => updateSegmentSchedule(showId, segment.id, plannedField, v || null)}
                        />
                        <div className="flex flex-col gap-1 ml-1">
                          {segment[plannedField] && (
                            <button
                              onClick={() => updateSegmentSchedule(showId, segment.id, plannedField, null)}
                              className="px-2 py-1 rounded text-[10px] text-slate-500 hover:text-red-400 border border-show-border transition-colors"
                            >
                              Clear
                            </button>
                          )}
                          <button
                            onClick={() => setPlannedField(null)}
                            className="px-2 py-1 rounded text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 transition-colors"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })()}

          {/* ── Second row: expected / over-under / back-at / actions ────────── */}
          <div className="flex items-center justify-between mt-2 pl-[46px]">

            {/* Left: metadata pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {!isShowEnd && (
                <ExpectedMinInput
                  value={segment.expectedDurationMinutes}
                  onChange={v => updateSegmentExpected(showId, segment.id, v)}
                />
              )}

              {overUnderMs !== null && Math.abs(overUnderMs) > 5000 && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  overUnderMs > 5 * 60_000
                    ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                    : overUnderMs > 0
                    ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                    : 'text-green-400 bg-green-500/10 border border-green-500/20'
                }`}>
                  {formatOverUnder(overUnderMs).sign}{formatOverUnder(overUnderMs).label}
                </span>
              )}

              {backAtStr && (
                <span className="text-xs font-medium text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                  Back {backAtStr}
                  {countdownMs !== null && countdownMs > 0 && (
                    <span className="ml-1.5 opacity-70">({formatDuration(countdownMs)})</span>
                  )}
                </span>
              )}

              {isOnHold && (
                <span className="text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full animate-pulse uppercase tracking-wide">
                  Hold
                </span>
              )}
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setNotesOpen(!notesOpen)}
                className="w-6 h-6 rounded flex items-center justify-center text-slate-700 hover:text-slate-400 transition-colors"
                title="Notes"
              >
                {notesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              <button
                onClick={() => removeSegment(showId, segment.id)}
                className="w-6 h-6 rounded flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors"
                title="Remove"
              >
                <Trash2 className="w-3 h-3" />
              </button>

              <div className="w-px h-4 bg-show-border mx-0.5" />

              {isActive && (
                <button
                  onClick={handleHoldToggle}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isOnHold
                      ? 'bg-purple-500 hover:bg-purple-400 text-white'
                      : 'border border-slate-700 hover:border-purple-500/50 text-slate-400 hover:text-purple-300'
                  }`}
                >
                  {isOnHold ? <RotateCcw className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  {isOnHold ? 'Resume' : 'Hold'}
                </button>
              )}

              {status === 'pending' && (
                <button
                  onClick={handleStart}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isShowEnd
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-show-base shadow-amber-glow-sm'
                  }`}
                >
                  {isShowEnd ? (
                    <><Flag className="w-3 h-3" />Mark End</>
                  ) : (
                    <><Play className="w-3 h-3 fill-current" />Start</>
                  )}
                </button>
              )}

              {isActive && (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-slate-100 text-xs font-bold transition-all"
                >
                  <Square className="w-3 h-3 fill-current" />
                  End
                </button>
              )}

              {isComplete && (
                <button
                  onClick={() => setEditModal('actualEnd')}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-show-border hover:border-slate-600 text-slate-600 hover:text-slate-300 text-xs transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* ── Notes ────────────────────────────────────────────────────────── */}
          <AnimatePresence>
            {notesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <textarea
                  value={segment.notes}
                  onChange={e => updateSegmentNotes(showId, segment.id, e.target.value)}
                  placeholder="Segment notes…"
                  rows={2}
                  className="mt-2.5 w-full bg-show-surface border border-show-border rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-700 focus:outline-none focus:border-amber-500/30 resize-none"
                />
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </motion.div>

      {editModal && (
        <TimeEditModal
          showId={showId}
          dateAnchor={dateAnchor}
          segment={segment}
          field={editModal}
          onClose={() => setEditModal(null)}
        />
      )}
    </>
  );
}
