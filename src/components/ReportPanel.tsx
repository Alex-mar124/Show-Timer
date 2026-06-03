import { useState } from 'react';
import { Copy, Check, FileText, FileDown } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Show, TimeFormat } from '../types';
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

export default function ReportPanel({ show, timeFormat }: Props) {
  const now = useClock();
  const { updateTechNotes } = useShowStore();
  const [copied, setCopied] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  async function handleCopy() {
    const ok = await copyReportToClipboard(show, timeFormat);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handlePDF() {
    setGeneratingPDF(true);
    try {
      generatePDF(show, timeFormat);
    } finally {
      setTimeout(() => setGeneratingPDF(false), 1000);
    }
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
      {/* Header */}
      <div className="px-4 py-3 border-b border-show-border flex items-center gap-2 shrink-0">
        <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-300 truncate">{show.production || show.title}</p>
          <p className="text-[10px] text-slate-600">{formatDateShort(show.date)}</p>
        </div>
      </div>

      {/* Segment times */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
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
