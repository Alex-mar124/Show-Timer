export type TimeFormat = '12h' | '24h';
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
  | 'bump_out';

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

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  arrival: string | null;    // ISO timestamp
  departure: string | null;  // ISO timestamp
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
    staff: raw.staff ?? [],
    clientArrival: raw.clientArrival ?? null,
    clientDeparture: raw.clientDeparture ?? null,
    clientComments: raw.clientComments ?? '',
    clientSignature: raw.clientSignature ?? null,
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
  preshowAlertsEnabled: boolean;
  preshowAlertMinutes: number[];
  intervalWarningEnabled: boolean;
  intervalWarningMinutes: number;
  startWithManualTime: boolean;
  autoStartNext: boolean;
}

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  createdAt: number;
}

export function getSegmentStatus(segment: Segment): SegmentStatus {
  // show_end is a single timestamp — marked complete as soon as actualStart is set
  if (segment.type === 'show_end') {
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

// ── v2 billable-time accounting ───────────────────────────────────────────────
// "Show time" = the window the audience/client is in for the performance:
// doors open → show finish (doors counted as show time).
// "Non-show time" = technical work outside that window: bump in/out,
// rehearsal, plotting.

const NON_SHOW_TYPES = new Set<SegmentType>(['bump_in', 'bump_out', 'rehearsal', 'plotting']);

/**
 * Total elapsed of the "in show" window. Spans from the earliest started
 * doors/house/show-core segment to the show-finish timestamp (or now if the
 * show hasn't finished). Falls back to summing show-core segments when no
 * doors segment exists.
 */
export function getShowTimeWindowMs(show: Show, now: Date): number {
  const segs = [...show.segments].sort((a, b) => a.order - b.order);
  const windowTypes = new Set<SegmentType>([
    'doors', 'house_open', 'act', 'interval', 'curtain_call', 'custom',
  ]);

  // Earliest actual start among in-window segments = window start.
  let startMs: number | null = null;
  for (const s of segs) {
    if (windowTypes.has(s.type) && s.actualStart) {
      const t = new Date(s.actualStart).getTime();
      if (startMs === null || t < startMs) startMs = t;
    }
  }
  if (startMs === null) return 0;

  // Window end: show_end timestamp, else latest actualEnd, else now.
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
  return Math.max(0, endMs - startMs);
}

/** Total elapsed of non-show (technical) segments: bump in/out, rehearsal, plotting. */
export function getNonShowTimeMs(show: Show, now: Date): number {
  return show.segments
    .filter(s => NON_SHOW_TYPES.has(s.type))
    .reduce((acc, s) => acc + getElapsedMs(s, now), 0);
}

export { SHOW_CORE_TYPES, PRODUCTION_TYPES, NON_SHOW_TYPES };
