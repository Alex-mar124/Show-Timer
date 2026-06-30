import type { Show, Run, Segment, SegmentType, StaffMember } from '../types';

function uid() { return crypto.randomUUID(); }

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ISO timestamp for a given local time on a date string. */
function at(date: string, h: number, m: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0).toISOString();
}

function seg(type: SegmentType, label: string, order: number, opts: Partial<Segment> = {}): Segment {
  return {
    id: uid(), type, label, order,
    expectedDurationMinutes: opts.expectedDurationMinutes ?? null,
    plannedStart: opts.plannedStart ?? null,
    plannedEnd: opts.plannedEnd ?? null,
    actualStart: opts.actualStart ?? null,
    actualEnd: opts.actualEnd ?? null,
    holds: opts.holds ?? [],
    notes: opts.notes ?? '',
  };
}

function staff(name: string, role: string, date: string, inH: number, inM: number, outH: number, outM: number, breakMins: number[] = []): StaffMember {
  return {
    id: uid(), name, role,
    arrival: at(date, inH, inM), departure: at(date, outH, outM),
    breaks: breakMins.map(minutes => ({ id: uid(), minutes })),
  };
}

/**
 * Builds a representative dataset for testing:
 *  - A 2-night production run (Night 1 fully run with people/comments,
 *    Night 2 planned only)
 *  - A standalone rehearsal day
 * IDs are internally consistent; importBundle remaps them on insert.
 */
export function buildSeedData(): { runs: Run[]; shows: Show[] } {
  const d1 = dateNDaysAgo(2);
  const d2 = dateNDaysAgo(1);
  const dReh = dateNDaysAgo(5);

  const runId = uid();

  // ── Night 1 — fully run ────────────────────────────────────────────────────
  const night1: Show = {
    id: uid(),
    title: 'Night 1',
    production: 'Macbeth',
    date: d1,
    plannedStartTime: at(d1, 19, 30),
    doorsOpenTime: at(d1, 19, 0),
    segments: [
      seg('bump_in', 'Bump In', 0, { expectedDurationMinutes: 120, actualStart: at(d1, 14, 0), actualEnd: at(d1, 16, 15) }),
      seg('doors', 'Doors', 1, { expectedDurationMinutes: 30, actualStart: at(d1, 19, 2), actualEnd: at(d1, 19, 31) }),
      seg('act', 'Act 1', 2, { expectedDurationMinutes: 55, actualStart: at(d1, 19, 33), actualEnd: at(d1, 20, 31) }),
      seg('interval', 'Interval', 3, { expectedDurationMinutes: 20, actualStart: at(d1, 20, 31), actualEnd: at(d1, 20, 52) }),
      seg('act', 'Act 2', 4, { expectedDurationMinutes: 50, actualStart: at(d1, 20, 52), actualEnd: at(d1, 21, 44) }),
      seg('show_end', 'Show Finish', 5, { actualStart: at(d1, 21, 45) }),
      seg('bump_out', 'Bump Out', 6, { actualStart: at(d1, 21, 50), actualEnd: at(d1, 23, 10) }),
    ],
    notes: 'Smooth opening night.',
    techNotes: 'Followspot 2 intermittent in Act 1 — flagged to electrics. DSM on book throughout.',
    staff: [
      staff('Alex Martin', 'Stage Manager', d1, 13, 30, 23, 30, [30, 15]),
      staff('Jordan Lee', 'Lighting Op', d1, 14, 0, 23, 15, [45]),
      staff('Sam Okafor', 'Sound Op', d1, 14, 0, 23, 0, [30]),
    ],
    clientArrival: at(d1, 13, 0),
    clientDeparture: at(d1, 23, 30),
    clientComments: 'Very happy with the get-in and the show. Thank you to the crew.',
    clientSignature: null,
    clientSignatureName: '',
    createdAt: at(d1, 13, 0),
    completedAt: at(d1, 23, 30),
    runId,
    performanceNumber: 1,
    performanceType: 'evening',
  };

  // ── Night 2 — planned only ─────────────────────────────────────────────────
  const night2: Show = {
    id: uid(),
    title: 'Night 2',
    production: 'Macbeth',
    date: d2,
    plannedStartTime: at(d2, 19, 30),
    doorsOpenTime: at(d2, 19, 0),
    segments: [
      seg('bump_in', 'Bump In', 0, { expectedDurationMinutes: 90 }),
      seg('doors', 'Doors', 1, { expectedDurationMinutes: 30 }),
      seg('act', 'Act 1', 2, { expectedDurationMinutes: 55 }),
      seg('interval', 'Interval', 3, { expectedDurationMinutes: 20 }),
      seg('act', 'Act 2', 4, { expectedDurationMinutes: 50 }),
    ],
    notes: '',
    techNotes: '',
    staff: [
      staff('Alex Martin', 'Stage Manager', d2, 16, 0, 23, 0),
      staff('Jordan Lee', 'LX Op', d2, 16, 30, 23, 0),
    ],
    clientArrival: null,
    clientDeparture: null,
    clientComments: '',
    clientSignature: null,
    clientSignatureName: '',
    createdAt: at(d2, 9, 0),
    completedAt: null,
    runId,
    performanceNumber: 2,
    performanceType: 'evening',
  };

  const run: Run = {
    id: runId,
    name: 'Macbeth — Spring Tour',
    production: 'Macbeth',
    venue: 'Grand Theatre',
    performanceType: 'evening',
    copyStrategy: 'template',
    defaultDoorsTime: '19:00',
    defaultShowStartTime: '19:30',
    templateSegments: [
      { id: uid(), type: 'doors', label: 'Doors', expectedDurationMinutes: 30, order: 0 },
      { id: uid(), type: 'act', label: 'Act 1', expectedDurationMinutes: 55, order: 1 },
      { id: uid(), type: 'interval', label: 'Interval', expectedDurationMinutes: 20, order: 2 },
      { id: uid(), type: 'act', label: 'Act 2', expectedDurationMinutes: 50, order: 3 },
    ],
    showIds: [night1.id, night2.id],
    notes: 'Two-night stand. Get-out after Night 2.',
    createdAt: at(d1, 9, 0),
    completedAt: null,
  };

  // ── Standalone rehearsal day ───────────────────────────────────────────────
  const rehearsal: Show = {
    id: uid(),
    title: 'Tech Rehearsal',
    production: 'Macbeth',
    date: dReh,
    plannedStartTime: null,
    doorsOpenTime: null,
    segments: [
      seg('rehearsal', 'Tech Rehearsal', 0, { expectedDurationMinutes: 360, actualStart: at(dReh, 10, 0), actualEnd: at(dReh, 17, 30) }),
    ],
    notes: 'Full tech with cue-to-cue in the morning.',
    techNotes: 'Plotted 142 LX cues. Sound levels set.',
    staff: [staff('Alex Martin', 'Stage Manager', dReh, 9, 30, 18, 0)],
    clientArrival: at(dReh, 10, 0),
    clientDeparture: at(dReh, 17, 30),
    clientComments: '',
    clientSignature: null,
    clientSignatureName: '',
    createdAt: at(dReh, 9, 0),
    completedAt: at(dReh, 18, 0),
    dayType: 'rehearsal',
  };

  return { runs: [run], shows: [night1, night2, rehearsal] };
}
