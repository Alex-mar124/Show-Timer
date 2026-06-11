import { FileDown, FileText, Files, Clock, Users, DoorOpen } from 'lucide-react';
import { useShowStore } from '../store';
import { useClock } from '../hooks/useClock';
import type { Show, Run } from '../types';
import { resolveReportFormat, getShowTimeWindowMs, getNonShowTimeMs } from '../types';
import { formatDuration, formatTime } from '../utils/time';
import { generatePDF, generateRunReportPDF, generateAllRunReports } from '../utils/pdf';
import SignaturePad from './SignaturePad';

interface Props {
  show: Show;
  run: Run | null;
  runShows: Show[];
}

function span(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = new Date(b).getTime() - new Date(a).getTime();
  return d >= 0 ? d : null;
}

function Stat({ label, value, color, Icon }: { label: string; value: string; color: string; Icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-show-border bg-show-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <p className={`font-mono text-lg font-semibold tabular ${color}`}>{value}</p>
    </div>
  );
}

export default function ReportTab({ show, run, runShows }: Props) {
  const { settings, updateTechNotes, updateClientComments, setSignature } = useShowStore();
  const now = useClock();
  const reportFormat = resolveReportFormat(settings);

  const showMs = getShowTimeWindowMs(show, now);
  const nonShowMs = getNonShowTimeMs(show, now);
  const onSite = span(show.clientArrival, show.clientDeparture);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

      {/* ── Summary ────────────────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="In show" value={formatDuration(showMs)} color="text-amber-400" Icon={Clock} />
          <Stat label="Not in show" value={formatDuration(nonShowMs)} color="text-slate-300" Icon={Clock} />
          <Stat label="Client on site" value={onSite !== null ? formatDuration(onSite) : '—'} color="text-green-400" Icon={DoorOpen} />
          <Stat label="Staff" value={String(show.staff.length)} color="text-slate-300" Icon={Users} />
        </div>
        <p className="text-[11px] text-slate-600 mt-2">
          Client {formatTime(show.clientArrival, reportFormat)} → {formatTime(show.clientDeparture, reportFormat)} ·
          Report clock: {reportFormat === '12h' ? '12-hour' : '24-hour'}
          {settings.reportTimeFormat === 'match' ? ' (matches interface)' : ''}
        </p>
      </section>

      {/* ── Tech comments ──────────────────────────────────────────────────── */}
      <section>
        <label className="block text-xs font-semibold text-slate-300 mb-2">Tech Comments</label>
        <textarea
          value={show.techNotes}
          onChange={e => updateTechNotes(show.id, e.target.value)}
          placeholder="Technical notes for this show…"
          rows={3}
          className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-amber-500/40 resize-none"
        />
      </section>

      {/* ── Client comments ────────────────────────────────────────────────── */}
      <section>
        <label className="block text-xs font-semibold text-slate-300 mb-2">Client Comments</label>
        <textarea
          value={show.clientComments}
          onChange={e => updateClientComments(show.id, e.target.value)}
          placeholder="Feedback from the client…"
          rows={3}
          className="w-full bg-show-surface border border-show-border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-amber-500/40 resize-none"
        />
      </section>

      {/* ── Signature ──────────────────────────────────────────────────────── */}
      <section>
        <label className="block text-xs font-semibold text-slate-300 mb-2">Client Signature</label>
        <SignaturePad value={show.clientSignature} onChange={v => setSignature(show.id, v)} />
      </section>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <section className="space-y-2 pt-1">
        <button
          onClick={() => generatePDF(show, reportFormat)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-show-base font-semibold text-sm transition-all shadow-amber-glow-sm"
        >
          <FileDown className="w-4 h-4" />
          Download Show Report (PDF)
        </button>

        {run && runShows.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => generateRunReportPDF(run, runShows, reportFormat)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-semibold text-sm transition-all"
            >
              <FileText className="w-3.5 h-3.5" />
              Combined Run Summary
            </button>
            <button
              onClick={() => generateAllRunReports(runShows, reportFormat)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-show-border hover:border-slate-600 text-slate-400 hover:text-slate-200 font-semibold text-sm transition-all"
            >
              <Files className="w-3.5 h-3.5" />
              All Individual Reports
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
