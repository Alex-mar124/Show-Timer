import { FileDown, FileText, Files, Clock, Users, DoorOpen, Share2, Package, Printer } from 'lucide-react';
import { useShowStore } from '../store';
import { useClock } from '../hooks/useClock';
import type { Show, Run } from '../types';
import { resolveReportFormat, getShowTimeWindowMs, getNonShowTimeMs, effectiveClientArrival, effectiveClientDeparture } from '../types';
import { formatDuration, formatTime } from '../utils/time';
import { generatePDF, generatePrintablePDF, generateRunReportPDF, generateRunPrintablePDF, generateAllRunReports } from '../utils/pdf';
import { exportShow, exportRun } from '../utils/exchange';
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
  const { settings, updateTechNotes, updateClientComments, setSignature, setSignatureName, addToast } = useShowStore();
  const now = useClock();
  const reportFormat = resolveReportFormat(settings);

  const showMs = getShowTimeWindowMs(show, now);
  const nonShowMs = getNonShowTimeMs(show, now);
  const cArr = effectiveClientArrival(show);
  const cDep = effectiveClientDeparture(show);
  const onSite = span(cArr, cDep);

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
          Client {formatTime(cArr, reportFormat)} → {formatTime(cDep, reportFormat)} ·
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
        <SignaturePad
          value={show.clientSignature}
          onChange={v => setSignature(show.id, v)}
          name={show.clientSignatureName}
          onNameChange={v => setSignatureName(show.id, v)}
        />
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

        <button
          onClick={() => generatePrintablePDF(show, reportFormat)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-show-border hover:border-amber-500/30 text-slate-400 hover:text-amber-400 font-semibold text-sm transition-all"
          title="Two-page double-sided: client copy + tech copy, with space to sign on paper"
        >
          <Printer className="w-4 h-4" />
          Printable (2-sided: client + tech)
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
              onClick={() => generateRunPrintablePDF(run, runShows, reportFormat)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-show-border hover:border-amber-500/30 text-slate-400 hover:text-amber-400 font-semibold text-sm transition-all"
              title="Two-page double-sided run summary: client copy with signature + tech copy"
            >
              <Printer className="w-3.5 h-3.5" />
              Run Summary (printable)
            </button>
            <button
              onClick={() => generateAllRunReports(runShows, reportFormat)}
              className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-show-border hover:border-slate-600 text-slate-400 hover:text-slate-200 font-semibold text-sm transition-all"
            >
              <Files className="w-3.5 h-3.5" />
              All Individual Reports
            </button>
          </div>
        )}
      </section>

      {/* ── Share / export data ────────────────────────────────────────────── */}
      <section className="pt-2 border-t border-show-border">
        <div className="flex items-center gap-2 mb-2">
          <Share2 className="w-3.5 h-3.5 text-slate-500" />
          <h3 className="text-xs font-semibold text-slate-400">Share &amp; Export Data</h3>
        </div>
        <p className="text-[11px] text-slate-600 mb-3">
          Export a <code className="text-slate-500">.showtimer.json</code> file to back up, transfer, or send a preset for staff to run.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { exportShow(show, false); addToast({ title: 'Show exported', message: 'Saved .showtimer.json', type: 'success' }); }}
            className="flex items-center justify-center gap-2 py-2 rounded-lg border border-show-border hover:border-slate-600 text-slate-400 hover:text-slate-200 text-xs font-medium transition-all"
          >
            <FileDown className="w-3.5 h-3.5" /> Export Show
          </button>
          <button
            onClick={() => { exportShow(show, true); addToast({ title: 'Preset exported', message: 'Clean plan for staff to run', type: 'success' }); }}
            className="flex items-center justify-center gap-2 py-2 rounded-lg border border-show-border hover:border-amber-500/30 text-slate-400 hover:text-amber-400 text-xs font-medium transition-all"
          >
            <Package className="w-3.5 h-3.5" /> Export Preset
          </button>
          {run && (
            <>
              <button
                onClick={() => { exportRun(run, runShows, false); addToast({ title: 'Run exported', message: `${runShows.length} shows`, type: 'success' }); }}
                className="flex items-center justify-center gap-2 py-2 rounded-lg border border-show-border hover:border-slate-600 text-slate-400 hover:text-slate-200 text-xs font-medium transition-all"
              >
                <FileDown className="w-3.5 h-3.5" /> Export Run
              </button>
              <button
                onClick={() => { exportRun(run, runShows, true); addToast({ title: 'Run preset exported', message: 'Clean plan for staff', type: 'success' }); }}
                className="flex items-center justify-center gap-2 py-2 rounded-lg border border-show-border hover:border-amber-500/30 text-slate-400 hover:text-amber-400 text-xs font-medium transition-all"
              >
                <Package className="w-3.5 h-3.5" /> Export Run Preset
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
