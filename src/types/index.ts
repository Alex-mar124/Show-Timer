export type TimeFormat = '12h' | '24h';
export type ReportTimeFormat = '12h' | '24h' | 'match';
export type ShowTimeBoundary = 'doors' | 'show_start';
export type SessionMode = 'none' | 'hosting' | 'joined';
export type PerformanceType = 'matinee' | 'evening' | 'other';
export type CopyStrategy = 'template' | 'last_show';

export interface TemplateSegment {
  id: string;
  type: SegmentType;
  label: string;
  expectedDurationMinutes: number | null;
  order: number;
}

export interface Run {
  id: string;
  name: string;
  production: string;
  venue: string;
  performanceType: PerformanceType | null; // null = mixed / unspecified
  copyStrategy: CopyStrategy;
  defaultDoorsTime: string;
  defaultShowStartTime: string;
  templateSegments: TemplateSegment[];
  showIds: string[];
  notes: string;
  createdAt: string;
  completedAt: string | null;
}

export interface SessionPeer {
  id: string;
  name: string;
  device: string; // 'windows' | 'mac'
  joined_at: string;
}

export interface DiscoveredSession {
  name: string;
  ip: string;
  port: number;
}

export interface SessionState {
  mode: SessionMode;
  sessionName: string;
  pin: string;
  hostIp: string;
  localIp: string;
  peers: SessionPeer[];
  // UI state
  panelOpen: boolean;
  scanning: boolean;
  discovered: DiscoveredSession[];
  connecting: boolean;
  connectError: string;
  lastSyncId: string; // prevent echo loops
}
export type View = 'timer' | 'history' | 'settings';

export type SegmentType =
  | 'pre_show'
  | 'performance_start'  // named header marking start of a performance block (Matinee / Evening)
  | 'changeover'         // timed reset/turnaround between two performances on the same day
  | 'doors'
  | 'house_open'
  | 'act'
  | 'interval'
  | 'curtain_call'
  | 'show_end'
  | 'custom'
  | 'rehearsal'
  | 'plotting'
  | 'bump_in'
  | 'bump_out'
  | 'post_show';

export type DayType = 'performance' | 'rehearsal' | 'plotting' | 'bump_in' | 'bump_out';

export type SegmentStatus = 'pending' | 'active' | 'complete';

export interface Hold {
  id: string;
  startTime: string;
  endTime: string | null;
}

export interface Segment {
  id: string;
  type: SegmentType;
  label: string;
  expectedDurationMinutes: number | null;
  plannedStart: string | null;  // "HH:MM" — user-set planned start time
  plannedEnd: string | null;    // "HH:MM" — user-set planned end time
  actualStart: string | null;
  actualEnd: string | null;
  holds: Hold[];
  notes: string;
  order: number;
}

export interface StaffBreak {
  id: string;
  minutes: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  arrival: string | null;    // ISO timestamp
  departure: string | null;  // ISO timestamp
  breaks: StaffBreak[];
}

/** Common theatre staff roles for the role autofill. */
export const COMMON_ROLES = [
  'Supervisor',
  'Stage Manager',
  'Deputy Stage Manager',
  'Assistant Stage Manager',
  'Lighting',
  'Lighting Op',
  'Sound',
  'Sound Op',
  'Stage',
  'Stage Crew',
  'Spot Op',
  'Followspot',
  'Flys',
  'Rigger',
  'Wardrobe',
  'Automation',
] as const;

/** Total break minutes for a staff member. */
export function staffBreakMinutes(m: StaffMember): number {
  return (m.breaks ?? []).reduce((acc, b) => acc + (b.minutes || 0), 0);
}

/** Gross worked ms (arrival→departure) minus break time; null if incomplete. */
export function staffWorkedMs(m: StaffMember): number | null {
  if (!m.arrival || !m.departure) return null;
  const gross = new Date(m.departure).getTime() - new Date(m.arrival).getTime();
  if (gross < 0) return null;
  return Math.max(0, gross - staffBreakMinutes(m) * 60_000);
}

export interface Show {
  id: string;
  title: string;
  production: string;
  date: string;
  plannedStartTime: string | null;
  doorsOpenTime: string | null;
  segments: Segment[];
  notes: string;
  techNotes: string;          // shown as "Tech Comments" in v2 UI
  // ── People face (v2) ──────────────────────────────────────────────────────
  staff: StaffMember[];
  clientArrival: string | null;     // ISO timestamp
  clientDeparture: string | null;   // ISO timestamp
  clientComments: string;
  clientSignature: string | null;   // base64 PNG data URL
  clientSignatureName: string;      // printed name of the signer
  createdAt: string;
  completedAt: string | null;
  // Run membership (optional — standalone shows omit these)
  runId?: string;
  performanceNumber?: number;
  performanceType?: PerformanceType;
  dayType?: DayType;
}

/**
 * Fill in v2 fields on shows loaded from older saved data so the rest of the
 * app can assume they always exist. Safe to run on already-current shows.
 */
export function normalizeShow(raw: Partial<Show> & { id: string }): Show {
  return {
    title: raw.title ?? '',
    production: raw.production ?? '',
    date: raw.date ?? new Date().toISOString().slice(0, 10),
    plannedStartTime: raw.plannedStartTime ?? null,
    doorsOpenTime: raw.doorsOpenTime ?? null,
    segments: (raw.segments ?? []).map(normalizeSegment),
    notes: raw.notes ?? '',
    techNotes: raw.techNotes ?? '',
    staff: (raw.staff ?? []).map(m => ({
      id: m.id, name: m.name ?? '', role: m.role ?? '',
      arrival: m.arrival ?? null, departure: m.departure ?? null,
      breaks: m.breaks ?? [],
    })),
    clientArrival: raw.clientArrival ?? null,
    clientDeparture: raw.clientDeparture ?? null,
    clientComments: raw.clientComments ?? '',
    clientSignature: raw.clientSignature ?? null,
    clientSignatureName: raw.clientSignatureName ?? '',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    completedAt: raw.completedAt ?? null,
    runId: raw.runId,
    performanceNumber: raw.performanceNumber,
    performanceType: raw.performanceType,
    dayType: raw.dayType,
    id: raw.id,
  };
}

function normalizeSegment(raw: Partial<Segment> & { id: string }): Segment {
  return {
    id: raw.id,
    type: raw.type ?? 'custom',
    label: raw.label ?? '',
    expectedDurationMinutes: raw.expectedDurationMinutes ?? null,
    plannedStart: raw.plannedStart ?? null,
    plannedEnd: raw.plannedEnd ?? null,
    actualStart: raw.actualStart ?? null,
    actualEnd: raw.actualEnd ?? null,
    holds: raw.holds ?? [],
    notes: raw.notes ?? '',
    order: raw.order ?? 0,
  };
}

export interface AppSettings {
  timeFormat: TimeFormat;
  reportTimeFormat: ReportTimeFormat;   // separate clock for generated reports
  showTimeStartsAt: ShowTimeBoundary;   // billing boundary for "in show" time
  preshowAlertsEnabled: boolean;
  preshowAlertMinutes: number[];
  intervalWarningEnabled: boolean;
  intervalWarningMinutes: number;
  startWithManualTime: boolean;
  autoStartNext: boolean;
  devMode: boolean;
}

/** Resolve the effective report clock from settings (handles 'match'). */
export function resolveReportFormat(s: AppSettings): TimeFormat {
  return s.reportTimeFormat === 'match' ? s.timeFormat : s.reportTimeFormat;
}

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  createdAt: number;
}

export function getSegmentStatus(segment: Segment): SegmentStatus {
  // Instant-complete types — marked complete as soon as actualStart is set
  if (segment.type === 'show_end' || segment.type === 'performance_start') {
    return segment.actualStart ? 'complete' : 'pending';
  }
  if (segment.actualStart && segment.actualEnd) return 'complete';
  if (segment.actualStart && !segment.actualEnd) return 'active';
  return 'pending';
}

export function getElapsedMs(segment: Segment, now: Date): number {
  if (!segment.actualStart) return 0;
  const start = new Date(segment.actualStart).getTime();
  const end = segment.actualEnd ? new Date(segment.actualEnd).getTime() : now.getTime();
  let holdMs = 0;
  for (const h of segment.holds) {
    const hStart = new Date(h.startTime).getTime();
    const hEnd = h.endTime ? new Date(h.endTime).getTime() : now.getTime();
    holdMs += hEnd - hStart;
  }
  return Math.max(0, end - start - holdMs);
}

const SHOW_CORE_TYPES = new Set<SegmentType>(['act', 'interval', 'curtain_call', 'custom']);
const PRODUCTION_TYPES = new Set<SegmentType>(['bump_in', 'bump_out', 'rehearsal', 'plotting']);

export function getTotalRunningMs(show: Show, now: Date): number {
  // Freeze at show_end time if marked
  const showEnd = show.segments.find(s => s.type === 'show_end');
  const cutoff = showEnd?.actualStart ? new Date(showEnd.actualStart) : now;
  return show.segments
    .filter(s => s.type !== 'doors' && s.type !== 'house_open' && s.type !== 'show_end')
    .reduce((acc, s) => acc + getElapsedMs(s, cutoff), 0);
}

export function getShowTimeMs(show: Show, now: Date): number {
  const showEnd = show.segments.find(s => s.type === 'show_end');
  const cutoff = showEnd?.actualStart ? new Date(showEnd.actualStart) : now;
  return show.segments
    .filter(s => SHOW_CORE_TYPES.has(s.type))
    .reduce((acc, s) => acc + getElapsedMs(s, cutoff), 0);
}

export function getProductionSegmentMs(show: Show, now: Date): number {
  return show.segments
    .filter(s => PRODUCTION_TYPES.has(s.type))
    .reduce((acc, s) => acc + getElapsedMs(s, now), 0);
}

// ── Client access (auto-derived from segments unless set manually) ────────────

/** Earliest actualStart across all segments, or null. */
export function derivedClientArrival(show: Show): string | null {
  let earliest: number | null = null;
  for (const s of show.segments) {
    if (s.actualStart) {
      const t = new Date(s.actualStart).getTime();
      if (earliest === null || t < earliest) earliest = t;
    }
  }
  return earliest !== null ? new Date(earliest).toISOString() : null;
}

/** Show-finish timestamp, else latest actualEnd across segments, or null. */
export function derivedClientDeparture(show: Show): string | null {
  const showEnd = show.segments.find(s => s.type === 'show_end');
  if (showEnd?.actualStart) return showEnd.actualStart;
  let latest: number | null = null;
  for (const s of show.segments) {
    if (s.actualEnd) {
      const t = new Date(s.actualEnd).getTime();
      if (latest === null || t > latest) latest = t;
    }
  }
  return latest !== null ? new Date(latest).toISOString() : null;
}

/** Manual client arrival if set, otherwise the auto-derived value. */
export function effectiveClientArrival(show: Show): string | null {
  return show.clientArrival ?? derivedClientArrival(show);
}

/** Manual client departure if set, otherwise the auto-derived value. */
export function effectiveClientDeparture(show: Show): string | null {
  return show.clientDeparture ?? derivedClientDeparture(show);
}

// ── v2 billable-time accounting ───────────────────────────────────────────────
// "In show" = pure performance time: first act/interval/curtain_call/custom
//   start → show_end. Doors and house_open are pre-performance and excluded.
// "Not in show" = everything else the crew works: doors, house_open, pre/post
//   show, changeover, bump in/out, rehearsal, plotting.

const NON_SHOW_TYPES = new Set<SegmentType>([
  'doors', 'house_open',
  'pre_show', 'performance_start', 'changeover',
  'bump_in', 'bump_out', 'rehearsal', 'plotting', 'post_show',
]);

/**
 * Total elapsed of the "in show" window — pure performance time.
 * Spans from the first act/interval/curtain_call/custom actualStart to the
 * show_end timestamp (or now). Changeover is subtracted for double-headers.
 */
export function getShowTimeWindowMs(show: Show, now: Date): number {
  const segs = [...show.segments].sort((a, b) => a.order - b.order);
  const windowTypes = new Set<SegmentType>([
    'act', 'interval', 'curtain_call', 'custom',
  ]);

  // Earliest actual start among performance segments = window start.
  let startMs: number | null = null;
  for (const s of segs) {
    if (windowTypes.has(s.type) && s.actualStart) {
      const t = new Date(s.actualStart).getTime();
      if (startMs === null || t < startMs) startMs = t;
    }
  }
  if (startMs === null) return 0;

  // Window end: show_end timestamp, else latest actualEnd among perf segs, else now.
  const showEnd = segs.find(s => s.type === 'show_end');
  let endMs: number;
  if (showEnd?.actualStart) {
    endMs = new Date(showEnd.actualStart).getTime();
  } else {
    let latest = startMs;
    for (const s of segs) {
      if (windowTypes.has(s.type)) {
        const e = s.actualEnd ? new Date(s.actualEnd).getTime() : (s.actualStart ? now.getTime() : 0);
        if (e > latest) latest = e;
      }
    }
    endMs = latest;
  }
  const windowMs = Math.max(0, endMs - startMs);

  // Subtract changeover time for double-header shows.
  const changeoverMs = segs
    .filter(s => s.type === 'changeover')
    .reduce((acc, s) => acc + getElapsedMs(s, now), 0);

  return Math.max(0, windowMs - changeoverMs);
}

/** Total elapsed of non-show (technical) segments: bump in/out, rehearsal, plotting. */
export function getNonShowTimeMs(show: Show, now: Date): number {
  return show.segments
    .filter(s => NON_SHOW_TYPES.has(s.type))
    .reduce((acc, s) => acc + getElapsedMs(s, now), 0);
}

export { SHOW_CORE_TYPES, PRODUCTION_TYPES, NON_SHOW_TYPES };
