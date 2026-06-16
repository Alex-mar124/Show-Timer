import { AnimatePresence, motion } from 'framer-motion';
import { useClock } from '../hooks/useClock';
import { formatDateLong } from '../utils/time';
import type { TimeFormat } from '../types';
import { format } from 'date-fns';

interface Props {
  timeFormat: TimeFormat;
  expectedEnd?: Date | null;
  glowColor?: string; // rgba(...) color string for ambient glow
}

/** A single digit tile that animates when its value changes. */
function FlipTile({ digit }: { digit: string }) {
  return (
    <div
      className="relative overflow-hidden bg-show-card border border-show-border/80 rounded-xl flex items-center justify-center"
      style={{ width: '4.4rem', height: '5.8rem' }}
    >
      {/* Subtle top-to-bottom gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.025] to-transparent pointer-events-none" />
      {/* Hairline through the middle — the split-flap hinge */}
      <div className="absolute left-0 right-0 top-1/2 h-px bg-black/60 z-10 pointer-events-none" />

      <AnimatePresence initial={false}>
        <motion.span
          key={digit}
          className="absolute font-mono text-[4rem] font-light text-slate-100 tabular leading-none select-none"
          initial={{ y: '50%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-50%', opacity: 0 }}
          transition={{ duration: 0.13, ease: [0.4, 0, 0.2, 1] }}
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/** Two tiles side by side for a two-digit group (HH, MM, SS). */
function DigitGroup({ value }: { value: string }) {
  return (
    <div className="flex gap-1">
      <FlipTile digit={value[0]} />
      <FlipTile digit={value[1]} />
    </div>
  );
}

/** Two amber dots stacked as a colon separator. */
function Colon({ dim }: { dim?: boolean }) {
  const opacity = dim ? 'opacity-40' : 'opacity-75';
  return (
    <div className={`flex flex-col gap-2.5 pb-0.5 ${opacity}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
    </div>
  );
}

export default function Clock({ timeFormat, expectedEnd, glowColor = 'rgba(245, 158, 11, 0.07)' }: Props) {
  const now = useClock();

  const h    = format(now, timeFormat === '12h' ? 'hh' : 'HH');
  const m    = format(now, 'mm');
  const s    = format(now, 'ss');
  const ampm = timeFormat === '12h' ? format(now, 'aa') : '';
  const date = formatDateLong(now);

  return (
    <div
      className="relative flex flex-col items-center pt-7 pb-5 select-none"
      style={{
        background: `radial-gradient(ellipse 55% 40% at 50% 65%, ${glowColor} 0%, transparent 70%)`,
        transition: 'background 1s ease',
      }}
    >

      {/* Tile row */}
      <div className="flex items-center gap-2.5 relative z-10">
        <DigitGroup value={h} />
        <Colon />
        <DigitGroup value={m} />
        <Colon dim />
        <DigitGroup value={s} />

        {/* 12h AM/PM — both labels shown, active one is amber */}
        {ampm && (
          <div className="flex flex-col items-start gap-0.5 ml-1 self-end mb-1">
            <span className={`font-sans text-xs font-bold leading-none tracking-[0.2em] uppercase transition-colors duration-300 ${
              ampm === 'AM' ? 'text-amber-400' : 'text-slate-800'
            }`}>AM</span>
            <span className={`font-sans text-xs font-bold leading-none tracking-[0.2em] uppercase transition-colors duration-300 ${
              ampm === 'PM' ? 'text-amber-400' : 'text-slate-800'
            }`}>PM</span>
          </div>
        )}
      </div>

      {/* Date + optional expected-end */}
      <div className="mt-3.5 flex items-center justify-center gap-3 relative z-10">
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-slate-600">
          {date}
        </p>
        {expectedEnd && (
          <span className="text-[11px] text-slate-600 bg-show-card border border-show-border rounded px-2 py-0.5 font-mono tabular tracking-wider">
            ends ~{format(expectedEnd, timeFormat === '12h' ? 'h:mm aa' : 'HH:mm')}
          </span>
        )}
      </div>
    </div>
  );
}
