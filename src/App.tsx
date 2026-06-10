import { useEffect, useState, useRef } from 'react';
import { History, Settings, PanelRight, Plus, Timer, Layers, ChevronDown } from 'lucide-react';
import AppLogo, { AppLogoMark } from './components/AppLogo';
import { AnimatePresence, motion } from 'framer-motion';
import { useShowStore } from './store';
import TimerView from './components/TimerView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import ShowSetupModal from './components/ShowSetupModal';
import RunSetupModal from './components/RunSetupModal';
import ToastContainer from './components/ToastContainer';
import SessionButton from './components/SessionButton';
import SessionPanel from './components/SessionPanel';
import { schedulePreShowNotifications } from './utils/notifications';
import { formatDateShort } from './utils/time';
import type { View } from './types';

const NAV_ITEMS: Array<{ view: View; Icon: React.ElementType; label: string }> = [
  { view: 'timer',   Icon: Timer,   label: 'Timer' },
  { view: 'history', Icon: History, label: 'History' },
  { view: 'settings',Icon: Settings,label: 'Settings' },
];

export default function App() {
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Close new-menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    if (newMenuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [newMenuOpen]);

  const {
    initialize, initialized,
    view, setView,
    reportOpen, setReportOpen,
    setNewShowModalOpen, setNewRunModalOpen,
    shows, currentShowId, settings,
    addToast,
    session,
    applyRemoteShowState,
    onPeerJoined,
    onPeerLeft,
    onSessionDisconnected,
    broadcastCurrentShow,
  } = useShowStore();

  useEffect(() => {
    initialize();
  }, []);

  // Request notification permission on startup + wire Tauri session events
  useEffect(() => {
    if (!initialized) return;

    (async () => {
      try {
        const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
        const granted = await isPermissionGranted();
        if (!granted) await requestPermission();
      } catch {
        // browser dev mode — skip
      }

      // Wire up Tauri session events
      try {
        const { listen } = await import('@tauri-apps/api/event');

        listen<{ show_json: string; sync_id: string }>('session:state_received', e => {
          applyRemoteShowState(e.payload.show_json, e.payload.sync_id ?? '');
        });

        listen<Record<string, unknown>>('session:peer_joined', e => {
          onPeerJoined(e.payload as any);
        });

        listen<string>('session:peer_left', e => {
          onPeerLeft(e.payload);
        });

        listen('session:disconnected', () => {
          onSessionDisconnected();
        });
      } catch {
        // browser dev mode — no Tauri events
      }
    })();

    // Re-schedule pre-show notifications for current show
    const show = shows.find(s => s.id === currentShowId);
    if (show?.plannedStartTime) {
      schedulePreShowNotifications(show.plannedStartTime, settings, settings.timeFormat);
    }
  }, [initialized]);

  const currentShow = shows.find(s => s.id === currentShowId);

  if (!initialized) {
    return (
      <div className="h-full bg-show-base flex items-center justify-center">
        <div className="text-center">
          <AppLogo size={52} className="mx-auto mb-3 opacity-90" />
          <p className="text-slate-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-show-base flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 flex items-center px-4 gap-3 border-b border-show-border bg-show-surface" style={{ height: '60px' }}>

        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <AppLogo size={32} className="shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="font-mono text-[9px] tracking-[0.22em] text-slate-600 uppercase">Show</span>
            <span className="font-mono text-[11px] tracking-[0.18em] text-amber-400 uppercase font-bold">Timer</span>
          </div>
        </div>

        {/* Center: current show info */}
        <div className="flex-1 flex items-center justify-center min-w-0 px-2">
          {currentShow ? (
            <button onClick={() => setView('timer')} className="text-center group min-w-0 max-w-xs">
              <p className="text-sm font-semibold text-slate-200 leading-tight truncate group-hover:text-amber-300 transition-colors">
                {currentShow.production || currentShow.title}
              </p>
              <p className="text-[11px] text-slate-600 truncate">
                {currentShow.production && currentShow.title !== currentShow.production
                  ? `${currentShow.title} · ` : ''}
                {formatDateShort(currentShow.date)}
              </p>
            </button>
          ) : (
            <button onClick={() => setNewMenuOpen(true)}
              className="text-xs text-slate-700 hover:text-amber-400 transition-colors">
              No active show — create one
            </button>
          )}
        </div>

        {/* Right: nav + actions */}
        <div className="flex items-center gap-1.5 shrink-0">

          {/* Nav tabs with labels */}
          <div className="flex items-center bg-show-card rounded-xl border border-show-border p-1 gap-0.5">
            {NAV_ITEMS.map(({ view: v, Icon, label }) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  view === v ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300'
                }`}
              >
                {v === 'timer' ? <AppLogoMark size={12} /> : <Icon className="w-3.5 h-3.5" />}
                <span>{label}</span>
                {view === v && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-lg bg-amber-500/10 border border-amber-500/20"
                    transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Report panel toggle */}
          {view === 'timer' && currentShow && (
            <button
              onClick={() => setReportOpen(!reportOpen)}
              title="Toggle report panel"
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all border ${
                reportOpen
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-show-border text-slate-600 hover:text-slate-300 hover:border-slate-600'
              }`}
            >
              <PanelRight className="w-3.5 h-3.5" />
              <span>Report</span>
            </button>
          )}

          {/* Sync button */}
          <SessionButton />

          {/* New — combined dropdown */}
          <div className="relative" ref={newMenuRef}>
            <button
              onClick={() => setNewMenuOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${newMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {newMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1.5 z-30 bg-show-card border border-show-border rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden min-w-[170px]"
                >
                  <button
                    onClick={() => { setNewShowModalOpen(true); setNewMenuOpen(false); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-show-hover hover:text-slate-100 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-slate-500 shrink-0" />
                    <div className="text-left">
                      <p className="font-medium text-sm">Single Show</p>
                      <p className="text-[11px] text-slate-600">One-off performance</p>
                    </div>
                  </button>
                  <div className="h-px bg-show-border mx-3" />
                  <button
                    onClick={() => { setNewRunModalOpen(true); setNewMenuOpen(false); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-show-hover hover:text-slate-100 transition-colors"
                  >
                    <Layers className="w-4 h-4 text-amber-500/70 shrink-0" />
                    <div className="text-left">
                      <p className="font-medium text-sm">Production Run</p>
                      <p className="text-[11px] text-slate-600">Multi-night run</p>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </header>

      {/* Content */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {view === 'timer' && (
            <motion.div
              key="timer"
              className="flex-1 flex min-h-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <TimerView />
            </motion.div>
          )}
          {view === 'history' && (
            <motion.div
              key="history"
              className="flex-1 flex min-h-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <HistoryView />
            </motion.div>
          )}
          {view === 'settings' && (
            <motion.div
              key="settings"
              className="flex-1 flex min-h-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <SettingsView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Overlays */}
      <ShowSetupModal />
      <RunSetupModal />
      <AnimatePresence>{session.panelOpen && <SessionPanel />}</AnimatePresence>
      <ToastContainer />
    </div>
  );
}
