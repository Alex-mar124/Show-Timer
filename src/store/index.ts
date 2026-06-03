import { create } from 'zustand';
import type { Show, Segment, SegmentType, AppSettings, Toast, View, TimeFormat, SessionState, SessionPeer, DiscoveredSession } from '../types';
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
    preshowAlertsEnabled: true,
    preshowAlertMinutes: [30, 10, 5],
    intervalWarningEnabled: true,
    intervalWarningMinutes: 5,
    startWithManualTime: false,
    autoStartNext: true,
  };
}

function defaultSegments(): Segment[] {
  const types: Array<{ type: SegmentType; label: string; exp: number | null }> = [
    { type: 'doors', label: 'Doors', exp: 30 },
    { type: 'act', label: 'Act 1', exp: 55 },
    { type: 'interval', label: 'Interval', exp: 20 },
    { type: 'act', label: 'Act 2', exp: 55 },
    { type: 'show_end', label: 'Show End', exp: null },
  ];
  return types.map((t, i) => ({
    id: uid(),
    type: t.type,
    label: t.label,
    expectedDurationMinutes: t.exp,
    actualStart: null,
    actualEnd: null,
    holds: [],
    notes: '',
    order: i,
  }));
}

interface ShowStore {
  // Data
  shows: Show[];
  currentShowId: string | null;
  // UI
  view: View;
  reportOpen: boolean;
  newShowModalOpen: boolean;
  toasts: Toast[];
  // Settings
  settings: AppSettings;
  initialized: boolean;

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

  // Segment actions
  startSegment: (showId: string, segmentId: string, time?: Date) => void;
  stopSegment: (showId: string, segmentId: string, time?: Date) => void;
  holdSegment: (showId: string, segmentId: string) => void;
  resumeSegment: (showId: string, segmentId: string) => void;
  setSegmentTime: (showId: string, segmentId: string, field: 'actualStart' | 'actualEnd', time: Date | null) => void;
  updateSegmentLabel: (showId: string, segmentId: string, label: string) => void;
  updateSegmentExpected: (showId: string, segmentId: string, minutes: number | null) => void;
  updateSegmentNotes: (showId: string, segmentId: string, notes: string) => void;
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
    const shows = (await store.get<Show[]>('shows')) ?? [];
    const currentShowId = (await store.get<string | null>('currentShowId')) ?? null;
    const settings = (await store.get<AppSettings>('settings')) ?? defaultSettings();
    return { shows, currentShowId, settings };
  } catch {
    return { shows: [], currentShowId: null, settings: defaultSettings() };
  }
}

async function saveTauriStore(state: { shows: Show[]; currentShowId: string | null; settings: AppSettings }) {
  try {
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load('show-timer.json', { autoSave: false, defaults: {} });
    await store.set('shows', state.shows);
    await store.set('currentShowId', state.currentShowId);
    await store.set('settings', state.settings);
    await store.save();
  } catch {
    // Browser dev mode — silently skip
  }
}

export const useShowStore = create<ShowStore>((set, get) => ({
  shows: [],
  currentShowId: null,
  view: 'timer',
  reportOpen: true,
  newShowModalOpen: false,
  toasts: [],
  settings: defaultSettings(),
  initialized: false,
  session: defaultSession(),

  initialize: async () => {
    const data = await loadTauriStore();
    set({ ...data, initialized: true });
  },

  saveToStore: async () => {
    const { shows, currentShowId, settings, session, broadcastCurrentShow } = get();
    await saveTauriStore({ shows, currentShowId, settings });
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
    set(s => ({
      shows: s.shows.filter(sh => sh.id !== id),
      currentShowId: s.currentShowId === id ? (s.shows.find(sh => sh.id !== id)?.id ?? null) : s.currentShowId,
    }));
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
          segments: sh.segments.map(seg =>
            seg.id !== segmentId ? seg : { ...seg, expectedDurationMinutes: minutes }
          ),
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

  addSegment: (showId, type, afterOrder) => {
    const labelMap: Record<SegmentType, string> = {
      doors: 'Doors Open', house_open: 'House Open', act: 'Act',
      interval: 'Interval', curtain_call: 'Curtain Call', show_end: 'Show End', custom: 'Custom',
    };
    set(s => {
      const show = s.shows.find(sh => sh.id === showId);
      if (!show) return s;
      const order = afterOrder !== undefined ? afterOrder + 0.5 : show.segments.length;
      const seg: Segment = {
        id: uid(), type, label: labelMap[type],
        expectedDurationMinutes: type === 'act' ? 55 : type === 'interval' ? 20 : null,
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
      const show: Show = JSON.parse(showJson);
      if (!show?.id) return;
      // Ignore our own echo
      const { session } = get();
      if (syncId && syncId === session.lastSyncId) return;
      // Merge: update existing show or add it, then switch to timer view
      const targetId = show.id;
      set(s => {
        const exists = s.shows.find(sh => sh.id === targetId);
        return {
          shows: exists
            ? s.shows.map(sh => sh.id === targetId ? show : sh)
            : [show, ...s.shows],
          currentShowId: targetId,
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
    const { shows, currentShowId, session } = get();
    if (session.mode === 'none') return;
    const show = shows.find(s => s.id === currentShowId);
    if (!show) return;
    const syncId = uid();
    set(s => ({ session: { ...s.session, lastSyncId: syncId } }));
    await invokeTauri('session_broadcast_state', {
      stateJson: JSON.stringify(show),
      syncId,
    });
  },
}));
