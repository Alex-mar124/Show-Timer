import { useEffect } from 'react';
import { History, Settings, PanelRight, Plus, Timer, Layers } from 'lucide-react';
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
      <header className="shrink-0 flex items-center px-4 h-13 border-b border-show-border bg-show-surface" style={{ height: '52px' }}>

        {/* Brand — logo + two-tone name */}
        <div className="flex items-center gap-2 shrink-0 min-w-0" style={{ width: 148 }}>
          <AppLogo size={30} className="shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="font-mono text-[9px] tracking-[0.22em] text-slate-600 uppercase">Show</span>
            <span className="font-mono text-[11px] tracking-[0.18em] text-amber-400 uppercase font-bold">Timer</span>
          </div>
        </div>

        {/* Center: current show info */}
        <div className="flex-1 flex items-center justify-center min-w-0 px-3">
          {currentShow ? (
            <button
              onClick={() => setView('timer')}
              className="text-center group min-w-0 max-w-xs"
            >
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
            <button
              onClick={() => setNewShowModalOpen(true)}
              className="text-xs text-slate-700 hover:text-amber-400 transition-colors"
            >
              No active show — create one
            </button>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 shrink-0" style={{ width: 148, justifyContent: 'flex-end' }}>

          {/* Nav tabs */}
          <div className="flex items-center bg-show-card rounded-lg border border-show-border p-0.5 mr-1.5">
            {NAV_ITEMS.map(({ view: v, Icon, label }) => (
              <button
                key={v}
                onClick={() => setView(v)}
                title={label}
                className={`relative w-8 h-7 rounded-md flex items-center justify-center transition-all ${
                  view === v ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                {v === 'timer'
                  ? <AppLogoMark size={13} />
                  : <Icon className="w-3.5 h-3.5" />
                }
                {view === v && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-md bg-amber-500/10 border border-amber-500/20"
                    transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Report toggle */}
          {view === 'timer' && currentShow && (
            <button
              onClick={() => setReportOpen(!reportOpen)}
              title="Toggle report panel"
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all border ${
                reportOpen
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-show-border text-slate-600 hover:text-slate-300'
              }`}
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Sync */}
          <SessionButton />

          {/* New production run */}
          <button
            onClick={() => setNewRunModalOpen(true)}
            title="New production run"
            className="w-7 h-7 rounded-lg border border-show-border hover:border-amber-500/30 flex items-center justify-center text-slate-600 hover:text-amber-400 transition-all"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          {/* New standalone show */}
          <button
            onClick={() => setNewShowModalOpen(true)}
            title="New standalone show"
            className="w-7 h-7 rounded-lg border border-show-border hover:border-amber-500/30 flex items-center justify-center text-slate-600 hover:text-amber-400 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
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
