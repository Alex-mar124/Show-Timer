import { useState } from 'react';
import { X, Plus, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AppLogo from './AppLogo';
import { useShowStore } from '../store';
import { todayISO } from '../utils/time';
import { CompactTimePicker } from './TimePicker';
import type { SegmentType, TemplateSegment, PerformanceType, CopyStrategy, DayType } from '../types';

function uid() { return crypto.randomUUID(); }

const TYPE_LABELS: Record<SegmentType, string> = {
  pre_show: 'Pre Show',
  performance_start: 'Performance Block', changeover: 'Changeover',
  doors: 'Doors Open', house_open: 'House Open', act: 'Act',
  interval: 'Interval', curtain_call: 'Curtain Call',
  show_end: 'Show End', custom: 'Custom',
  rehearsal: 'Rehearsal', plotting: 'Plotting Session',
  bump_in: 'Bump In', bump_out: 'Bump Out',
  post_show: 'Post Show',
};

const FIRST_DAY_OPTIONS: Array<{ value: DayType; label: string; desc: string }> = [
  { value: 'performance', label: 'Performance',      desc: 'Jump straight to a live show' },
  { value: 'bump_in',     label: 'Bump In',          desc: 'Load-in and rigging day' },
  { value: 'rehearsal',   label: 'Rehearsal',        desc: 'Full company rehearsal' },
  { value: 'plotting',    label: 'Plotting Session', desc: 'Lighting/sound focus & plot' },
  { value: 'bump_out',    label: 'Bump Out',         desc: 'Strike and load-out' },
];

const DEFAULT_DURATIONS: Partial<Record<SegmentType, number>> = {
  doors: 30, act: 55, interval: 20, curtain_call: null as unknown as number,
  rehearsal: 90, plotting: 120,
};

function defaultTemplateSegments(): TemplateSegment[] {
  return [
    { id: uid(), type: 'doors',    label: 'Doors',    expectedDurationMinutes: 30, order: 0 },
    { id: uid(), type: 'act',      label: 'Act 1',    expectedDurationMinutes: 55, order: 1 },
    { id: uid(), type: 'interval', label: 'Interval', expectedDurationMinutes: 20, order: 2 },
    { id: uid(), type: 'act',      label: 'Act 2',    expectedDurationMinutes: 55, order: 3 },
    // v2: Show Finish is added manually during the run, not baked into the template.
  ];
}

interface SegmentRowProps {
  seg: TemplateSegment;
  onUpdate: (updated: TemplateSegment) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function SegmentRow({ seg, onUpdate, onRemove, canRemove }: SegmentRowProps) {
  function changeType(type: SegmentType) {
    onUpdate({
      ...seg,
      type,
      label: TYPE_LABELS[type],
      expectedDurationMinutes: DEFAULT_DURATIONS[type] ?? null,
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={seg.type}
        onChange={e => changeType(e.target.value as SegmentType)}
        className="flex-shrink-0 bg-show-surface border border-show-border rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500/50 transition-colors"
      >
        {(Object.keys(TYPE_LABELS) as SegmentType[]).map(t => (
          <option key={t} value={t}>{TYPE_LABELS[t]}</option>
        ))}
      </select>

      <input
        type="text"
        value={seg.label}
        onChange={e => onUpdate({ ...seg, label: e.target.value })}
        placeholder="Label"
        className="flex-1 min-w-0 bg-show-surface border border-show-border rounded-lg px-2 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors"
      />

      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={1}
          max={999}
          value={seg.expectedDurationMinutes ?? ''}
          onChange={e => {
            const n = parseInt(e.target.value, 10);
            onUpdate({ ...seg, expectedDurationMinutes: isNaN(n) ? null : n });
          }}
          placeholder="—"
          className="w-12 bg-show-surface border border-show-border rounded-lg px-2 py-1.5 text-xs text-amber-400 text-center focus:outline-none focus:border-amber-500/50 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[10px] text-slate-700">m</span>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="w-6 h-6 flex items-center justify-center rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

interface ScheduledDay {
  id: string;
  date: string;
  dayType: DayType;
  performanceType: PerformanceType | null;
}

const DAY_TYPE_OPTIONS: Array<{ value: DayType; label: string }> = [
  { value: 'performance', label: 'Performance' },
  { value: 'bump_in',     label: 'Bump In' },
  { value: 'rehearsal',   label: 'Rehearsal' },
  { value: 'plotting',    label: 'Plotting' },
  { value: 'bump_out',    label: 'Bump Out' },
];

function nextDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

export default function RunSetupModal() {
  const { newRunModalOpen, setNewRunModalOpen, createRun, settings } = useShowStore();

  const [production, setProduction] = useState('');
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [performanceType, setPerformanceType] = useState<PerformanceType | null>(null);
  const [firstDayType, setFirstDayType] = useState<DayType>('performance');
  const [copyStrategy, setCopyStrategy] = useState<CopyStrategy>('template');
  const [doorsTime, setDoorsTime] = useState('');
  const [showStartTime, setShowStartTime] = useState('');
  const [firstDate, setFirstDate] = useState(todayISO());
  const [templateSegs, setTemplateSegs] = useState<TemplateSegment[]>(defaultTemplateSegments);
  const [scheduledDays, setScheduledDays] = useState<ScheduledDay[]>([]);

  function reset() {
    setProduction(''); setName(''); setVenue('');
    setPerformanceType(null); setFirstDayType('performance'); setCopyStrategy('template');
    setDoorsTime(''); setShowStartTime('');
    setFirstDate(todayISO());
    setTemplateSegs(defaultTemplateSegments());
    setScheduledDays([]);
  }

  function addScheduledDay(sameDay = false) {
    const lastDay = scheduledDays.length > 0 ? scheduledDays[scheduledDays.length - 1] : null;
    const lastDate = lastDay?.date ?? firstDate;
    setScheduledDays(prev => [...prev, {
      id: crypto.randomUUID(),
      date: sameDay ? lastDate : nextDate(lastDate),
      dayType: 'performance',
      performanceType: sameDay ? 'evening' : null,
    }]);
  }

  function updateScheduledDay(id: string, patch: Partial<ScheduledDay>) {
    setScheduledDays(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  }

  function removeScheduledDay(id: string) {
    setScheduledDays(prev => prev.filter(d => d.id !== id));
  }

  function close() { setNewRunModalOpen(false); reset(); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!production.trim()) return;
    const orderedSegs = templateSegs.map((s, i) => ({ ...s, order: i }));
    createRun({
      name: name.trim() || production.trim(),
      production: production.trim(),
      venue: venue.trim(),
      performanceType,
      firstDayType,
      copyStrategy,
      defaultDoorsTime: doorsTime,
      defaultShowStartTime: showStartTime,
      templateSegments: orderedSegs,
      firstShowDate: firstDate,
      scheduledDays: scheduledDays.map(d => ({ date: d.date, dayType: d.dayType, performanceType: d.performanceType })),
    });
    reset();
  }

  function addSegment() {
    setTemplateSegs(prev => [
      ...prev,
      { id: uid(), type: 'act', label: 'Act', expectedDurationMinutes: 55, order: prev.length },
    ]);
  }

  function updateSeg(id: string, updated: TemplateSegment) {
    setTemplateSegs(prev => prev.map(s => s.id === id ? updated : s));
  }

  function removeSeg(id: string) {
    setTemplateSegs(prev => prev.filter(s => s.id !== id));
  }

  const perfTypeOptions: Array<{ value: PerformanceType | null; label: string }> = [
    { value: null,        label: 'Not specified' },
    { value: 'matinee',  label: 'Matinee' },
    { value: 'evening',  label: 'Evening' },
    { value: 'other',    label: 'Other' },
  ];

  return (
    <AnimatePresence>
      {newRunModalOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />

          <motion.div
            className="relative z-10 w-full max-w-lg mx-4 max-h-[90vh] flex flex-col"
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="rounded-2xl border border-show-border bg-show-card shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-show-border shrink-0">
                <div className="flex items-center gap-3">
                  <AppLogo size={36} />
                  <div>
                    <h2 className="text-lg font-semibold text-slate-100">New Production Run</h2>
                    <p className="text-xs text-slate-600">Group multiple performances of the same show</p>
                  </div>
                </div>
                <button onClick={close} className="w-8 h-8 rounded-lg hover:bg-show-hover flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
                <div className="p-6 space-y-5">

                  {/* Production Info */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Production</p>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                        Production Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={production}
                        onChange={e => setProduction(e.target.value)}
                        placeholder="e.g. Hamilton"
                        required
                        className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                          Run Name <span className="normal-case text-slate-600">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          placeholder={production || 'e.g. Summer Season'}
                          className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Venue</label>
                        <input
                          type="text"
                          value={venue}
                          onChange={e => setVenue(e.target.value)}
                          placeholder="e.g. Lyric Theatre"
                          className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Schedule</p>

                    {/* First day type */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                        Start the run on a…
                      </label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {FIRST_DAY_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setFirstDayType(opt.value)}
                            title={opt.desc}
                            className={`py-2 px-1 rounded-lg border text-center transition-all ${
                              firstDayType === opt.value
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                : 'border-show-border text-slate-500 hover:border-slate-600 hover:text-slate-400'
                            }`}
                          >
                            <p className="text-[10px] font-semibold leading-tight">{opt.label}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {firstDayType === 'performance' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                            Performance Type
                          </label>
                          <select
                            value={performanceType ?? ''}
                            onChange={e => setPerformanceType((e.target.value || null) as PerformanceType | null)}
                            className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-amber-500/50 transition-all text-sm"
                          >
                            {perfTypeOptions.map(o => (
                              <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className={firstDayType === 'performance' ? '' : 'col-span-2'}>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                          First Day Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={firstDate}
                          onChange={e => setFirstDate(e.target.value)}
                          required
                          className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-amber-500/50 transition-all text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                          Default Doors Time
                        </label>
                        <CompactTimePicker value={doorsTime} format={settings.timeFormat} onChange={setDoorsTime} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                          Default Show Start
                        </label>
                        <CompactTimePicker value={showStartTime} format={settings.timeFormat} onChange={setShowStartTime} />
                      </div>
                    </div>
                  </div>

                  {/* Template Segments — only relevant when performances are included */}
                  {firstDayType === 'performance' && <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Segment Template</p>
                      <span className="text-[10px] text-slate-700">Type · Label · Duration</span>
                    </div>

                    <div className="space-y-1.5">
                      {templateSegs.map(seg => (
                        <SegmentRow
                          key={seg.id}
                          seg={seg}
                          onUpdate={updated => updateSeg(seg.id, updated)}
                          onRemove={() => removeSeg(seg.id)}
                          canRemove={templateSegs.length > 1}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={addSegment}
                      className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-amber-400 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add segment
                    </button>
                  </div>}

                  {/* Run Schedule */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Run Schedule</p>
                      <span className="text-[10px] text-slate-700">Pre-plan your days — add more anytime</span>
                    </div>

                    {/* Day 1 — locked summary */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-show-surface border border-show-border">
                      <Calendar className="w-3.5 h-3.5 text-amber-400/60 shrink-0" />
                      <span className="font-mono text-xs text-slate-400 w-24 shrink-0">{firstDate}</span>
                      <span className="text-xs text-amber-400 flex-1">{FIRST_DAY_OPTIONS.find(o => o.value === firstDayType)?.label ?? 'Day 1'}</span>
                      <span className="text-[10px] text-slate-600">Day 1</span>
                    </div>

                    {scheduledDays.map((day, i) => {
                      // Same calendar date = same day number (double headers share a day)
                      const uniqueDates = [...new Set(scheduledDays.slice(0, i + 1).map(d => d.date))];
                      const dayNum = uniqueDates.indexOf(day.date) + 2;
                      return (
                      <div key={day.id} className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <input
                          type="date"
                          value={day.date}
                          onChange={e => updateScheduledDay(day.id, { date: e.target.value })}
                          className="font-mono bg-show-surface border border-show-border rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500/50 transition-colors w-32 shrink-0"
                        />
                        <select
                          value={day.dayType}
                          onChange={e => updateScheduledDay(day.id, { dayType: e.target.value as DayType, performanceType: e.target.value === 'performance' ? day.performanceType : null })}
                          className="bg-show-surface border border-show-border rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500/50 transition-colors"
                        >
                          {DAY_TYPE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        {day.dayType === 'performance' && (
                          <select
                            value={day.performanceType ?? ''}
                            onChange={e => updateScheduledDay(day.id, { performanceType: (e.target.value || null) as PerformanceType | null })}
                            className="bg-show-surface border border-show-border rounded-lg px-2 py-1.5 text-xs text-purple-300 focus:outline-none focus:border-purple-500/50 transition-colors"
                          >
                            <option value="">Any</option>
                            <option value="matinee">Mat</option>
                            <option value="evening">Eve</option>
                            <option value="other">Other</option>
                          </select>
                        )}
                        <span className="text-[10px] text-slate-600 shrink-0 ml-auto">Day {dayNum}</span>
                        <button
                          type="button"
                          onClick={() => removeScheduledDay(day.id)}
                          className="w-6 h-6 flex items-center justify-center rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      );
                    })}

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => addScheduledDay(false)}
                        className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-amber-400 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add day
                      </button>
                      <button
                        type="button"
                        onClick={() => addScheduledDay(true)}
                        className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-purple-400 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Same day (double header)
                      </button>
                    </div>
                  </div>

                  {/* Copy Strategy */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">When starting next performance</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'template', label: 'Use run template', desc: 'Always copy original expected durations' },
                        { value: 'last_show', label: 'Copy last show', desc: 'Carry forward any adjusted durations' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setCopyStrategy(opt.value)}
                          className={`text-left p-3 rounded-xl border transition-all ${
                            copyStrategy === opt.value
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                              : 'border-show-border text-slate-500 hover:border-slate-600 hover:text-slate-400'
                          }`}
                        >
                          <p className="text-xs font-semibold mb-0.5">{opt.label}</p>
                          <p className="text-[10px] leading-tight opacity-70">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Footer */}
                <div className="px-6 pb-6 pt-2 shrink-0">
                  <button
                    type="submit"
                    disabled={!production.trim()}
                    className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-show-hover disabled:text-slate-600 text-show-base font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    {firstDayType === 'performance' ? 'Create Run & First Performance' : `Create Run & Start ${FIRST_DAY_OPTIONS.find(o => o.value === firstDayType)?.label ?? 'Day'}`}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
