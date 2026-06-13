import { useState } from 'react';
import { UserPlus, Trash2, Clock, Users, DoorOpen, DoorClosed, Coffee, Plus, X } from 'lucide-react';
import { useShowStore } from '../store';
import type { Show, TimeFormat, StaffMember } from '../types';
import { COMMON_ROLES, staffBreakMinutes, staffWorkedMs, derivedClientArrival, derivedClientDeparture, effectiveClientArrival, effectiveClientDeparture } from '../types';
import { formatTime, formatDuration, formatDurationShort } from '../utils/time';
import TimestampModal, { type TimeSuggestion } from './TimestampModal';

interface Props {
  show: Show;
  timeFormat: TimeFormat;
}

function spanMs(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = new Date(b).getTime() - new Date(a).getTime();
  return d >= 0 ? d : null;
}

// ── A clock-time cell that opens the timestamp modal ──────────────────────────
// `auto` is an optional fallback time used when no manual value is set (e.g.
// client access derived from the first/last segment). Shows an "auto" badge.
function TimeCell({
  label, value, auto, dateAnchor, format, suggestions, onSave, accent = 'amber',
}: {
  label: string;
  value: string | null;
  auto?: string | null;
  dateAnchor: string;
  format: TimeFormat;
  suggestions?: TimeSuggestion[];
  onSave: (iso: string | null) => void;
  accent?: 'amber' | 'green' | 'rose';
}) {
  const [open, setOpen] = useState(false);
  const isAuto = !value && !!auto;
  const shown = value ?? auto ?? null;
  const accentCls = value
    ? accent === 'green' ? 'text-green-300 border-green-500/30'
      : accent === 'rose' ? 'text-rose-300 border-rose-500/30'
      : 'text-amber-300 border-amber-500/30'
    : isAuto ? 'text-slate-400 border-show-border'
      : 'text-slate-600 border-show-border border-dashed';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-show-surface hover:bg-show-hover transition-colors font-mono text-sm tabular ${accentCls}`}
        title={isAuto ? 'Auto from segments — click to override' : `Set ${label.toLowerCase()}`}
      >
        <Clock className="w-3 h-3 opacity-60" />
        {shown ? formatTime(shown, format) : '--:--'}
        {isAuto && <span className="text-[9px] font-sans uppercase tracking-wider text-slate-600 not-italic">auto</span>}
      </button>
      {open && (
        <TimestampModal
          title={label}
          subtitle={isAuto ? 'Currently auto from segments' : undefined}
          value={shown}
          dateAnchor={dateAnchor}
          format={format}
          suggestions={suggestions}
          onSave={onSave}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Breaks editor (expandable) ────────────────────────────────────────────────
function BreaksEditor({ show, member }: { show: Show; member: StaffMember }) {
  const { addStaffBreak, updateStaffBreak, removeStaffBreak } = useShowStore();
  const [open, setOpen] = useState(false);
  const total = staffBreakMinutes(member);
  const count = member.breaks.length;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-show-surface hover:bg-show-hover transition-colors text-xs ${
          count > 0 ? 'text-amber-300 border-amber-500/30' : 'text-slate-600 border-show-border border-dashed'
        }`}
        title="Breaks taken"
      >
        <Coffee className="w-3 h-3 opacity-70" />
        {count > 0 ? `${count} · ${total}m` : 'Breaks'}
      </button>

      {open && (
        <div className="mt-2 p-2.5 rounded-lg bg-show-surface border border-show-border space-y-2 w-fit">
          {member.breaks.length === 0 && (
            <p className="text-[11px] text-slate-600">No breaks logged.</p>
          )}
          {member.breaks.map((b, i) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-600 w-10">Break {i + 1}</span>
              <input
                type="number" min={0} max={600}
                value={b.minutes}
                onChange={e => updateStaffBreak(show.id, member.id, b.id, Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-16 bg-show-card border border-show-border rounded px-2 py-1 text-xs text-amber-300 font-mono text-center focus:outline-none focus:border-amber-500/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[10px] text-slate-600">min</span>
              <button
                onClick={() => removeStaffBreak(show.id, member.id, b.id)}
                className="w-5 h-5 rounded flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1.5 pt-1">
            {[10, 15, 30].map(m => (
              <button
                key={m}
                onClick={() => addStaffBreak(show.id, member.id, m)}
                className="px-2 py-1 rounded border border-show-border hover:border-amber-500/40 text-[11px] text-slate-400 hover:text-amber-300 transition-colors"
              >
                +{m}m
              </button>
            ))}
            <button
              onClick={() => addStaffBreak(show.id, member.id, 0)}
              className="flex items-center gap-1 px-2 py-1 rounded border border-show-border hover:border-slate-600 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Plus className="w-3 h-3" /> Custom
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PeoplePanel({ show, timeFormat }: Props) {
  const { addStaff, updateStaff, removeStaff, setClientTime } = useShowStore();

  const clientOnSite = spanMs(effectiveClientArrival(show), effectiveClientDeparture(show));
  const autoArrival = derivedClientArrival(show);
  const autoDeparture = derivedClientDeparture(show);

  // Build "copy from" suggestions for staff time cells: client + other staff times.
  function suggestionsFor(member: StaffMember, field: 'arrival' | 'departure'): TimeSuggestion[] {
    const out: TimeSuggestion[] = [];
    if (field === 'arrival' && effectiveClientArrival(show)) out.push({ label: 'Client in', iso: effectiveClientArrival(show)! });
    if (field === 'departure' && effectiveClientDeparture(show)) out.push({ label: 'Client out', iso: effectiveClientDeparture(show)! });
    for (const m of show.staff) {
      if (m.id === member.id) continue;
      const iso = m[field];
      if (iso) out.push({ label: m.name || m.role || 'Staff', iso });
    }
    return out;
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

      {/* ── Client access ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <DoorOpen className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-200">Client Access</h3>
          {clientOnSite !== null && (
            <span className="ml-auto text-xs text-slate-500">
              On site <span className="font-mono text-amber-300">{formatDuration(clientOnSite)}</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-show-border bg-show-card p-3">
            <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider text-slate-500">
              <DoorOpen className="w-3 h-3" /> Arrival
            </div>
            <TimeCell
              label="Client Arrival"
              value={show.clientArrival}
              auto={autoArrival}
              dateAnchor={show.date}
              format={timeFormat}
              accent="green"
              onSave={iso => setClientTime(show.id, 'clientArrival', iso ? new Date(iso) : null)}
            />
          </div>
          <div className="rounded-xl border border-show-border bg-show-card p-3">
            <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider text-slate-500">
              <DoorClosed className="w-3 h-3" /> Departure
            </div>
            <TimeCell
              label="Client Departure"
              value={show.clientDeparture}
              auto={autoDeparture}
              dateAnchor={show.date}
              format={timeFormat}
              accent="rose"
              onSave={iso => setClientTime(show.id, 'clientDeparture', iso ? new Date(iso) : null)}
            />
          </div>
        </div>
      </section>

      {/* ── Staff ──────────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-200">Staff</h3>
          <span className="text-xs text-slate-600">{show.staff.length} on call</span>
        </div>

        {/* Shared datalist for role autofill */}
        <datalist id="staff-roles">
          {COMMON_ROLES.map(r => <option key={r} value={r} />)}
        </datalist>

        <div className="space-y-2">
          {show.staff.length === 0 && (
            <div className="rounded-xl border border-show-border bg-show-card px-3 py-6 text-center text-sm text-slate-600">
              No staff added yet.
            </div>
          )}

          {show.staff.map((m: StaffMember) => {
            const net = staffWorkedMs(m);
            const breakMin = staffBreakMinutes(m);
            return (
              <div key={m.id} className="rounded-xl border border-show-border bg-show-card p-3 space-y-2.5">
                {/* Top line: name, role, delete */}
                <div className="flex items-center gap-2">
                  <input
                    value={m.name}
                    onChange={e => updateStaff(show.id, m.id, { name: e.target.value })}
                    placeholder="Name"
                    className="flex-1 bg-show-surface border border-show-border rounded-md px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-amber-500/40 min-w-0"
                  />
                  <input
                    value={m.role}
                    list="staff-roles"
                    onChange={e => updateStaff(show.id, m.id, { role: e.target.value })}
                    placeholder="Role"
                    className="flex-1 bg-show-surface border border-show-border rounded-md px-2.5 py-1.5 text-sm text-slate-300 placeholder-slate-700 focus:outline-none focus:border-amber-500/40 min-w-0"
                  />
                  <button
                    onClick={() => removeStaff(show.id, m.id)}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors shrink-0"
                    title="Remove staff member"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Second line: in / out / breaks / net hours */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-slate-600">In</span>
                    <TimeCell
                      label={`${m.name || 'Staff'} — Arrival`}
                      value={m.arrival}
                      dateAnchor={show.date}
                      format={timeFormat}
                      accent="green"
                      suggestions={suggestionsFor(m, 'arrival')}
                      onSave={iso => updateStaff(show.id, m.id, { arrival: iso })}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-slate-600">Out</span>
                    <TimeCell
                      label={`${m.name || 'Staff'} — Departure`}
                      value={m.departure}
                      dateAnchor={show.date}
                      format={timeFormat}
                      accent="rose"
                      suggestions={suggestionsFor(m, 'departure')}
                      onSave={iso => updateStaff(show.id, m.id, { departure: iso })}
                    />
                  </div>
                  <BreaksEditor show={show} member={m} />
                  <div className="ml-auto text-right">
                    <p className="text-[9px] uppercase tracking-wider text-slate-600 leading-none">Net hours</p>
                    <p className="font-mono text-sm tabular text-amber-300 leading-tight">
                      {net !== null ? formatDuration(net) : '—'}
                      {net !== null && breakMin > 0 && (
                        <span className="text-[10px] text-slate-600 ml-1">(−{formatDurationShort(breakMin)})</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => addStaff(show.id)}
          className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-show-border hover:border-amber-500/30 text-slate-500 hover:text-amber-400 text-xs font-medium transition-all"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Staff Member
        </button>
      </section>
    </div>
  );
}
