import { useState, useRef, useEffect } from 'react';
import {
  DoorOpen, Home, Mic2, Coffee, Star, Flag, Circle,
  Play, Square, Pause, RotateCcw, Pencil, Trash2, ChevronDown, ChevronUp, GripVertical,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useShowStore } from '../store';
import type { Segment, TimeFormat } from '../types';
import { getSegmentStatus, getElapsedMs } from '../types';
import { useClock } from '../hooks/useClock';
import { formatTime, formatDuration, formatOverUnder } from '../utils/time';
import { scheduleIntervalNotification, getIntervalBackAtTime } from '../utils/notifications';
import TimeEditModal from './TimeEditModal';

const ICONS: Record<string, React.ElementType> = {
  doors: DoorOpen,
  house_open: Home,
  act: Mic2,
  interval: Coffee,
  curtain_call: Star,
  show_end: Flag,
  custom: Circle,
};

const TYPE_COLORS: Record<string, string> = {
  doors: 'bg-blue-400',
  house_open: 'bg-sky-400',
  act: 'bg-amber-400',
  interval: 'bg-purple-400',
  curtain_call: 'bg-yellow-300',
  show_end: 'bg-green-400',
  custom: 'bg-slate-400',
};

interface Props {
  showId: string;
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
        className="w-14 bg-show-surface border border-amber-500/50 rounded px-1.5 py-1 text-center text-sm font-mono tabular text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
        style={{ appearance: 'textfield' }}
      />
    );
  }

  return (
    <button
      onClick={() => { setRaw(value?.toString() ?? ''); setEditing(true); }}
      className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-slate-700 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all"
      title="Click to edit expected duration"
    >
      <span className="text-sm text-slate-500 group-hover:text-amber-400 transition-colors">Exp</span>
      <span className="font-mono text-sm font-semibold text-slate-400 group-hover:text-amber-300 transition-colors tabular">
        {value !== null ? `${value}` : '--'}
      </span>
      <span className="text-sm text-slate-600 group-hover:text-amber-500/70 transition-colors">min</span>
      <Pencil className="w-3 h-3 text-slate-700 group-hover:text-amber-500/60 transition-colors" />
    </button>
  );
}

export default function SegmentCard({ showId, segment, timeFormat, expectedStartAt }: Props) {
  const {
    startSegment, stopSegment, holdSegment, resumeSegment, removeSegment,
    settings, addToast, updateSegmentLabel, updateSegmentExpected, updateSegmentNotes,
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
  const status = getSegmentStatus(segment);
  const elapsedMs = getElapsedMs(segment, now);
  const isOnHold = status === 'active' && segment.holds.some(h => !h.endTime);
  const [editModal, setEditModal] = useState<'actualStart' | 'actualEnd' | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelVal, setLabelVal] = useState(segment.label);

  const Icon = ICONS[segment.type] ?? Circle;

  const expectedMs = segment.expectedDurationMinutes ? segment.expectedDurationMinutes * 60_000 : null;
  const overUnderMs = expectedMs !== null && status !== 'pending' ? elapsedMs - expectedMs : null;

  const backAt = segment.type === 'interval' && status === 'active' ? getIntervalBackAtTime(segment) : null;
  const backAtStr = backAt ? formatTime(backAt, timeFormat) : null;
  const countdownMs = backAt ? Math.max(0, backAt.getTime() - now.getTime()) : null;

  const isShowEnd = segment.type === 'show_end';

  function handleStart() {
    if (isShowEnd) {
      // Show end is a single timestamp — mark actualStart only; treat as instant complete
      startSegment(showId, segment.id);
      return;
    }
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

  const isActive = status === 'active';
  const isComplete = status === 'complete';

  const cardBorder = isActive ? 'border-amber-500/40' : isComplete ? 'border-green-500/20' : 'border-show-border';
  const cardBg = isActive ? 'bg-[#141a0a]' : 'bg-show-card';
  const accentBar = isActive ? 'bg-amber-500' : isComplete ? 'bg-green-500' : 'bg-show-border';

  return (
    <>
      <motion.div
        ref={setNodeRef}
        style={dragStyle}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: isDragging ? 0.6 : 1, y: 0 }}
        className={`relative rounded-xl border overflow-hidden transition-colors duration-300 ${cardBorder} ${cardBg} ${isActive ? 'glow-amber shadow-amber-glow' : 'shadow-card'}`}
      >
        {/* Left accent bar */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-all duration-300 ${accentBar}`} />

        <div className="pl-4 pr-4 py-3">
          {/* Main row */}
          <div className="flex items-center gap-2.5">
            {/* Drag handle — listeners only here so buttons still work */}
            <button
              {...attributes}
              {...listeners}
              className="shrink-0 cursor-grab active:cursor-grabbing text-slate-700 hover:text-slate-500 transition-colors touch-none"
              tabIndex={-1}
              aria-label="Drag to reorder"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>

            {/* Icon */}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              isActive ? 'bg-amber-500/15 text-amber-400' :
              isComplete ? 'bg-green-500/10 text-green-400' :
              'bg-show-surface text-slate-500'
            } transition-colors duration-300`}>
              <Icon className="w-3.5 h-3.5" />
            </div>

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
                    isActive ? 'text-amber-100' : isComplete ? 'text-slate-300' : 'text-slate-200'
                  } hover:text-amber-300`}
                >
                  {segment.label}
                </button>
              )}
            </div>

            {/* Times */}
            <div className="flex items-center gap-2 shrink-0">
              {isShowEnd ? (
                // Show End: single timestamp only
                isComplete ? (
                  <button
                    onClick={() => setEditModal('actualStart')}
                    className="font-mono text-base tabular text-green-400 hover:text-amber-300 transition-colors font-semibold"
                  >
                    {formatTime(segment.actualStart, timeFormat)}
                  </button>
                ) : expectedStartAt ? (
                  <span className="font-mono text-sm tabular font-medium text-slate-400 bg-show-surface border border-show-border px-2 py-0.5 rounded-md">
                    Est. {formatTime(expectedStartAt, timeFormat)}
                  </span>
                ) : null
              ) : (
                <>
                  <button
                    onClick={() => setEditModal('actualStart')}
                    className={`font-mono text-sm tabular transition-colors ${
                      segment.actualStart ? 'text-slate-300 hover:text-amber-300' : 'text-slate-700 hover:text-slate-500'
                    }`}
                  >
                    {segment.actualStart ? formatTime(segment.actualStart, timeFormat) : '--:--'}
                  </button>

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
                        className="font-mono text-sm tabular text-slate-300 hover:text-amber-300 transition-colors"
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

          {/* Second row: expected + over/under + interval back-at + actions */}
          <div className="flex items-center justify-between mt-2.5 pl-[38px]">
            {/* Left: expected time editor + over/under + expected start hint */}
            <div className="flex items-center gap-2 flex-wrap">
              {!isShowEnd && (
                <ExpectedMinInput
                  value={segment.expectedDurationMinutes}
                  onChange={v => updateSegmentExpected(showId, segment.id, v)}
                />
              )}

              {/* Expected start time for pending segments */}
              {status === 'pending' && !isShowEnd && expectedStartAt && !segment.actualStart && (
                <span className="text-sm font-mono tabular font-medium text-slate-400 bg-show-surface border border-show-border px-2 py-0.5 rounded-md">
                  Est. {formatTime(expectedStartAt, timeFormat)}
                </span>
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
                  Back at {backAtStr}
                  {countdownMs !== null && countdownMs > 0 && (
                    <span className="ml-1.5 opacity-70">({formatDuration(countdownMs)})</span>
                  )}
                </span>
              )}

              {isOnHold && (
                <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full animate-pulse">
                  ON HOLD
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
                      ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-glow'
                      : 'bg-amber-500 hover:bg-amber-400 text-show-base shadow-amber-glow-sm'
                  }`}
                >
                  {isShowEnd ? (
                    <>
                      <Flag className="w-3 h-3" />
                      Mark End
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 fill-current" />
                      Start
                    </>
                  )}
                </button>
              )}

              {isActive && (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-bold transition-all"
                >
                  <Square className="w-3 h-3 fill-current" />
                  End
                </button>
              )}

              {isComplete && (
                <button
                  onClick={() => setEditModal('actualEnd')}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-show-border hover:border-slate-600 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
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
          segment={segment}
          field={editModal}
          onClose={() => setEditModal(null)}
        />
      )}
    </>
  );
}
