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
  actualStart: string | null;
  actualEnd: string | null;
  holds: Hold[];
  notes: string;
  order: number;
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
  techNotes: string;
  createdAt: string;
  completedAt: string | null;
  // Run membership (optional — standalone shows omit these)
  runId?: string;
  performanceNumber?: number;
  performanceType?: PerformanceType;
  dayType?: DayType;
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

export function getTotalRunningMs(show: Show, now: Date): number {
  // Freeze at show_end time if it has been marked — never count beyond that point
  const showEnd = show.segments.find(s => s.type === 'show_end');
  const cutoff = showEnd?.actualStart ? new Date(showEnd.actualStart) : now;

  return show.segments
    .filter(s => s.type !== 'doors' && s.type !== 'house_open' && s.type !== 'show_end')
    .reduce((acc, s) => acc + getElapsedMs(s, cutoff), 0);
}
