import { useState } from 'react';
import { Copy, Check, FileText, FileDown, BarChart2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Show, Run, TimeFormat } from '../types';
import { getSegmentStatus, getElapsedMs, getTotalRunningMs } from '../types';
import { formatTime, formatDuration, formatDateShort } from '../utils/time';
import { copyReportToClipboard } from '../utils/report';
import { generatePDF } from '../utils/pdf';
import { useShowStore } from '../store';
import { useClock } from '../hooks/useClock';

interface Props {
  show: Show;
  timeFormat: TimeFormat;
}

// ── Run stats tab ─────────────────────────────────────────────────────────────

function RunStatsTab({ run, shows, timeFormat }: { run: Run; shows: Show[]; timeFormat: TimeFormat }) {
  const runShows = run.showIds
    .map(id => shows.find(s => s.id === id))
    .filter(Boolean) as Show[];

  // Per-night totals
  const nights = runShows.map(s => ({
    show: s,
    totalMs: getTotalRunningMs(s, new Date()),
    hasData: s.segments.some(seg => seg.actualStart),
    dayType: s.dayType ?? 'performance',
    perfType: s.performanceType,
  }));

  const completedNights = nights.filter(n => n.totalMs > 0);
  const avgMs = completedNights.length > 0
    ? completedNights.reduce((acc, n) => acc + n.totalMs, 0) / completedNights.length
    : 0;

  // Per-segment averages across all completed performances (dayType=performance only)
  const perfNights = runShows.filter(s => (s.dayType ?? 'performance') === 'performance' && s.segments.some(seg => seg.actualStart && seg.actualEnd));
  const segmentMap = new Map<string, { totalMs: number; count: number }>();
  for (const s of perfNights) {
    for (const seg of s.segments) {
      if (!seg.actualStart || !seg.actualEnd) continue;
      const elapsed = getElapsedMs(seg, new Date(seg.actualEnd));
      const key = seg.label;
      const existing = segmentMap.get(key) ?? { totalMs: 0, count: 0 };
      segmentMap.set(key, { totalMs: existing.totalMs + elapsed, count: existing.count + 1 });
    }
  }
  const segAverages = Array.from(segmentMap.entries())
    .map(([label, { totalMs, count }]) => ({ label, avgMs: totalMs / count, count }))
    .filter(s => s.count > 0);

  const DAY_COLORS: Record<string, string> = {
    performance: 'text-amber-400',
    rehearsal:   'text-teal-400',
    plotting:    'text-indigo-400',
  };
  const DAY_LABELS: Record<string, string> = {
    performance: 'Perf',
    rehearsal:   'Reh',
    plotting:    'Plot',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Nights', value: runShows.length.toString() },
          { label: 'Done', value: completedNights.length.toString() },
          { label: 'Avg Run', value: avgMs > 0 ? formatDuration(avgMs) : '—' },
        ].map(stat => (
          <div key={stat.label} className="bg-show-card rounded-lg p-2 text-center border border-show-border">
            <p className="text-base font-bold text-slate-200 font-mono">{stat.value}</p>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Night-by-night list */}
      {nights.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-2">All Nights</p>
          <div className="space-y-0.5">
            {nights.map(({ show: s, totalMs, dayType, perfType }) => (
              <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-show-border/30 last:border-0">
                <span className={`text-[10px] font-bold uppercase w-8 shrink-0 ${DAY_COLORS[dayType] ?? 'text-slate-500'}`}>
                  {DAY_LABELS[dayType] ?? dayType}
                </span>
                <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">
                  {formatDateShort(s.date)}
                  {perfType ? ` · ${perfType}` : ''}
                </span>
                <span className="font-mono text-xs shrink-0 tabular text-slate-300">
                  {totalMs > 0 ? formatDuration(totalMs) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-segment averages — only for performance nights */}
      {segAverages.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-2">
            Segment Averages
            <span className="normal-case ml-1 text-slate-700">(performances only)</span>
          </p>
          <div className="space-y-0.5">
            {segAverages.map(({ label, avgMs: avg, count }) => (
              <div key={label} className="flex items-center gap-2 py-1.5 border-b border-show-border/30 last:border-0">
                <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">{label}</span>
                <span className="text-[10px] text-slate-700 shrink-0">×{count}</span>
                <span className="font-mono text-xs shrink-0 tabular text-amber-300">{formatDuration(avg)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {nights.length === 0 && (
        <p className="text-xs text-slate-700 text-center py-4">No performances yet</p>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ReportPanel({ show, timeFormat }: Props) {
  const now = useClock();
  const { updateTechNotes, shows, runs } = useShowStore();
  const [copied, setCopied] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const currentRun = show.runId ? (runs.find(r => r.id === show.runId) ?? null) : null;
  const [tab, setTab] = useState<'tonight' | 'run'>('tonight');

  async function handleCopy() {
    const ok = await copyReportToClipboard(show, timeFormat);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  function handlePDF() {
    setGeneratingPDF(true);
    try { generatePDF(show, timeFormat); }
    finally { setTimeout(() => setGeneratingPDF(false), 1000); }
  }

  const segments = [...show.segments].sort((a, b) => a.order - b.order);
  const totalMs = getTotalRunningMs(show, now);

  return (
    <motion.div
      className="flex flex-col h-full border-l border-show-border bg-show-surface"
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header + tab switcher */}
      <div className="px-4 py-3 border-b border-show-border shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-300 truncate">{show.production || show.title}</p>
            <p className="text-[10px] text-slate-600">{formatDateShort(show.date)}</p>
          </div>
        </div>

        {/* Tabs — only shown when in a run */}
        {currentRun && (
          <div className="flex bg-show-card rounded-lg border border-show-border p-0.5 gap-0.5">
            <button
              onClick={() => setTab('tonight')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === 'tonight' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              <FileText className="w-3 h-3" />
              Tonight
            </button>
            <button
              onClick={() => setTab('run')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === 'run' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              <BarChart2 className="w-3 h-3" />
              Run Stats
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {tab === 'run' && currentRun ? (
          <RunStatsTab run={currentRun} shows={shows} timeFormat={timeFormat} />
        ) : (
          <div className="space-y-2">
            {segments.map(seg => {
              const status = getSegmentStatus(seg);
              const elapsed = getElapsedMs(seg, now);
              return (
                <div key={seg.id} className="flex items-start justify-between gap-2">
                  <span className={`text-xs leading-5 truncate max-w-[90px] ${
                    status === 'active' ? 'text-amber-300 font-semibold' :
                    status === 'complete' ? 'text-slate-400' :
                    'text-slate-700'
                  }`}>
                    {seg.label}
                  </span>
                  <div className="text-right shrink-0">
                    {status === 'active' && (
                      <span className="font-mono text-[11px] text-amber-400 tabular">
                        {formatTime(seg.actualStart, timeFormat)} → {formatDuration(elapsed)}
                      </span>
                    )}
                    {status === 'complete' && (
                      <div>
                        <p className="font-mono text-[11px] text-slate-400 tabular">
                          {formatTime(seg.actualStart, timeFormat)} → {formatTime(seg.actualEnd, timeFormat)}
                        </p>
                        <p className="font-mono text-[10px] text-slate-600 tabular">{formatDuration(elapsed)}</p>
                      </div>
                    )}
                    {status === 'pending' && (
                      <span className="font-mono text-[11px] text-slate-700 tabular">--:--</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Total */}
            <div className="border-t border-show-border pt-2 mt-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">Total Running</span>
                <span className="font-mono text-sm font-bold text-slate-200 tabular">{formatDuration(totalMs)}</span>
              </div>
            </div>

            {/* Tech notes */}
            <div className="pt-2">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5">Technical Notes</p>
              <textarea
                value={show.techNotes ?? ''}
                onChange={e => updateTechNotes(show.id, e.target.value)}
                placeholder="Add technical notes here — they will be included in the PDF report…"
                rows={5}
                className="w-full bg-show-card border border-show-border rounded-lg px-2.5 py-2 text-xs text-slate-300 placeholder-slate-700 focus:outline-none focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/10 resize-none leading-relaxed"
              />
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 py-3 border-t border-show-border space-y-2 shrink-0">
        <button
          onClick={handlePDF}
          disabled={generatingPDF}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-show-base text-sm font-semibold transition-all shadow-amber-glow-sm"
        >
          <FileDown className="w-3.5 h-3.5" />
          {generatingPDF ? 'Generating…' : 'Export PDF'}
        </button>

        <button
          onClick={handleCopy}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border ${
            copied
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-show-hover hover:bg-show-border text-slate-400 hover:text-slate-200 border-show-border'
          }`}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy Report'}
        </button>
      </div>
    </motion.div>
  );
}
