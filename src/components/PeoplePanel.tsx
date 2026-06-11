import { useState } from 'react';
import { UserPlus, Trash2, Clock, Users, DoorOpen, DoorClosed } from 'lucide-react';
import { useShowStore } from '../store';
import type { Show, TimeFormat, StaffMember } from '../types';
import { formatTime, formatDuration } from '../utils/time';
import TimestampModal from './TimestampModal';

interface Props {
  show: Show;
  timeFormat: TimeFormat;
}

// Duration between two ISO timestamps, or null if either missing / negative.
function spanMs(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = new Date(b).getTime() - new Date(a).getTime();
  return d >= 0 ? d : null;
}

// ── A clock-time cell that opens the timestamp modal ──────────────────────────
function TimeCell({
  label, value, dateAnchor, format, onSave, accent = 'amber',
}: {
  label: string;
  value: string | null;
  dateAnchor: string;
  format: TimeFormat;
  onSave: (iso: string | null) => void;
  accent?: 'amber' | 'green' | 'rose';
}) {
  const [open, setOpen] = useState(false);
  const accentCls = value
    ? accent === 'green' ? 'text-green-300 border-green-500/30'
      : accent === 'rose' ? 'text-rose-300 border-rose-500/30'
      : 'text-amber-300 border-amber-500/30'
    : 'text-slate-600 border-show-border border-dashed';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-show-surface hover:bg-show-hover transition-colors font-mono text-sm tabular ${accentCls}`}
        title={`Set ${label.toLowerCase()}`}
      >
        <Clock className="w-3 h-3 opacity-60" />
        {value ? formatTime(value, format) : '--:--'}
      </button>
      {open && (
        <TimestampModal
          title={label}
          value={value}
          dateAnchor={dateAnchor}
          format={format}
          onSave={onSave}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default function PeoplePanel({ show, timeFormat }: Props) {
  const { addStaff, updateStaff, removeStaff, setClientTime } = useShowStore();

  const clientOnSite = spanMs(show.clientArrival, show.clientDeparture);

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

        <div className="rounded-xl border border-show-border bg-show-card overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1.4fr_1.1fr_auto_auto_auto_auto] gap-2 px-3 py-2 border-b border-show-border text-[10px] uppercase tracking-wider text-slate-600">
            <span>Name</span>
            <span>Role</span>
            <span className="text-center">In</span>
            <span className="text-center">Out</span>
            <span className="text-center">Hours</span>
            <span />
          </div>

          {show.staff.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-slate-600">
              No staff added yet.
            </div>
          )}

          {show.staff.map((m: StaffMember) => {
            const worked = spanMs(m.arrival, m.departure);
            return (
              <div key={m.id} className="grid grid-cols-[1.4fr_1.1fr_auto_auto_auto_auto] gap-2 px-3 py-2.5 items-center border-b border-show-border last:border-b-0">
                <input
                  value={m.name}
                  onChange={e => updateStaff(show.id, m.id, { name: e.target.value })}
                  placeholder="Name"
                  className="bg-show-surface border border-show-border rounded-md px-2 py-1.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-amber-500/40 min-w-0"
                />
                <input
                  value={m.role}
                  onChange={e => updateStaff(show.id, m.id, { role: e.target.value })}
                  placeholder="Role"
                  className="bg-show-surface border border-show-border rounded-md px-2 py-1.5 text-sm text-slate-300 placeholder-slate-700 focus:outline-none focus:border-amber-500/40 min-w-0"
                />
                <TimeCell
                  label={`${m.name || 'Staff'} — Arrival`}
                  value={m.arrival}
                  dateAnchor={show.date}
                  format={timeFormat}
                  accent="green"
                  onSave={iso => updateStaff(show.id, m.id, { arrival: iso })}
                />
                <TimeCell
                  label={`${m.name || 'Staff'} — Departure`}
                  value={m.departure}
                  dateAnchor={show.date}
                  format={timeFormat}
                  accent="rose"
                  onSave={iso => updateStaff(show.id, m.id, { departure: iso })}
                />
                <span className="text-center font-mono text-xs tabular text-slate-400 min-w-[52px]">
                  {worked !== null ? formatDuration(worked) : '—'}
                </span>
                <button
                  onClick={() => removeStaff(show.id, m.id)}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors"
                  title="Remove staff member"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
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
