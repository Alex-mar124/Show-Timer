import { Radio } from 'lucide-react';
import { useShowStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';

export default function SessionButton() {
  const { session, setSessionPanel } = useShowStore();
  const { mode, peers, panelOpen, connecting } = session;

  const isActive = mode !== 'none';
  const peerCount = peers.length;

  // Colour logic — only amber/green when actually in a session
  const btnClass = isActive
    ? 'border-green-500/30 bg-green-500/8 text-green-400 hover:bg-green-500/12'
    : panelOpen
    ? 'border-amber-500/30 bg-amber-500/8 text-amber-400'
    : 'border-show-border text-slate-600 hover:text-slate-400 hover:border-show-border-light';

  const iconColor = isActive
    ? 'text-green-400'
    : connecting
    ? 'text-amber-400'
    : panelOpen
    ? 'text-amber-400'
    : 'text-slate-600';

  return (
    <button
      onClick={() => setSessionPanel(!panelOpen)}
      title={
        mode === 'hosting'
          ? `Hosting — ${peerCount} peer${peerCount !== 1 ? 's' : ''} connected`
          : mode === 'joined'
          ? `In session: ${session.sessionName}`
          : 'Start or join a sync session'
      }
      className={`relative flex items-center gap-1.5 h-8 px-2.5 rounded-lg border transition-all ${btnClass}`}
    >
      {/* Pulse dot when active */}
      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
      )}
      {connecting && !isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
      )}

      <Radio className={`w-3.5 h-3.5 ${iconColor} transition-colors`} />

      {/* Peer count */}
      <AnimatePresence>
        {isActive && peerCount > 0 && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            className="text-[10px] font-bold tabular text-green-400"
          >
            {peerCount}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
