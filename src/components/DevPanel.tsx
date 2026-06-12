import { useState } from 'react';
import { Bug, X, Database, Trash2, Clock, RotateCcw, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { useShowStore } from '../store';
import { formatDuration } from '../utils/time';

/**
 * Floating developer panel — only mounted when settings.devMode is on.
 * Time-travel the clock, seed sample data, dump state, clear everything.
 */
export default function DevPanel() {
  const {
    devClockOffsetMs, bumpDevClock, resetDevClock,
    seedDevData, clearAllData, updateSettings,
    shows, runs, currentShowId, session,
  } = useShowStore();
  const [collapsed, setCollapsed] = useState(false);

  const offsetLabel = devClockOffsetMs === 0
    ? 'live'
    : `${devClockOffsetMs > 0 ? '+' : '−'}${formatDuration(Math.abs(devClockOffsetMs))}`;

  function dumpState() {
    // eslint-disable-next-line no-console
    console.log('[ShowTimer dev] state', {
      shows, runs, currentShowId,
      session: { mode: session.mode, peers: session.peers.length },
      devClockOffsetMs,
    });
  }

  const jumps: Array<[string, number]> = [
    ['−1h', -3600_000], ['−5m', -300_000], ['+5m', 300_000], ['+1h', 3600_000],
  ];

  return (
    <div className="fixed bottom-4 left-4 z-40 w-60 rounded-xl border border-purple-500/30 bg-show-card/95 backdrop-blur shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-show-border">
        <Bug className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-purple-300">Dev Mode</span>
        <span className="ml-auto font-mono text-[10px] text-slate-500">{offsetLabel}</span>
        <button onClick={() => setCollapsed(c => !c)} className="text-slate-600 hover:text-slate-300">
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => updateSettings({ devMode: false })} className="text-slate-600 hover:text-red-400" title="Exit dev mode">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Clock travel */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
              <Clock className="w-3 h-3" /> Clock Travel
            </div>
            <div className="grid grid-cols-4 gap-1">
              {jumps.map(([label, ms]) => (
                <button key={label} onClick={() => bumpDevClock(ms)}
                  className="py-1 rounded-md border border-show-border hover:border-purple-500/40 text-[11px] font-mono text-slate-400 hover:text-purple-300 transition-colors">
                  {label}
                </button>
              ))}
            </div>
            {devClockOffsetMs !== 0 && (
              <button onClick={resetDevClock}
                className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1 rounded-md border border-show-border text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                <RotateCcw className="w-3 h-3" /> Reset to live
              </button>
            )}
          </div>

          {/* Data */}
          <div className="space-y-1.5">
            <button onClick={seedDevData}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-show-border hover:border-purple-500/40 text-xs text-slate-300 hover:text-purple-300 transition-colors">
              <Database className="w-3.5 h-3.5" /> Seed sample data
            </button>
            <button onClick={dumpState}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-show-border hover:border-slate-600 text-xs text-slate-400 hover:text-slate-200 transition-colors">
              <Terminal className="w-3.5 h-3.5" /> Dump state to console
            </button>
            <button onClick={() => { if (confirm('Clear ALL shows and runs?')) clearAllData(); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-red-500/20 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Clear all data
            </button>
          </div>

          <p className="text-[10px] text-slate-600 leading-relaxed">
            {shows.length} shows · {runs.length} runs · sync {session.mode}
          </p>
        </div>
      )}
    </div>
  );
}
