import { Plus, ChevronDown, RefreshCw, ChevronRight, ChevronUp, Flag, Users, ListChecks, FileText } from 'lucide-react';
import AppLogo from './AppLogo';
import PeoplePanel from './PeoplePanel';
import ReportTab from './ReportTab';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useShowStore } from '../store';
import { useClock } from '../hooks/useClock';
import Clock from './Clock';
import SegmentCard from './SegmentCard';
import ActiveSegmentPanel from './ActiveSegmentPanel';
import type { PerformanceType, DayType, SegmentType } from '../types';
import { getTotalRunningMs, getShowTimeMs, getProductionSegmentMs, SHOW_CORE_TYPES, PRODUCTION_TYPES } from '../types';
import { formatDuration, formatDurationShort, formatTime } from '../utils/time';
import { schedulePreShowNotifications } from '../utils/notifications';
import { computeExpectedStarts } from '../utils/schedule';

const PERF_TYPE_LABEL: Record<PerformanceType, string> = {
  matinee: 'Matinee', evening: 'Evening', other: 'Other',
};

const DAY_TYPE_STYLE: Record<string, { label: string; cls: string }> = {
  bump_in:   { label: 'Bump In',          cls: 'text-orange-300 bg-orange-500/10' },
  rehearsal: { label: 'Rehearsal',        cls: 'text-teal-300 bg-teal-500/10' },
  plotting:  { label: 'Plotting Session', cls: 'text-indigo-300 bg-indigo-500/10' },
  bump_out:  { label: 'Bump Out',         cls: 'text-rose-300 bg-rose-500/10' },
};

export default function TimerView() {
  const {
    shows, runs, currentShowId, settings,
    setNewShowModalOpen, setNewRunModalOpen,
    addSegment, addShowFinish, updateShowNotes, reorderSegments,
    syncTemplateFromShow, startNextPerformance, addToast,
  } = useShowStore();
  const now = useClock();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [nextTypePickerOpen, setNextTypePickerOpen] = useState(false);
  const [showTab, setShowTab] = useState<'runsheet' | 'people' | 'report'>('runsheet');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const show = shows.find(s => s.id === currentShowId) ?? null;
  const currentRun = show?.runId ? (runs.find(r => r.id === show.runId) ?? null) : null;
  const runShows = currentRun ? shows.filter(s => s.runId === currentRun.id) : [];

  // All hooks must be called before any conditional return
  const expectedStarts = useMemo(
    () => (show ? computeExpectedStarts(show) : new Map<string, Date | null>()),
    [show]
  );

  // Require 8px of movement before drag activates — prevents button click interference
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
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
  const showTimeMs = getShowTimeMs(show, now);
  const productionMs = getProductionSegmentMs(show, now);
  const hasShowSegs = segments.some(s => SHOW_CORE_TYPES.has(s.type));
  const hasProdSegs = segments.some(s => PRODUCTION_TYPES.has(s.type));

  // Expected show end = expected start of the show_end segment (or last segment)
  const showEndSeg = segments.find(s => s.type === 'show_end') ?? segments[segments.length - 1];
  const expectedEnd = showEndSeg ? (expectedStarts.get(showEndSeg.id) ?? null) : null;
  const totalExpectedMin = segments
    .filter(s => s.expectedDurationMinutes)
    .reduce((acc, s) => acc + (s.expectedDurationMinutes ?? 0), 0);

  const addTypes: Array<{ type: SegmentType; label: string; group?: string }> = [
    { type: 'act',           label: 'Act',              group: 'show' },
    { type: 'interval',      label: 'Interval',         group: 'show' },
    { type: 'curtain_call',  label: 'Curtain Call',     group: 'show' },
    { type: 'custom',        label: 'Custom',           group: 'show' },
    { type: 'bump_in',       label: 'Bump In',          group: 'other' },
    { type: 'rehearsal',     label: 'Rehearsal',        group: 'other' },
    { type: 'plotting',      label: 'Plotting Session', group: 'other' },
    { type: 'bump_out',      label: 'Bump Out',         group: 'other' },
  ];

  const isNonPerfDay = !!show?.dayType && show.dayType !== 'performance';
  const hasShowFinish = segments.some(s => s.type === 'show_end');

  function segmentZone(type: SegmentType): 'pre' | 'show' | 'post' {
    if (type === 'bump_out') return 'post';
    if (PRODUCTION_TYPES.has(type)) return 'pre';
    return 'show';
  }

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
              {currentRun && show.performanceNumber && !isNonPerfDay && (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                  Night {show.performanceNumber}
                </span>
              )}
              {show.dayType && DAY_TYPE_STYLE[show.dayType] && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${DAY_TYPE_STYLE[show.dayType].cls}`}>
                  {DAY_TYPE_STYLE[show.dayType].label}
                </span>
              )}
              {show.performanceType && !isNonPerfDay && (
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

        {/* Within-show tabs: Run Sheet · People */}
        <div className="px-6 pb-3">
          <div className="inline-flex items-center bg-show-card rounded-xl border border-show-border p-1 gap-0.5">
            {([
              { id: 'runsheet' as const, Icon: ListChecks, label: 'Run Sheet' },
              { id: 'people'   as const, Icon: Users,      label: 'People' },
              { id: 'report'   as const, Icon: FileText,   label: 'Report' },
            ]).map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => setShowTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  showTab === id ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' : 'text-slate-600 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {id === 'people' && show.staff.length > 0 && (
                  <span className="ml-0.5 text-[10px] font-bold text-amber-400/80">{show.staff.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {showTab === 'people' && (
          <PeoplePanel show={show} timeFormat={settings.timeFormat} />
        )}

        {showTab === 'report' && (
          <ReportTab show={show} run={currentRun} runShows={runShows} />
        )}

        {showTab === 'runsheet' && (<>
        {/* Active segment overview */}
        <ActiveSegmentPanel
          show={show}
          timeFormat={settings.timeFormat}
          expectedStarts={expectedStarts}
        />

        {/* Segment list — always draggable */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDraggingId(null)}
          >
            <SortableContext
              items={segments.map(s => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="rounded-xl border border-show-border overflow-hidden bg-show-card">
                {segments.map((seg, i) => {
                  const prevZone = i > 0 ? segmentZone(segments[i - 1].type) : null;
                  const currZone = segmentZone(seg.type);
                  const showShowDivider  = prevZone !== null && prevZone !== 'show'  && currZone === 'show';
                  const showPostDivider  = prevZone !== null && prevZone !== 'post'  && currZone === 'post';
                  return (
                    <div key={seg.id}>
                      {showShowDivider && (
                        <div className="flex items-center gap-3 px-4 py-1.5 bg-show-surface/60 border-b border-show-border">
                          <div className="h-px flex-1 bg-amber-500/20" />
                          <span className="text-[9px] font-bold text-amber-500/50 uppercase tracking-[0.2em]">Show</span>
                          <div className="h-px flex-1 bg-amber-500/20" />
                        </div>
                      )}
                      {showPostDivider && (
                        <div className="flex items-center gap-3 px-4 py-1.5 bg-show-surface/60 border-b border-show-border">
                          <div className="h-px flex-1 bg-rose-500/20" />
                          <span className="text-[9px] font-bold text-rose-500/50 uppercase tracking-[0.2em]">Post-Show</span>
                          <div className="h-px flex-1 bg-rose-500/20" />
                        </div>
                      )}
                      <div className={draggingId === seg.id ? 'ring-1 ring-amber-500/40 ring-inset' : ''}>
                        <SegmentCard
                          showId={show.id}
                          segment={seg}
                          timeFormat={settings.timeFormat}
                          expectedStartAt={expectedStarts.get(seg.id) ?? null}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SortableContext>

            {/* Floating preview of the segment being dragged */}
            <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2,0,0,1)' }}>
              {draggingId ? (() => {
                const seg = segments.find(s => s.id === draggingId);
                if (!seg) return null;
                const est = expectedStarts.get(seg.id) ?? null;
                return (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/50 bg-show-card shadow-[0_12px_40px_rgba(0,0,0,0.6)] cursor-grabbing">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-sm font-semibold text-amber-100 flex-1">{seg.label}</span>
                    <span className="font-mono text-xs tabular text-slate-400">
                      {seg.actualStart ? formatTime(seg.actualStart, settings.timeFormat)
                        : est ? `~${formatTime(est, settings.timeFormat)}` : '--:--'}
                    </span>
                  </div>
                );
              })() : null}
            </DragOverlay>
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
                  className="absolute top-full left-0 mt-1.5 z-20 bg-show-card border border-show-border rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden min-w-[180px]"
                >
                  <p className="px-3 pt-2.5 pb-1 text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Show</p>
                  {addTypes.filter(t => t.group === 'show').map(({ type, label }) => (
                    <button
                      key={type}
                      onClick={() => { addSegment(show.id, type); setAddMenuOpen(false); }}
                      className="flex w-full items-center px-4 py-2.5 text-sm text-slate-300 hover:bg-show-hover hover:text-slate-100 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                  {!hasShowFinish && (
                    <button
                      onClick={() => { addShowFinish(show.id); setAddMenuOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-green-300 hover:bg-show-hover hover:text-green-200 transition-colors"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      Show Finish
                    </button>
                  )}
                  <div className="border-t border-show-border/50 my-1" />
                  <p className="px-3 pt-1.5 pb-1 text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Production</p>
                  {addTypes.filter(t => t.group === 'other').map(({ type, label }) => (
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
            {hasShowSegs && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider">{hasProdSegs ? 'Show' : 'Total Running'}</p>
                <p className="font-mono text-lg font-semibold text-amber-400 tabular">
                  {formatDuration(showTimeMs)}
                </p>
              </div>
            )}
            {hasProdSegs && !hasShowSegs && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total Running</p>
                <p className="font-mono text-lg font-semibold text-slate-200 tabular">
                  {formatDuration(totalMs)}
                </p>
              </div>
            )}
            {hasProdSegs && hasShowSegs && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider">Production</p>
                <p className="font-mono text-lg font-semibold text-orange-400 tabular">
                  {formatDuration(productionMs)}
                </p>
              </div>
            )}
            {totalExpectedMin > 0 && hasShowSegs && (
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
                      { dayType: 'bump_in'   as DayType, label: 'Bump In',          color: 'bg-orange-500/60' },
                      { dayType: 'rehearsal' as DayType, label: 'Rehearsal',         color: 'bg-teal-500/60' },
                      { dayType: 'plotting'  as DayType, label: 'Plotting Session',  color: 'bg-indigo-500/60' },
                      { dayType: 'bump_out'  as DayType, label: 'Bump Out',          color: 'bg-rose-500/60' },
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
        </>)}
      </div>
    </div>
  );
}
