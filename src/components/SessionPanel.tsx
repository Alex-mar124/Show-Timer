import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  X, Radio, Wifi, WifiOff, Copy, Check,
  MonitorPlay, LogOut, RefreshCw, ChevronDown, ChevronRight,
  Monitor, Apple, User,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShowStore } from '../store';
import type { DiscoveredSession } from '../types';
import { formatDateShort } from '../utils/time';

// ── PIN digits display ────────────────────────────────────────────────────────
function PinDisplay({ pin }: { pin: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(pin).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex gap-1.5">
        {pin.padEnd(6, '·').split('').map((d, i) => (
          <div
            key={i}
            className="w-8 h-10 flex items-center justify-center rounded-lg font-mono text-xl font-bold text-amber-400"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1.5px solid rgba(245,158,11,0.3)' }}
          >
            {d}
          </div>
        ))}
      </div>
      <button
        onClick={copy}
        className="w-8 h-8 rounded-lg border border-show-border hover:bg-show-hover flex items-center justify-center text-slate-500 hover:text-slate-200 transition-colors shrink-0"
        title="Copy PIN"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ── Device type icon ───────────────────────────────────────────────────────────
function DeviceIcon({ device }: { device: string }) {
  return device === 'mac'
    ? <Apple className="w-3.5 h-3.5 text-slate-500" />
    : <Monitor className="w-3.5 h-3.5 text-slate-500" />;
}

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export default function SessionPanel() {
  const {
    session,
    setSessionPanel,
    hostSession,
    stopHosting,
    joinSession,
    leaveSession,
    scanSessions,
    setSessionScanning,
  } = useShowStore();

  const {
    mode, sessionName, pin, hostIp, localIp,
    peers, scanning, discovered, connecting, connectError,
  } = session;

  const [deviceName, setDeviceName] = useState('');
  const [joinIp, setJoinIp] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [hostPin, setHostPin] = useState(generatePin);
  const [hostOpen, setHostOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(true);
  const [hostStarting, setHostStarting] = useState(false);
  const [hostError, setHostError] = useState('');
  const [hostClip, setHostClip] = useState(true);
  const [joinClip, setJoinClip] = useState(true);

  const currentShow = useShowStore(s => s.shows.find(sh => sh.id === s.currentShowId));

  function getDeviceType(): string {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('mac') ? 'mac' : 'windows';
  }

  useEffect(() => {
    // Auto-scan on open when idle
    if (mode === 'none') handleScan();
  }, []);

  async function handleScan() {
    setSessionScanning(true);
    const found = await scanSessions();
    setSessionScanning(false);
    if (found.length > 0) setJoinOpen(true);
  }

  async function handleStartHosting() {
    setHostError('');
    setHostStarting(true);
    setHostOpen(false);
    const name = currentShow
      ? `${currentShow.production || currentShow.title} — ${formatDateShort(currentShow.date)}`
      : 'Show Timer Session';
    try {
      await hostSession(name, hostPin, deviceName || 'Host');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setHostError(msg || 'Failed to start session — check network permissions.');
      setHostOpen(true);
    } finally {
      setHostStarting(false);
    }
  }

  async function handleJoin() {
    if (!joinIp.trim() || !joinPin.trim()) return;
    await joinSession(joinIp.trim(), 4242, joinPin.trim(), deviceName || 'Device', getDeviceType());
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      className="fixed top-14 right-0 bottom-0 w-[min(320px,100vw)] bg-show-surface border-l border-show-border z-40 flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.4)]"
    >
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-show-border">
        <div className="flex items-center gap-2.5">
          <Radio className={`w-4 h-4 ${mode !== 'none' ? 'text-green-400' : 'text-amber-400'}`} />
          <span className="font-semibold text-sm text-slate-200">Sync</span>
          {mode !== 'none' && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
              mode === 'hosting'
                ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                : 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
            }`}>
              {mode}
            </span>
          )}
        </div>
        <button
          onClick={() => setSessionPanel(false)}
          className="w-7 h-7 rounded-lg hover:bg-show-hover flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Content (scrollable) ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ════════════════ HOSTING ════════════════ */}
        {mode === 'hosting' && (
          <div className="p-4 space-y-4">
            {/* Session name */}
            <div className="rounded-xl bg-green-500/5 border border-green-500/20 px-4 py-3">
              <p className="text-[10px] text-green-500 uppercase tracking-wider font-semibold mb-0.5">Active Session</p>
              <p className="text-sm font-semibold text-slate-200 leading-snug">{sessionName}</p>
            </div>

            {/* PIN */}
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
                Share this PIN with your team
              </p>
              <PinDisplay pin={pin} />
            </div>

            {/* IP */}
            <div className="rounded-xl bg-show-card border border-show-border px-4 py-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Your IP Address</p>
              <p className="font-mono text-base text-amber-300 font-semibold">{hostIp}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">Port 4242 · Share if auto-discover fails</p>
            </div>

            {/* Peers */}
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
                Connected peers ({peers.length})
              </p>
              {peers.length === 0 ? (
                <div className="rounded-xl bg-show-card border border-dashed border-show-border px-4 py-4 text-center">
                  <p className="text-xs text-slate-600">Waiting for others to join…</p>
                  <p className="text-[11px] text-slate-700 mt-0.5">Share the PIN and your IP above</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {peers.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2.5 bg-show-card rounded-xl border border-show-border"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                      <span className="flex-1 text-sm text-slate-200 font-medium truncate">{p.name}</span>
                      <DeviceIcon device={p.device} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stop */}
            <button
              onClick={stopHosting}
              className="w-full py-2.5 rounded-xl border border-red-500/25 text-red-400 hover:bg-red-500/8 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <WifiOff className="w-4 h-4" />
              Stop Session
            </button>
          </div>
        )}

        {/* ════════════════ JOINED ════════════════ */}
        {mode === 'joined' && (
          <div className="p-4 space-y-4">
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 px-4 py-3">
              <p className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold mb-0.5">Joined Session</p>
              <p className="text-sm font-semibold text-slate-200 leading-snug">{sessionName}</p>
            </div>

            <div className="rounded-xl bg-show-card border border-show-border px-4 py-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Host</p>
              <p className="font-mono text-base text-amber-300 font-semibold">{hostIp}</p>
            </div>

            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
                In session ({peers.length + 2})
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 px-3 py-2.5 bg-show-card rounded-xl border border-amber-500/20">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="flex-1 text-sm text-slate-200 font-medium">Host</span>
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-md border border-amber-500/20">HOST</span>
                </div>
                {peers.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2.5 bg-show-card rounded-xl border border-show-border"
                  >
                    <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    <span className="flex-1 text-sm text-slate-200 truncate">{p.name}</span>
                    <DeviceIcon device={p.device} />
                  </div>
                ))}
                <div className="flex items-center gap-3 px-3 py-2.5 bg-show-card rounded-xl border border-blue-500/20">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                  <span className="flex-1 text-sm text-blue-300 font-medium">You</span>
                  <DeviceIcon device={getDeviceType()} />
                </div>
              </div>
            </div>

            <button
              onClick={leaveSession}
              className="w-full py-2.5 rounded-xl border border-red-500/25 text-red-400 hover:bg-red-500/8 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Leave Session
            </button>
          </div>
        )}

        {/* ════════════════ IDLE ════════════════ */}
        {mode === 'none' && (
          <div className="p-4 space-y-3">
            {/* Device name */}
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">
                Your name on this device
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
                <input
                  type="text"
                  value={deviceName}
                  onChange={e => setDeviceName(e.target.value)}
                  placeholder="e.g. Stage Manager, FOH, LX Op"
                  className="w-full bg-show-card border border-show-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/10 transition-all"
                />
              </div>
            </div>

            {/* ── Host card ── */}
            <div className="rounded-xl border border-show-border bg-show-card overflow-hidden">
              <button
                onClick={() => setHostOpen(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-show-hover transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <MonitorPlay className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-slate-200">Host Session</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Others join your show</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-600 transition-transform duration-200 ${hostOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence initial={false}>
                {hostOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={hostClip ? 'overflow-hidden' : ''}
                    onAnimationStart={() => setHostClip(true)}
                    onAnimationComplete={() => { if (hostOpen) setHostClip(false); }}
                  >
                    <div className="px-4 pb-4 pt-1 space-y-3 border-t border-show-border">
                      <div>
                        <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-2">
                          Session PIN
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={hostPin}
                            onChange={e => setHostPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            maxLength={6}
                            className="flex-1 bg-show-surface border border-show-border rounded-xl px-4 py-2.5 font-mono text-2xl font-bold text-amber-400 text-center tracking-[0.3em] placeholder-slate-700 focus:outline-none focus:border-amber-500/40"
                          />
                          <button
                            onClick={() => setHostPin(generatePin())}
                            className="w-11 rounded-xl border border-show-border hover:bg-show-hover text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center shrink-0"
                            title="Regenerate PIN"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {hostError && (
                        <p className="text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">
                          {hostError}
                        </p>
                      )}
                      <button
                        onClick={handleStartHosting}
                        disabled={hostPin.length < 4 || hostStarting}
                        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-show-base text-sm font-bold transition-all flex items-center justify-center gap-2"
                      >
                        {hostStarting
                          ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Starting…</>
                          : 'Start Hosting'
                        }
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Join card ── */}
            <div className="rounded-xl border border-show-border bg-show-card overflow-hidden">
              <button
                onClick={() => setJoinOpen(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-show-hover transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Wifi className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-slate-200">Join Session</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Connect to host on this network</p>
                </div>
                <div className="flex items-center gap-2">
                  {scanning && <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />}
                  <ChevronDown className={`w-4 h-4 text-slate-600 transition-transform duration-200 ${joinOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <AnimatePresence initial={false}>
                {joinOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={joinClip ? 'overflow-hidden' : ''}
                    onAnimationStart={() => setJoinClip(true)}
                    onAnimationComplete={() => { if (joinOpen) setJoinClip(false); }}
                  >
                    <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-show-border">
                      {/* Discovered sessions */}
                      {discovered.length > 0 && (
                        <div className="space-y-1.5 pb-1">
                          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Found on network</p>
                          {discovered.map((s, i) => (
                            <button
                              key={i}
                              onClick={() => { setJoinIp(s.ip); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-show-surface border border-show-border hover:border-amber-500/30 hover:bg-amber-500/5 transition-all text-left"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                              <span className="flex-1 text-sm text-slate-200 font-medium truncate">{s.name}</span>
                              <span className="font-mono text-[11px] text-slate-500 shrink-0">{s.ip}</span>
                            </button>
                          ))}
                          <div className="border-t border-show-border" />
                        </div>
                      )}

                      {discovered.length === 0 && !scanning && (
                        <div className="flex items-center justify-between py-1">
                          <p className="text-xs text-slate-600">No sessions found</p>
                          <button
                            onClick={handleScan}
                            className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Scan again
                          </button>
                        </div>
                      )}

                      {/* IP entry */}
                      <div>
                        <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">
                          Host IP Address
                        </label>
                        <input
                          type="text"
                          value={joinIp}
                          onChange={e => setJoinIp(e.target.value)}
                          placeholder="192.168.1.x"
                          className="w-full bg-show-surface border border-show-border rounded-xl px-3 py-2.5 font-mono text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-amber-500/40 transition-all"
                        />
                      </div>

                      {/* PIN entry */}
                      <div>
                        <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">
                          Session PIN
                        </label>
                        <input
                          type="text"
                          value={joinPin}
                          onChange={e => setJoinPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="6-digit PIN"
                          maxLength={6}
                          className="w-full bg-show-surface border border-show-border rounded-xl px-4 py-2.5 font-mono text-2xl font-bold text-amber-400 text-center tracking-[0.3em] placeholder-slate-600 placeholder:text-base placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:border-amber-500/40 transition-all"
                        />
                      </div>

                      {connectError && (
                        <p className="text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">
                          {connectError}
                        </p>
                      )}

                      <button
                        onClick={handleJoin}
                        disabled={!joinIp.trim() || !joinPin.trim() || connecting}
                        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                      >
                        {connecting ? (
                          <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Connecting…</>
                        ) : (
                          'Connect'
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Local IP */}
            {localIp && (
              <p className="text-center text-[11px] text-slate-700 pt-1">
                Your IP: <span className="font-mono text-slate-500">{localIp}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
