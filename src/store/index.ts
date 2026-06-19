import { create } from 'zustand';
import type { Show, Run, Segment, SegmentType, StaffMember, StaffBreak, TemplateSegment, PerformanceType, CopyStrategy, DayType, AppSettings, Toast, View, TimeFormat, SessionState, SessionPeer, DiscoveredSession } from '../types';
import { normalizeShow } from '../types';
import { nowISO, todayISO } from '../utils/time';

// ── Session helpers (called from store actions) ───────────────────────────────

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

function defaultSession(): SessionState {
  return {
    mode: 'none',
    sessionName: '',
    pin: '',
    hostIp: '',
    localIp: '',
    peers: [],
    panelOpen: false,
    scanning: false,
    discovered: [],
    connecting: false,
    connectError: '',
    lastSyncId: '',
  };
}

function uid(): string {
  return crypto.randomUUID();
}

function defaultSettings(): AppSettings {
  return {
    timeFormat: '24h',
    reportTimeFormat: 'match',
    showTimeStartsAt: 'doors',
    preshowAlertsEnabled: true,
    preshowAlertMinutes: [30, 10, 5],
    intervalWarningEnabled: true,
    intervalWarningMinutes: 5,
    startWithManualTime: false,
    autoStartNext: true,
    devMode: false,
  };
}

function defaultSegments(): Segment[] {
  // v2: bump-in is NOT auto-started — it waits for the operator. Show finish
  // is added manually via the "＋ Show Finish" action, so it's omitted here.
  const types: Array<{ type: SegmentType; label: string; exp: number | null }> = [
    { type: 'bump_in',  label: 'Bump In',  exp: null },
    { type: 'doors',    label: 'Doors',    exp: 30 },
    { type: 'act',      label: 'Act 1',    exp: 55 },
    { type: 'interval', label: 'Interval', exp: 20 },
    { type: 'act',      label: 'Act 2',    exp: 55 },
  ];
  return types.map((t, i) => ({
    id: uid(),
    type: t.type,
    label: t.label,
    expectedDurationMinutes: t.exp,
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    holds: [],
    notes: '',
    order: i,
  }));
}

// ── Schedule reconciliation (v2 Phase 3) ──────────────────────────────────────
// Keeps plannedStart, plannedEnd and expectedDurationMinutes consistent:
// end = start + duration. When the user edits one field we derive the others.

function hmToMin(hm: string | null): number | null {
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}
function minToHm(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440; // wrap across midnight
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

type ScheduleEdit = 'plannedStart' | 'plannedEnd' | 'expectedDuration';

/** Return a patch of {plannedStart?, plannedEnd?, expectedDurationMinutes?} that
 *  reconciles the segment after `edited` changed. The edited field is authoritative. */
function reconcileSchedule(seg: Segment, edited: ScheduleEdit): Partial<Segment> {
  const start = hmToMin(seg.plannedStart);
  const end = hmToMin(seg.plannedEnd);
  const dur = seg.expectedDurationMinutes;
  const patch: Partial<Segment> = {};

  const durFromSpan = (s: number, e: number) => {
    let d = e - s;
    if (d < 0) d += 1440; // overnight span
    return d;
  };

  if (edited === 'plannedStart' && start !== null) {
    if (dur != null) patch.plannedEnd = minToHm(start + dur);
    else if (end !== null) patch.expectedDurationMinutes = durFromSpan(start, end);
  } else if (edited === 'plannedEnd' && end !== null) {
    if (start !== null) patch.expectedDurationMinutes = durFromSpan(start, end);
    else if (dur != null) patch.plannedStart = minToHm(end - dur);
  } else if (edited === 'expectedDuration' && dur != null) {
    if (start !== null) patch.plannedEnd = minToHm(start + dur);
    else if (end !== null) patch.plannedStart = minToHm(end - dur);
  }
  return patch;
}

/** Fresh People-face defaults for a new show. */
function defaultPeople(): Pick<Show, 'staff' | 'clientArrival' | 'clientDeparture' | 'clientComments' | 'clientSignature'> {
  return { staff: [], clientArrival: null, clientDeparture: null, clientComments: '', clientSignature: null };
}

interface ShowStore {
  // Data
  shows: Show[];
  currentShowId: string | null;
  runs: Run[];
  // UI
  view: View;
  reportOpen: boolean;
  newShowModalOpen: boolean;
  newRunModalOpen: boolean;
  toasts: Toast[];
  // Settings
  settings: AppSettings;
  initialized: boolean;
  // Dev tooling
  devClockOffsetMs: number;

  // Lifecycle
  initialize: () => Promise<void>;
  saveToStore: () => Promise<void>;

  // Show actions
  createShow: (data: { title: string; production: string; date: string; plannedStartTime: string | null; doorsOpenTime: string | null }) => void;
  setCurrentShow: (id: string) => void;
  updateShowNotes: (id: string, notes: string) => void;
  updateTechNotes: (id: string, techNotes: string) => void;
  completeShow: (id: string) => void;
  deleteShow: (id: string) => void;
  importBundle: (data: { runs: Run[]; shows: Show[] }) => { showCount: number; runCount: number };

  // Dev tooling
  bumpDevClock: (ms: number) => void;
  resetDevClock: () => void;
  seedDevData: () => void;
  clearAllData: () => void;

  // People-face actions (v2)
  addStaff: (showId: string) => void;
  updateStaff: (showId: string, staffId: string, patch: Partial<StaffMember>) => void;
  removeStaff: (showId: string, staffId: string) => void;
  addStaffBreak: (showId: string, staffId: string, minutes: number) => void;
  updateStaffBreak: (showId: string, staffId: string, breakId: string, minutes: number) => void;
  removeStaffBreak: (showId: string, staffId: string, breakId: string) => void;
  setClientTime: (showId: string, field: 'clientArrival' | 'clientDeparture', time: Date | null) => void;
  updateClientComments: (showId: string, comments: string) => void;
  setSignature: (showId: string, dataUrl: string | null) => void;

  // Show-finish helper (v2 — added manually)
  addShowFinish: (showId: string) => void;

  // Run actions
  createRun: (data: {
    name: string; production: string; venue: string;
    performanceType: PerformanceType | null; copyStrategy: CopyStrategy;
    defaultDoorsTime: string; defaultShowStartTime: string;
    templateSegments: TemplateSegment[];
    firstShowDate: string; firstPerformanceType?: PerformanceType;
    firstDayType?: DayType;
  }) => void;
  startNextPerformance: (runId: string, performanceType?: PerformanceType, dayType?: DayType) => void;
  completeRun: (runId: string) => void;
  deleteRun: (runId: string) => void;
  updateRunNotes: (runId: string, notes: string) => void;
  syncTemplateFromShow: (runId: string, showId: string) => void;
  setNewRunModalOpen: (open: boolean) => void;

  // Segment actions
  startSegment: (showId: string, segmentId: string, time?: Date) => void;
  stopSegment: (showId: string, segmentId: string, time?: Date) => void;
  holdSegment: (showId: string, segmentId: string) => void;
  resumeSegment: (showId: string, segmentId: string) => void;
  setSegmentTime: (showId: string, segmentId: string, field: 'actualStart' | 'actualEnd', time: Date | null) => void;
  updateSegmentLabel: (showId: string, segmentId: string, label: string) => void;
  updateSegmentExpected: (showId: string, segmentId: string, minutes: number | null) => void;
  updateSegmentNotes: (showId: string, segmentId: string, notes: string) => void;
  updateSegmentSchedule: (showId: string, segmentId: string, field: 'plannedStart' | 'plannedEnd', value: string | null) => void;
  addSegment: (showId: string, type: SegmentType, afterOrder?: number) => void;
  removeSegment: (showId: string, segmentId: string) => void;
  reorderSegments: (showId: string, orderedIds: string[]) => void;
  advanceSegment: (showId: string, currentSegmentId: string) => void;

  // UI actions
  setView: (view: View) => void;
  setReportOpen: (open: boolean) => void;
  setNewShowModalOpen: (open: boolean) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  addToast: (t: Omit<Toast, 'id' | 'createdAt'>) => void;
  removeToast: (id: string) => void;

  // Session
  session: SessionState;
  setSessionPanel: (open: boolean) => void;
  setSessionScanning: (scanning: boolean) => void;
  scanSessions: () => Promise<DiscoveredSession[]>;
  hostSession: (name: string, pin: string, deviceName: string) => Promise<void>;
  stopHosting: () => Promise<void>;
  joinSession: (ip: string, port: number, pin: string, deviceName: string, deviceType: string) => Promise<void>;
  leaveSession: () => Promise<void>;
  applyRemoteShowState: (showJson: string, syncId: string) => void;
  onPeerJoined: (peer: SessionPeer) => void;
  onPeerLeft: (peerId: string) => void;
  onSessionDisconnected: () => void;
  broadcastCurrentShow: () => Promise<void>;
}

async function loadTauriStore() {
  try {
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load('show-timer.json', { autoSave: false, defaults: {} });
    const rawShows = (await store.get<Show[]>('shows')) ?? [];
    const shows = rawShows.map(normalizeShow); // migrate older saved shows to v2 shape
    const currentShowId = (await store.get<string | null>('currentShowId')) ?? null;
    const runs = (await store.get<Run[]>('runs')) ?? [];
    const savedSettings = await store.get<Partial<AppSettings>>('settings');
    const settings = { ...defaultSettings(), ...(savedSettings ?? {}) }; // fill new v2 fields
    return { shows, currentShowId, runs, settings };
  } catch {
    return { shows: [], currentShowId: null, runs: [], settings: defaultSettings() };
  }
}

async function saveTauriStore(state: { shows: Show[]; currentShowId: string | null; runs: Run[]; settings: AppSettings }) {
  try {
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load('show-timer.json', { autoSave: false, defaults: {} });
    await store.set('shows', state.shows);
    await store.set('currentShowId', state.currentShowId);
    await store.set('runs', state.runs);
    await store.set('settings', state.settings);
    await store.save();
  } catch {
    // Browser dev mode — silently skip
  }
}

/** Hard-clears the store file — required on macOS/Apple Silicon where key overwrite
 *  alone may not flush. Preserves settings so preferences survive a "clear data". */
async function clearTauriStore(settings: AppSettings) {
  try {
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load('show-timer.json', { autoSave: false, defaults: {} });
    await store.clear();
    await store.set('shows', []);
    await store.set('currentShowId', null);
    await store.set('runs', []);
    await store.set('settings', settings);
    await store.save();
  } catch {
    // Browser dev mode — silently skip
  }
}

export const useShowStore = create<ShowStore>((set, get) => ({
  shows: [],
  currentShowId: null,
  runs: [],
  view: 'timer',
  reportOpen: true,
  newShowModalOpen: false,
  newRunModalOpen: false,
  toasts: [],
  settings: defaultSettings(),
  initialized: false,
  devClockOffsetMs: 0,
  session: defaultSession(),

  initialize: async () => {
    const data = await loadTauriStore();
    set({ ...data, initialized: true });

    // Honour CLI dev flags (--dev / --seed / --scenario=…); no-op in browser.
    const flags = await invokeTauri<{ dev: boolean; seed: boolean; scenario?: string }>('dev_flags');
    if (flags?.dev) {
      set(s => ({ settings: { ...s.settings, devMode: true } }));
    }
    if (flags?.seed && get().shows.length === 0) {
      get().seedDevData();
    }
  },

  saveToStore: async () => {
    const { shows, currentShowId, runs, settings, session, broadcastCurrentShow } = get();
    await saveTauriStore({ shows, currentShowId, runs, settings });
    // Broadcast show changes to any connected session peers
    if (session.mode !== 'none') {
      broadcastCurrentShow();
    }
  },

  createShow: (data) => {
    const show: Show = {
      id: uid(),
      title: data.title,
      production: data.production,
      date: data.date,
      plannedStartTime: data.plannedStartTime,
      doorsOpenTime: data.doorsOpenTime,
      segments: defaultSegments(),
      notes: '',
      techNotes: '',
      ...defaultPeople(),
      createdAt: nowISO(),
      completedAt: null,
    };
    set(s => ({ shows: [show, ...s.shows], currentShowId: show.id, newShowModalOpen: false }));
    get().saveToStore();
  },

  setCurrentShow: (id) => {
    set({ currentShowId: id, view: 'timer' });
    get().saveToStore();
  },

  updateShowNotes: (id, notes) => {
    set(s => ({ shows: s.shows.map(sh => sh.id === id ? { ...sh, notes } : sh) }));
    get().saveToStore();
  },

  updateTechNotes: (id, techNotes) => {
    set(s => ({ shows: s.shows.map(sh => sh.id === id ? { ...sh, techNotes } : sh) }));
    get().saveToStore();
  },

  completeShow: (id) => {
    set(s => ({ shows: s.shows.map(sh => sh.id === id ? { ...sh, completedAt: nowISO() } : sh) }));
    get().saveToStore();
  },

  deleteShow: (id) => {
    const { shows } = get();
    const show = shows.find(sh => sh.id === id);
    set(s => ({
      shows: s.shows.filter(sh => sh.id !== id),
      currentShowId: s.currentShowId === id ? (s.shows.find(sh => sh.id !== id)?.id ?? null) : s.currentShowId,
      // Remove from parent run if applicable
      runs: show?.runId
        ? s.runs.map(r => r.id === show.runId ? { ...r, showIds: r.showIds.filter(sid => sid !== id) } : r)
        : s.runs,
    }));
    get().saveToStore();
  },

  importBundle: (data) => {
    // Remap all IDs so imported data can't collide with existing records.
    const runIdMap = new Map<string, string>();
    for (const r of data.runs) runIdMap.set(r.id, uid());
    const showIdMap = new Map<string, string>();
    for (const sh of data.shows) showIdMap.set(sh.id, uid());

    const newRuns: Run[] = data.runs.map(r => ({
      ...r,
      id: runIdMap.get(r.id)!,
      showIds: r.showIds.map(sid => showIdMap.get(sid)).filter((x): x is string => !!x),
      createdAt: nowISO(),
    }));

    const newShows: Show[] = data.shows.map(sh => ({
      ...sh,
      id: showIdMap.get(sh.id)!,
      runId: sh.runId ? (runIdMap.get(sh.runId) ?? undefined) : undefined,
      createdAt: nowISO(),
    }));

    const firstId = newShows[0]?.id ?? null;
    set(s => ({
      runs: [...newRuns, ...s.runs],
      shows: [...newShows, ...s.shows],
      currentShowId: firstId ?? s.currentShowId,
      view: 'timer',
    }));
    get().saveToStore();
    return { showCount: newShows.length, runCount: newRuns.length };
  },

  // ── Dev tooling ─────────────────────────────────────────────────────────────

  bumpDevClock: (ms) => set(s => ({ devClockOffsetMs: s.devClockOffsetMs + ms })),
  resetDevClock: () => set({ devClockOffsetMs: 0 }),

  seedDevData: () => {
    // Lazy import to keep seed data out of the production bundle's hot path.
    import('../utils/devSeed').then(({ buildSeedData }) => {
      const { runs, shows } = buildSeedData();
      get().importBundle({ runs, shows });
      get().addToast({ title: 'Dev data seeded', message: `${shows.length} shows`, type: 'success' });
    });
  },

  clearAllData: () => {
    const { settings } = get();
    set({ shows: [], runs: [], currentShowId: null, devClockOffsetMs: 0 });
    // Use explicit store.clear() so macOS/Apple Silicon actually flushes the file.
    clearTauriStore(settings);
    get().addToast({ title: 'All data cleared', message: 'Shows and runs removed', type: 'warning' });
  },

  // ── People-face actions (v2) ────────────────────────────────────────────────

  addStaff: (showId) => {
    const member: StaffMember = { id: uid(), name: '', role: '', arrival: null, departure: null, breaks: [] };
    set(s => ({
      shows: s.shows.map(sh => sh.id !== showId ? sh : { ...sh, staff: [...sh.staff, member] }),
    }));
    get().saveToStore();
  },

  updateStaff: (showId, staffId, patch) => {
    set(s => ({
      shows: s.shows.map(sh => sh.id !== showId ? sh : {
        ...sh,
        staff: sh.staff.map(m => m.id !== staffId ? m : { ...m, ...patch }),
      }),
    }));
    get().saveToStore();
  },

  removeStaff: (showId, staffId) => {
    set(s => ({
      shows: s.shows.map(sh => sh.id !== showId ? sh : {
        ...sh,
        staff: sh.staff.filter(m => m.id !== staffId),
      }),
    }));
    get().saveToStore();
  },

  addStaffBreak: (showId, staffId, minutes) => {
    const br: StaffBreak = { id: uid(), minutes };
    set(s => ({
      shows: s.shows.map(sh => sh.id !== showId ? sh : {
        ...sh,
        staff: sh.staff.map(m => m.id !== staffId ? m : { ...m, breaks: [...m.breaks, br] }),
      }),
    }));
    get().saveToStore();
  },

  updateStaffBreak: (showId, staffId, breakId, minutes) => {
    set(s => ({
      shows: s.shows.map(sh => sh.id !== showId ? sh : {
        ...sh,
        staff: sh.staff.map(m => m.id !== staffId ? m : {
          ...m, breaks: m.breaks.map(b => b.id !== breakId ? b : { ...b, minutes }),
        }),
      }),
    }));
    get().saveToStore();
  },

  removeStaffBreak: (showId, staffId, breakId) => {
    set(s => ({
      shows: s.shows.map(sh => sh.id !== showId ? sh : {
        ...sh,
        staff: sh.staff.map(m => m.id !== staffId ? m : {
          ...m, breaks: m.breaks.filter(b => b.id !== breakId),
        }),
      }),
    }));
    get().saveToStore();
  },

  setClientTime: (showId, field, time) => {
    const t = time ? time.toISOString() : null;
    set(s => ({
      shows: s.shows.map(sh => sh.id !== showId ? sh : { ...sh, [field]: t }),
    }));
    get().saveToStore();
  },

  updateClientComments: (showId, comments) => {
    set(s => ({
      shows: s.shows.map(sh => sh.id !== showId ? sh : { ...sh, clientComments: comments }),
    }));
    get().saveToStore();
  },

  setSignature: (showId, dataUrl) => {
    set(s => ({
      shows: s.shows.map(sh => sh.id !== showId ? sh : { ...sh, clientSignature: dataUrl }),
    }));
    get().saveToStore();
  },

  addShowFinish: (showId) => {
    set(s => {
      const show = s.shows.find(sh => sh.id === showId);
      if (!show) return s;
      // Only one show-finish per show.
      if (show.segments.some(seg => seg.type === 'show_end')) return s;
      const maxOrder = show.segments.reduce((m, seg) => Math.max(m, seg.order), -1);
      const seg: Segment = {
        id: uid(), type: 'show_end', label: 'Show Finish',
        expectedDurationMinutes: null, plannedStart: null, plannedEnd: null,
        actualStart: null, actualEnd: null, holds: [], notes: '', order: maxOrder + 1,
      };
      return { shows: s.shows.map(sh => sh.id !== showId ? sh : { ...sh, segments: [...sh.segments, seg] }) };
    });
    get().saveToStore();
  },

  startSegment: (showId, segmentId, time) => {
    const t = (time ?? new Date()).toISOString();
    set(s => ({
      shows: s.shows.map(sh =>
        sh.id !== showId ? sh : {
          ...sh,
          segments: sh.segments.map(seg =>
            seg.id !== segmentId ? seg : {
              ...seg,
              actualStart: t,
              // show_end is a single timestamp — mark it complete immediately
              actualEnd: seg.type === 'show_end' ? t : null,
              holds: [],
            }
          ),
        }
      ),
    }));
    get().saveToStore();
  },

  stopSegment: (showId, segmentId, time) => {
    const t = (time ?? new Date()).toISOString();
    const { settings } = get();
    set(s => {
      const show = s.shows.find(sh => sh.id === showId);
      if (!show) return s;
      const sorted = [...show.segments].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(seg => seg.id === segmentId);
      // Find next segment that hasn't started yet
      const nextSeg = settings.autoStartNext
        ? sorted.find((seg, i) => i > idx && !seg.actualStart)
        : undefined;
      return {
        shows: s.shows.map(sh =>
          sh.id !== showId ? sh : {
            ...sh,
            segments: sh.segments.map(seg => {
              if (seg.id === segmentId) return { ...seg, actualEnd: t };
              if (nextSeg && seg.id === nextSeg.id) return { ...seg, actualStart: t, actualEnd: null, holds: [] };
              return seg;
            }),
          }
        ),
      };
    });
    get().saveToStore();
  },

  holdSegment: (showId, segmentId) => {
    const hold = { id: uid(), startTime: nowISO(), endTime: null };
    set(s => ({
      shows: s.shows.map(sh =>
        sh.id !== showId ? sh : {
          ...sh,
          segments: sh.segments.map(seg =>
            seg.id !== segmentId ? seg : { ...seg, holds: [...seg.holds, hold] }
          ),
        }
      ),
    }));
    get().saveToStore();
  },

  resumeSegment: (showId, segmentId) => {
    const now = nowISO();
    set(s => ({
      shows: s.shows.map(sh =>
        sh.id !== showId ? sh : {
          ...sh,
          segments: sh.segments.map(seg =>
            seg.id !== segmentId ? seg : {
              ...seg,
              holds: seg.holds.map((h, i) =>
                i === seg.holds.length - 1 && !h.endTime ? { ...h, endTime: now } : h
              ),
            }
          ),
        }
      ),
    }));
    get().saveToStore();
  },

  setSegmentTime: (showId, segmentId, field, time) => {
    const t = time ? time.toISOString() : null;
    set(s => ({
      shows: s.shows.map(sh =>
        sh.id !== showId ? sh : {
          ...sh,
          segments: sh.segments.map(seg =>
            seg.id !== segmentId ? seg : { ...seg, [field]: t }
          ),
        }
      ),
    }));
    get().saveToStore();
  },

  updateSegmentLabel: (showId, segmentId, label) => {
    set(s => ({
      shows: s.shows.map(sh =>
        sh.id !== showId ? sh : {
          ...sh,
          segments: sh.segments.map(seg =>
            seg.id !== segmentId ? seg : { ...seg, label }
          ),
        }
      ),
    }));
    get().saveToStore();
  },

  updateSegmentExpected: (showId, segmentId, minutes) => {
    set(s => ({
      shows: s.shows.map(sh =>
        sh.id !== showId ? sh : {
          ...sh,
          segments: sh.segments.map(seg => {
            if (seg.id !== segmentId) return seg;
            const next = { ...seg, expectedDurationMinutes: minutes };
            return { ...next, ...reconcileSchedule(next, 'expectedDuration') };
          }),
        }
      ),
    }));
    get().saveToStore();
  },

  updateSegmentNotes: (showId, segmentId, notes) => {
    set(s => ({
      shows: s.shows.map(sh =>
        sh.id !== showId ? sh : {
          ...sh,
          segments: sh.segments.map(seg =>
            seg.id !== segmentId ? seg : { ...seg, notes }
          ),
        }
      ),
    }));
    get().saveToStore();
  },

  updateSegmentSchedule: (showId, segmentId, field, value) => {
    set(s => ({
      shows: s.shows.map(sh =>
        sh.id !== showId ? sh : {
          ...sh,
          segments: sh.segments.map(seg => {
            if (seg.id !== segmentId) return seg;
            const next = { ...seg, [field]: value || null };
            // Clearing a field shouldn't trigger derivation.
            if (!value) return next;
            return { ...next, ...reconcileSchedule(next, field) };
          }),
        }
      ),
    }));
    get().saveToStore();
  },

  addSegment: (showId, type, afterOrder) => {
    const labelMap: Record<SegmentType, string> = {
      pre_show: 'Pre Show',
      doors: 'Doors Open', house_open: 'House Open', act: 'Act',
      interval: 'Interval', curtain_call: 'Curtain Call', show_end: 'Show End', custom: 'Custom',
      rehearsal: 'Rehearsal', plotting: 'Plotting Session',
      bump_in: 'Bump In', bump_out: 'Bump Out',
      post_show: 'Post Show',
    };
    const defaultDuration: Partial<Record<SegmentType, number>> = {
      pre_show: 60, act: 55, interval: 20, rehearsal: 240, plotting: 300, doors: 30, post_show: 30,
    };
    set(s => {
      const show = s.shows.find(sh => sh.id === showId);
      if (!show) return s;
      const order = afterOrder !== undefined ? afterOrder + 0.5 : show.segments.length;
      const seg: Segment = {
        id: uid(), type, label: labelMap[type],
        expectedDurationMinutes: defaultDuration[type] ?? null,
        plannedStart: null, plannedEnd: null,
        actualStart: null, actualEnd: null, holds: [], notes: '', order,
      };
      const updated = [...show.segments, seg]
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({ ...s, order: i }));
      return { shows: s.shows.map(sh => sh.id !== showId ? sh : { ...sh, segments: updated }) };
    });
    get().saveToStore();
  },

  removeSegment: (showId, segmentId) => {
    set(s => ({
      shows: s.shows.map(sh =>
        sh.id !== showId ? sh : {
          ...sh,
          segments: sh.segments
            .filter(seg => seg.id !== segmentId)
            .map((seg, i) => ({ ...seg, order: i })),
        }
      ),
    }));
    get().saveToStore();
  },

  advanceSegment: (showId, currentSegmentId) => {
    const t = new Date().toISOString();
    set(s => {
      const show = s.shows.find(sh => sh.id === showId);
      if (!show) return s;
      const sorted = [...show.segments].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(seg => seg.id === currentSegmentId);
      const nextSeg = sorted.find((seg, i) => i > idx && !seg.actualStart);
      return {
        shows: s.shows.map(sh =>
          sh.id !== showId ? sh : {
            ...sh,
            segments: sh.segments.map(seg => {
              if (seg.id === currentSegmentId) return { ...seg, actualEnd: t };
              if (nextSeg && seg.id === nextSeg.id) return {
                ...seg,
                actualStart: t,
                // show_end is a single-timestamp event — instantly complete
                actualEnd: seg.type === 'show_end' ? t : null,
                holds: [],
              };
              return seg;
            }),
          }
        ),
      };
    });
    get().saveToStore();
  },

  reorderSegments: (showId, orderedIds) => {
    set(s => ({
      shows: s.shows.map(sh =>
        sh.id !== showId ? sh : {
          ...sh,
          segments: sh.segments.map(seg => ({
            ...seg,
            order: orderedIds.indexOf(seg.id),
          })),
        }
      ),
    }));
    get().saveToStore();
  },

  // ── Run actions ───────────────────────────────────────────────────────────

  createRun: (data) => {
    const runId = uid();
    const firstDayType: DayType = data.firstDayType ?? 'performance';
    const run: Run = {
      id: runId,
      name: data.name || data.production,
      production: data.production,
      venue: data.venue,
      performanceType: data.performanceType,
      copyStrategy: data.copyStrategy,
      defaultDoorsTime: data.defaultDoorsTime,
      defaultShowStartTime: data.defaultShowStartTime,
      templateSegments: data.templateSegments,
      showIds: [],
      notes: '',
      createdAt: nowISO(),
      completedAt: null,
    };

    // Build first day's segments
    function toISO(dateStr: string, timeStr: string): string | null {
      if (!timeStr) return null;
      const [h, m] = timeStr.split(':').map(Number);
      const d = new Date(dateStr);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    }

    const NON_PERF_SINGLE: Partial<Record<DayType, { type: SegmentType; label: string; exp: number | null }>> = {
      rehearsal: { type: 'rehearsal', label: 'Rehearsal',        exp: 240 },
      plotting:  { type: 'plotting',  label: 'Plotting Session', exp: 300 },
      bump_in:   { type: 'bump_in',   label: 'Bump In',          exp: null },
      bump_out:  { type: 'bump_out',  label: 'Bump Out',         exp: null },
    };

    let segments: Segment[];
    if (firstDayType === 'performance') {
      segments = data.templateSegments.map(t => ({
        id: uid(), type: t.type, label: t.label,
        expectedDurationMinutes: t.expectedDurationMinutes,
        plannedStart: null, plannedEnd: null,
        actualStart: null, actualEnd: null, holds: [], notes: '', order: t.order,
      }));
    } else {
      const def = NON_PERF_SINGLE[firstDayType]!;
      segments = [{ id: uid(), type: def.type, label: def.label, expectedDurationMinutes: def.exp, plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null, holds: [], notes: '', order: 0 }];
    }

    const DAY_TITLES: Record<DayType, string> = {
      performance: 'Night 1', rehearsal: 'Rehearsal', plotting: 'Plotting',
      bump_in: 'Bump In', bump_out: 'Bump Out',
    };

    const showId = uid();
    const firstShow: Show = {
      id: showId,
      title: DAY_TITLES[firstDayType],
      production: data.production,
      date: data.firstShowDate,
      plannedStartTime: toISO(data.firstShowDate, data.defaultShowStartTime),
      doorsOpenTime: toISO(data.firstShowDate, data.defaultDoorsTime),
      segments,
      notes: '',
      techNotes: '',
      ...defaultPeople(),
      createdAt: nowISO(),
      completedAt: null,
      runId,
      performanceNumber: 1,
      performanceType: firstDayType === 'performance' ? (data.firstPerformanceType ?? data.performanceType ?? undefined) : undefined,
      dayType: firstDayType === 'performance' ? undefined : firstDayType,
    };

    run.showIds = [showId];

    set(s => ({
      runs: [run, ...s.runs],
      shows: [firstShow, ...s.shows],
      currentShowId: showId,
      newRunModalOpen: false,
      view: 'timer',
    }));
    get().saveToStore();
  },

  startNextPerformance: (runId, performanceType, dayType = 'performance') => {
    const { runs, shows } = get();
    const run = runs.find(r => r.id === runId);
    if (!run) return;

    const lastShowId = run.showIds[run.showIds.length - 1];
    const lastShow = shows.find(s => s.id === lastShowId);
    if (!lastShow) return;

    // Advance date by 1 day — use local year/month/date to avoid UTC timezone offset bugs
    const [ly, lm, ld] = lastShow.date.split('-').map(Number);
    const localNext = new Date(ly, lm - 1, ld + 1);
    const nextDate = `${localNext.getFullYear()}-${String(localNext.getMonth() + 1).padStart(2, '0')}-${String(localNext.getDate()).padStart(2, '0')}`;

    function toISO(dateStr: string, timeStr: string): string | null {
      if (!timeStr) return null;
      const [h, m] = timeStr.split(':').map(Number);
      const d = new Date(dateStr);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    }

    // Single-segment templates for non-performance days
    type SegDef = { type: SegmentType; label: string; expectedDurationMinutes: number | null; order: number };
    const NON_PERF: Partial<Record<DayType, SegDef[]>> = {
      rehearsal: [{ type: 'rehearsal', label: 'Rehearsal',        expectedDurationMinutes: 240,  order: 0 }],
      plotting:  [{ type: 'plotting',  label: 'Plotting Session', expectedDurationMinutes: 300,  order: 0 }],
      bump_in:   [{ type: 'bump_in',   label: 'Bump In',          expectedDurationMinutes: null, order: 0 }],
      bump_out:  [{ type: 'bump_out',  label: 'Bump Out',         expectedDurationMinutes: null, order: 0 }],
    };

    // Choose copy source based on dayType
    const sourceSegments =
      NON_PERF[dayType]
      ?? (run.copyStrategy === 'last_show'
        ? [...lastShow.segments].sort((a, b) => a.order - b.order)
        : [...run.templateSegments].sort((a, b) => a.order - b.order));

    let segments: Segment[] = sourceSegments.map(s => ({
      id: uid(),
      type: s.type,
      label: s.label,
      expectedDurationMinutes: s.expectedDurationMinutes,
      plannedStart: null,
      plannedEnd: null,
      actualStart: null,
      actualEnd: null,
      holds: [],
      notes: '',
      order: s.order,
    }));

    // Auto-inject pre/post show for performance days if not already present
    if (dayType === 'performance') {
      if (!segments.some(s => s.type === 'pre_show')) {
        segments = [
          { id: uid(), type: 'pre_show', label: 'Pre Show', expectedDurationMinutes: 60, plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null, holds: [], notes: '', order: -1 },
          ...segments,
        ];
      }
      if (!segments.some(s => s.type === 'post_show')) {
        segments = [
          ...segments,
          { id: uid(), type: 'post_show', label: 'Post Show', expectedDurationMinutes: 30, plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null, holds: [], notes: '', order: segments.length },
        ];
      }
      segments = segments.map((s, i) => ({ ...s, order: i }));
    }

    const perfNumber = run.showIds.length + 1;
    const showId = uid();

    const DAY_LABELS: Record<DayType, string> = {
      performance: `Night ${perfNumber}`, rehearsal: 'Rehearsal',
      plotting: 'Plotting', bump_in: 'Bump In', bump_out: 'Bump Out',
    };
    const dayLabel = DAY_LABELS[dayType];

    // Carry forward tech notes from last show
    const techNotes = lastShow.techNotes
      ? `From ${lastShow.date}: ${lastShow.techNotes}\n---\n`
      : '';

    const newShow: Show = {
      id: showId,
      title: dayLabel,
      production: run.production,
      date: nextDate,
      plannedStartTime: toISO(nextDate, run.defaultShowStartTime),
      doorsOpenTime: toISO(nextDate, run.defaultDoorsTime),
      segments,
      notes: '',
      techNotes,
      ...defaultPeople(),
      createdAt: nowISO(),
      completedAt: null,
      runId,
      performanceNumber: perfNumber,
      performanceType: dayType === 'performance' ? (performanceType ?? run.performanceType ?? undefined) : undefined,
      dayType,
    };

    set(s => ({
      shows: [newShow, ...s.shows],
      runs: s.runs.map(r => r.id === runId ? { ...r, showIds: [...r.showIds, showId] } : r),
      currentShowId: showId,
      view: 'timer',
    }));
    get().saveToStore();
  },

  completeRun: (runId) => {
    set(s => ({ runs: s.runs.map(r => r.id === runId ? { ...r, completedAt: nowISO() } : r) }));
    get().saveToStore();
  },

  deleteRun: (runId) => {
    const { runs, shows, currentShowId } = get();
    const run = runs.find(r => r.id === runId);
    if (!run) return;
    // Detach shows from the run (make them standalone) but don't delete them
    const newCurrentId = run.showIds.includes(currentShowId ?? '')
      ? (shows.find(s => !run.showIds.includes(s.id))?.id ?? null)
      : currentShowId;
    set(s => ({
      runs: s.runs.filter(r => r.id !== runId),
      shows: s.shows.map(sh => sh.runId === runId ? { ...sh, runId: undefined, performanceNumber: undefined } : sh),
      currentShowId: newCurrentId,
    }));
    get().saveToStore();
  },

  updateRunNotes: (runId, notes) => {
    set(s => ({ runs: s.runs.map(r => r.id === runId ? { ...r, notes } : r) }));
    get().saveToStore();
  },

  syncTemplateFromShow: (runId, showId) => {
    const { shows } = get();
    const show = shows.find(s => s.id === showId);
    if (!show) return;
    const templateSegments: TemplateSegment[] = [...show.segments]
      .sort((a, b) => a.order - b.order)
      .map(seg => ({
        id: uid(),
        type: seg.type,
        label: seg.label,
        expectedDurationMinutes: seg.expectedDurationMinutes,
        order: seg.order,
      }));
    set(s => ({ runs: s.runs.map(r => r.id === runId ? { ...r, templateSegments } : r) }));
    get().saveToStore();
  },

  setNewRunModalOpen: (newRunModalOpen) => set({ newRunModalOpen }),

  // ── UI actions ────────────────────────────────────────────────────────────

  setView: (view) => set({ view }),
  setReportOpen: (reportOpen) => set({ reportOpen }),
  setNewShowModalOpen: (newShowModalOpen) => set({ newShowModalOpen }),
  updateSettings: (s) => {
    set(st => ({ settings: { ...st.settings, ...s } }));
    get().saveToStore();
  },

  addToast: (t) => {
    const toast: Toast = { ...t, id: uid(), createdAt: Date.now() };
    set(s => ({ toasts: [...s.toasts, toast] }));
    setTimeout(() => get().removeToast(toast.id), 5000);
  },

  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  // ── Session actions ────────────────────────────────────────────────────────

  setSessionPanel: (open) => {
    set(s => ({ session: { ...s.session, panelOpen: open } }));
    // Load local IP when opening
    if (open) {
      invokeTauri<string>('get_local_ip').then(ip => {
        if (ip) set(s => ({ session: { ...s.session, localIp: ip } }));
      });
    }
  },

  setSessionScanning: (scanning) =>
    set(s => ({ session: { ...s.session, scanning } })),

  scanSessions: async () => {
    set(s => ({ session: { ...s.session, scanning: true, discovered: [] } }));
    const found = (await invokeTauri<DiscoveredSession[]>('scan_for_sessions')) ?? [];
    set(s => ({ session: { ...s.session, scanning: false, discovered: found } }));
    return found;
  },

  hostSession: async (name, pin, deviceName) => {
    const ip = await invokeTauri<string>('start_hosting', {
      sessionName: name,
      pin,
      deviceName,
    });
    if (ip) {
      set(s => ({
        session: {
          ...s.session,
          mode: 'hosting',
          sessionName: name,
          pin,
          hostIp: ip,
          localIp: ip,
          peers: [],
        },
      }));
      // Immediately broadcast current show state to any early joiners
      get().broadcastCurrentShow();
    }
  },

  stopHosting: async () => {
    await invokeTauri('stop_hosting');
    set(s => ({ session: defaultSession() }));
    get().addToast({ title: 'Session ended', message: 'All peers disconnected', type: 'info' });
  },

  joinSession: async (ip, port, pin, deviceName, deviceType) => {
    set(s => ({ session: { ...s.session, connecting: true, connectError: '' } }));
    try {
      const sessionName = await invokeTauri<string>('join_session', { hostIp: ip, port, pin, deviceName, deviceType });
      set(s => ({
        session: {
          ...s.session,
          connecting: false,
          mode: 'joined',
          hostIp: ip,
          sessionName: sessionName ?? 'Session',
        },
      }));
      get().addToast({ title: 'Connected', message: 'Syncing show state…', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set(s => ({ session: { ...s.session, connecting: false, connectError: msg } }));
    }
  },

  leaveSession: async () => {
    await invokeTauri('leave_session');
    set(s => ({ session: defaultSession() }));
    get().addToast({ title: 'Left session', message: 'Back to standalone mode', type: 'info' });
  },

  applyRemoteShowState: (showJson, syncId) => {
    try {
      if (!showJson) return;
      // Ignore our own echo
      const { session } = get();
      if (syncId && syncId === session.lastSyncId) return;

      const parsed = JSON.parse(showJson);

      // Accept both the v2 multi-show doc and a bare legacy single show.
      let incomingShows: Show[];
      let incomingRuns: Run[];
      let targetId: string | null;
      if (parsed && Array.isArray(parsed.shows)) {
        incomingShows = parsed.shows.map(normalizeShow);
        incomingRuns = Array.isArray(parsed.runs) ? parsed.runs : [];
        targetId = parsed.currentShowId ?? incomingShows[0]?.id ?? null;
      } else if (parsed?.id) {
        incomingShows = [normalizeShow(parsed)];
        incomingRuns = [];
        targetId = parsed.id;
      } else {
        return;
      }
      if (incomingShows.length === 0) return;

      set(s => {
        const showIds = new Set(incomingShows.map(sh => sh.id));
        const runIds = new Set(incomingRuns.map(r => r.id));
        return {
          shows: [
            ...incomingShows,
            ...s.shows.filter(sh => !showIds.has(sh.id)),
          ],
          runs: [
            ...incomingRuns,
            ...s.runs.filter(r => !runIds.has(r.id)),
          ],
          currentShowId: targetId ?? s.currentShowId,
          view: 'timer' as const,
        };
      });
    } catch {
      // Invalid JSON — ignore
    }
  },

  onPeerJoined: (peer) => {
    set(s => ({
      session: { ...s.session, peers: [...s.session.peers.filter(p => p.id !== peer.id), peer] },
    }));
    get().addToast({ title: `${peer.name} joined`, message: peer.device === 'mac' ? 'Mac' : 'Windows', type: 'info' });
    // Send them our current state
    get().broadcastCurrentShow();
  },

  onPeerLeft: (peerId) => {
    const peer = get().session.peers.find(p => p.id === peerId);
    set(s => ({ session: { ...s.session, peers: s.session.peers.filter(p => p.id !== peerId) } }));
    if (peer) {
      get().addToast({ title: `${peer.name} left`, message: '', type: 'warning' });
    }
  },

  onSessionDisconnected: () => {
    set(s => ({ session: { ...defaultSession(), localIp: s.session.localIp } }));
    get().addToast({ title: 'Session lost', message: 'Disconnected from host', type: 'error' });
  },

  broadcastCurrentShow: async () => {
    const { shows, runs, currentShowId, session } = get();
    if (session.mode === 'none') return;
    const show = shows.find(s => s.id === currentShowId);
    if (!show) return;

    // Sync the whole run (all its shows + the run record) when the current
    // show belongs to one; otherwise just the standalone show.
    let docShows: Show[];
    let docRuns: Run[];
    if (show.runId) {
      const run = runs.find(r => r.id === show.runId);
      docShows = shows.filter(s => s.runId === show.runId);
      docRuns = run ? [run] : [];
    } else {
      docShows = [show];
      docRuns = [];
    }

    const doc = { v: 2 as const, shows: docShows, runs: docRuns, currentShowId };
    const syncId = uid();
    set(s => ({ session: { ...s.session, lastSyncId: syncId } }));
    await invokeTauri('session_broadcast_state', {
      stateJson: JSON.stringify(doc),
      syncId,
    });
  },
}));
