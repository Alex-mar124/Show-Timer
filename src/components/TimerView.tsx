import { Plus, ChevronDown, RefreshCw, ChevronRight, ChevronUp } from 'lucide-react';
import AppLogo from './AppLogo';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useShowStore } from '../store';
import { useClock } from '../hooks/useClock';
import Clock from './Clock';
import SegmentCard from './SegmentCard';
import ActiveSegmentPanel from './ActiveSegmentPanel';
import ReportPanel from './ReportPanel';
import type { PerformanceType, DayType, SegmentType } from '../types';
import { getTotalRunningMs } from '../types';
import { formatDuration, formatDurationShort } from '../utils/time';
import { schedulePreShowNotifications } from '../utils/notifications';
import { computeExpectedStarts } from '../utils/schedule';

const PERF_TYPE_LABEL: Record<PerformanceType, string> = {
  matinee: 'Matinee', evening: 'Evening', other: 'Other',
};

export default function TimerView() {
  const {
    shows, runs, currentShowId, settings, reportOpen,
    setNewShowModalOpen, setNewRunModalOpen,
    addSegment, updateShowNotes, reorderSegments,
    syncTemplateFromShow, startNextPerformance, addToast,
  } = useShowStore();
  const now = useClock();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [nextTypePickerOpen, setNextTypePickerOpen] = useState(false);

  const show = shows.find(s => s.id === currentShowId) ?? null;
  const currentRun = show?.runId ? (runs.find(r => r.id === show.runId) ?? null) : null;

  // All hooks must be called before any conditional return
  const expectedStarts = useMemo(
    () => (show ? computeExpectedStarts(show) : new Map<string, Date | null>()),
    [show]
  );

  // Require 8px of movement before drag activates — prevents button click interference
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !show) return;
    const oldIndex = segments.findIndex(s => s.id === active.id);
    const newIndex = segments.findIndex(s => s.id === over.id);
    const reordered = arrayMove(segments, oldIndex, newIndex);
    reorderSegments(show.id, reordered.map(s => s.id));
  }

  if (!show) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <AppLogo size={72} className="mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-slate-200 mb-2">No Active Show</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Create a standalone show or a production run to start timing.
          </p>
          <div className="flex items-center gap-3 justify-center">
            <button
              onClick={() => setNewShowModalOpen(true)}
              className="px-5 py-2.5 rounded-xl border border-show-border hover:border-amber-500/30 text-slate-400 hover:text-amber-400 font-semibold text-sm transition-all"
            >
              + Single Show
            </button>
            <button
              onClick={() => setNewRunModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-show-base font-semibold text-sm transition-all shadow-amber-glow-sm"
            >
              + Production Run
            </button>
          </div>
        </div>
      </div>
    );
  }

  const segments = [...show.segments].sort((a, b) => a.order - b.order);
  const totalMs = getTotalRunningMs(show, now);

  // Expected show end = expected start of the show_end segment (or last segment)
  const showEndSeg = segments.find(s => s.type === 'show_end') ?? segments[segments.length - 1];
  const expectedEnd = showEndSeg ? (expectedStarts.get(showEndSeg.id) ?? null) : null;
  const totalExpectedMin = segments
    .filter(s => s.expectedDurationMinutes)
    .reduce((acc, s) => acc + (s.expectedDurationMinutes ?? 0), 0);

  const addTypes: Array<{ type: SegmentType; label: string }> = [
    { type: 'act',           label: 'Act' },
    { type: 'interval',      label: 'Interval' },
    { type: 'rehearsal',     label: 'Rehearsal' },
    { type: 'plotting',      label: 'Plotting Session' },
    { type: 'curtain_call',  label: 'Curtain Call' },
    { type: 'custom',        label: 'Custom' },
  ];

  return (
    <div className="flex flex-1 min-h-0">
      {/* Main panel */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <Clock timeFormat={settings.timeFormat} expectedEnd={expectedEnd} />

        {/* Show info bar */}
        <div className="px-6 pb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                {show.production}
              </p>
              {currentRun && show.performanceNumber && (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                  Night {show.performanceNumber}
                </span>
              )}
              {show.performanceType && (
                <span className="text-[10px] font-semibold text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                  {PERF_TYPE_LABEL[show.performanceType]}
                </span>
              )}
            </div>
            {currentRun && (
              <p className="text-[11px] text-slate-700 truncate">
                {currentRun.name}{currentRun.venue ? ` · ${currentRun.venue}` : ''}
              </p>
            )}
            {!currentRun && show.title !== show.production && show.title && (
              <p className="text-xs text-slate-600">{show.title}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {currentRun && (
              <button
                onClick={() => {
                  syncTemplateFromShow(currentRun.id, show.id);
                  addToast({ title: 'Template updated', message: 'Run template synced from tonight', type: 'success' });
                }}
                title="Sync run template from tonight's expected durations"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 border border-show-border transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            {show.plannedStartTime && (
              <button
                onClick={() => schedulePreShowNotifications(show.plannedStartTime!, settings, settings.timeFormat)}
                className="text-xs text-slate-600 hover:text-amber-400 transition-colors px-2 py-1 rounded-lg hover:bg-amber-500/5"
                title="Re-schedule pre-show notifications"
              >
                🔔
              </button>
            )}
          </div>
        </div>

        {/* Active segment overview */}
        <ActiveSegmentPanel
          show={show}
          timeFormat={settings.timeFormat}
          expectedStarts={expectedStarts}
        />

        {/* Segment list — draggable */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={segments.map(s => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {/* Cue-sheet container — individual rows have border-b */}
              <div className="rounded-xl border border-show-border overflow-hidden bg-show-card">
                {segments.map(seg => (
                  <SegmentCard
                    key={seg.id}
                    showId={show.id}
                    segment={seg}
                    timeFormat={settings.timeFormat}
                    expectedStartAt={expectedStarts.get(seg.id) ?? null}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Add segment */}
          <div className="mt-4 relative">
            <button
              onClick={() => setAddMenuOpen(!addMenuOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-show-border hover:border-amber-500/30 text-slate-600 hover:text-amber-400 text-xs font-medium transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Segment
              <ChevronDown className={`w-3 h-3 transition-transform ${addMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {addMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute top-full left-0 mt-1.5 z-20 bg-show-card border border-show-border rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden"
                >
                  {addTypes.map(({ type, label }) => (
                    <button
                      key={type}
                      onClick={() => { addSegment(show.id, type); setAddMenuOpen(false); }}
                      className="flex w-full items-center px-4 py-2.5 text-sm text-slate-300 hover:bg-show-hover hover:text-slate-100 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Total bar */}
        <div className="px-6 py-3 border-t border-show-border bg-show-surface flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 shrink-0">
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total Running</p>
              <p className="font-mono text-lg font-semibold text-slate-200 tabular">
                {formatDuration(totalMs)}
              </p>
            </div>
            {totalExpectedMin > 0 && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider">Expected</p>
                <p className="font-mono text-lg text-slate-500 tabular">
                  {formatDurationShort(totalExpectedMin)}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <input
              type="text"
              value={show.notes}
              onChange={e => updateShowNotes(show.id, e.target.value)}
              placeholder="Show notes…"
              className="bg-transparent border-b border-show-border text-xs text-slate-500 placeholder-slate-700 focus:outline-none focus:border-amber-500/30 min-w-0 flex-1 max-w-[160px]"
            />

            {/* Next Day button — shown when show is in an active run */}
            {currentRun && !currentRun.completedAt && (
              <div className="relative shrink-0">
                {nextTypePickerOpen && (
                  <div className="absolute bottom-full right-0 mb-2 bg-show-card border border-show-border rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden z-20 min-w-[180px]">
                    <p className="px-3 pt-2.5 pb-1 text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Next day type</p>

                    {/* Performance options */}
                    {currentRun.performanceType === null ? (
                      (['matinee', 'evening', 'other'] as PerformanceType[]).map(t => (
                        <button key={t} onClick={() => {
                          startNextPerformance(currentRun.id, t, 'performance');
                          setNextTypePickerOpen(false);
                          addToast({ title: `Night ${(show.performanceNumber ?? 0) + 1}`, message: PERF_TYPE_LABEL[t], type: 'success' });
                        }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-show-hover hover:text-slate-100 transition-colors">
                          <span className="w-2 h-2 rounded-full bg-amber-500/60 shrink-0" />
                          {PERF_TYPE_LABEL[t]}
                        </button>
                      ))
                    ) : (
                      <button onClick={() => {
                        startNextPerformance(currentRun.id, undefined, 'performance');
                        setNextTypePickerOpen(false);
                        addToast({ title: `Night ${(show.performanceNumber ?? 0) + 1} started`, message: currentRun.name, type: 'success' });
                      }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-show-hover hover:text-slate-100 transition-colors">
                        <span className="w-2 h-2 rounded-full bg-amber-500/60 shrink-0" />
                        Performance
                      </button>
                    )}

                    <div className="border-t border-show-border/50 my-1" />

                    {([
                      { dayType: 'rehearsal' as DayType, label: 'Rehearsal Day', color: 'bg-teal-500/60' },
                      { dayType: 'plotting'  as DayType, label: 'Plotting Session', color: 'bg-indigo-500/60' },
                    ]).map(opt => (
                      <button key={opt.dayType} onClick={() => {
                        startNextPerformance(currentRun.id, undefined, opt.dayType);
                        setNextTypePickerOpen(false);
                        addToast({ title: opt.label, message: currentRun.name, type: 'success' });
                      }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-show-hover hover:text-slate-100 transition-colors">
                        <span className={`w-2 h-2 rounded-full ${opt.color} shrink-0`} />
                        {opt.label}
                      </button>
                    ))}

                    <button onClick={() => setNextTypePickerOpen(false)}
                      className="flex w-full items-center px-4 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors border-t border-show-border">
                      Cancel
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setNextTypePickerOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold transition-all"
                >
                  Next Day
                  {nextTypePickerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Report panel */}
      <AnimatePresence>
        {reportOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="shrink-0 overflow-hidden"
            style={{ width: 260 }}
          >
            <ReportPanel show={show} timeFormat={settings.timeFormat} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
