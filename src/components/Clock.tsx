import { useClock } from '../hooks/useClock';
import { formatDateLong } from '../utils/time';
import type { TimeFormat } from '../types';
import { format } from 'date-fns';

interface Props {
  timeFormat: TimeFormat;
  expectedEnd?: Date | null;
}

export default function Clock({ timeFormat, expectedEnd }: Props) {
  const now = useClock();

  const h = format(now, timeFormat === '12h' ? 'hh' : 'HH');
  const m = format(now, 'mm');
  const s = format(now, 'ss');
  const ampm = timeFormat === '12h' ? format(now, ' aa') : '';
  const date = formatDateLong(now);
  const colon = now.getSeconds() % 2 === 0;

  return (
    <div className="flex flex-col items-center py-6 select-none">
      {/* Main clock */}
      <div className="flex items-center gap-1">
        <span className="font-mono tabular text-[5.5rem] leading-none font-light tracking-tight text-slate-100">
          {h}
        </span>
        <span
          className="font-mono text-[5rem] leading-none font-light text-amber-400 pb-2 transition-opacity duration-100"
          style={{ opacity: colon ? 1 : 0.15 }}
        >
          :
        </span>
        <span className="font-mono tabular text-[5.5rem] leading-none font-light tracking-tight text-slate-100">
          {m}
        </span>
        <span
          className="font-mono text-[5rem] leading-none font-light text-amber-400 pb-2 transition-opacity duration-100"
          style={{ opacity: colon ? 1 : 0.15 }}
        >
          :
        </span>
        <span className="font-mono tabular text-[5.5rem] leading-none font-light tracking-tight text-amber-300">
          {s}
        </span>
        {ampm && (
          <span className="font-mono text-2xl font-light text-slate-400 self-end pb-4 ml-2">
            {ampm}
          </span>
        )}
      </div>

      {/* Date + optional expected end */}
      <div className="mt-2 flex items-center justify-center gap-4">
        <p className="text-sm font-medium tracking-[0.2em] uppercase text-slate-500">
          {date}
        </p>
        {expectedEnd && (
          <span className="text-xs text-slate-600 border border-show-border rounded-full px-2.5 py-0.5 font-mono tabular">
            End ~{format(expectedEnd, timeFormat === '12h' ? 'h:mm aa' : 'HH:mm')}
          </span>
        )}
      </div>
    </div>
  );
}
