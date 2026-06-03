import { Plus, Theater, ChevronDown } from 'lucide-react';
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
import type { SegmentType } from '../types';
import { getTotalRunningMs } from '../types';
import { formatDuration, formatDurationShort } from '../utils/time';
import { schedulePreShowNotifications } from '../utils/notifications';
import { computeExpectedStarts } from '../utils/schedule';

export default function TimerView() {
  const { shows, currentShowId, settings, reportOpen, setNewShowModalOpen, addSegment, updateShowNotes, reorderSegments } = useShowStore();
  const now = useClock();
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const show = shows.find(s => s.id === currentShowId) ?? null;

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
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5">
            <Theater className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-200 mb-2">No Active Show</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Create a new show to start timing. Your acts, intervals, and all time events will be recorded here.
          </p>
          <button
            onClick={() => setNewShowModalOpen(true)}
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-show-base font-semibold text-sm transition-all shadow-amber-glow-sm"
          >
            + New Show
          </button>
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
    { type: 'act', label: 'Add Act' },
    { type: 'interval', label: 'Add Interval' },
    { type: 'curtain_call', label: 'Add Curtain Call' },
    { type: 'custom', label: 'Add Custom' },
  ];

  return (
    <div className="flex flex-1 min-h-0">
      {/* Main panel */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <Clock timeFormat={settings.timeFormat} expectedEnd={expectedEnd} />

        {/* Show info bar */}
        <div className="px-6 pb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              {show.production}
            </p>
            {show.title !== show.production && show.title && (
              <p className="text-xs text-slate-600">{show.title}</p>
            )}
          </div>
          {show.plannedStartTime && (
            <button
              onClick={() => schedulePreShowNotifications(show.plannedStartTime!, settings, settings.timeFormat)}
              className="text-xs text-slate-600 hover:text-amber-400 transition-colors px-2 py-1 rounded-lg hover:bg-amber-500/5"
              title="Re-schedule pre-show notifications"
            >
              🔔 Notifications set
            </button>
          )}
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
              <div className="space-y-2">
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
        <div className="px-6 py-3 border-t border-show-border bg-show-surface flex items-center justify-between">
          <div className="flex items-center gap-4">
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
          <div className="max-w-xs">
            <input
              type="text"
              value={show.notes}
              onChange={e => updateShowNotes(show.id, e.target.value)}
              placeholder="Show notes…"
              className="bg-transparent border-b border-show-border text-xs text-slate-500 placeholder-slate-700 focus:outline-none focus:border-amber-500/30 w-full"
            />
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
