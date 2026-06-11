import { ChevronUp, ChevronDown, Clock, X } from 'lucide-react';
import type { TimeFormat } from '../types';

// ── 12/24h conversion helpers ─────────────────────────────────────────────────

export function to12h(h24: number): { hour: number; period: 'AM' | 'PM' } {
  const period: 'AM' | 'PM' = h24 < 12 ? 'AM' : 'PM';
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour, period };
}

export function from12h(hour12: number, period: 'AM' | 'PM'): number {
  const base = hour12 % 12;          // 12 → 0
  return period === 'PM' ? base + 12 : base;
}

// ── One spinner column ────────────────────────────────────────────────────────

interface UnitProps {
  value: number;          // displayed value
  min: number;
  max: number;
  size?: 'lg' | 'sm';
  onChange: (n: number) => void;   // emits displayed value, wrapped into [min,max]
  pad?: boolean;
}

function SpinUnit({ value, min, max, size = 'lg', onChange, pad = true }: UnitProps) {
  const span = max - min + 1;
  const inc = () => onChange(((value - min + 1) % span) + min);
  const dec = () => onChange(((value - min - 1 + span) % span) + min);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp')   { e.preventDefault(); inc(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); dec(); }
  }
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseInt(e.target.value, 10);
    if (!isNaN(n) && n >= min && n <= max) onChange(n);
  }

  const big = size === 'lg';
  const btn = big ? 'w-10 h-7' : 'w-8 h-5';
  const ico = big ? 'w-4 h-4' : 'w-3 h-3';
  const box = big
    ? 'w-14 h-14 text-3xl font-light'
    : 'w-10 h-9 text-lg';

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button type="button" onClick={inc}
        className={`${btn} flex items-center justify-center rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors`}>
        <ChevronUp className={ico} />
      </button>
      <input
        type="number" min={min} max={max}
        value={pad ? String(value).padStart(2, '0') : value}
        onChange={handleChange}
        onKeyDown={handleKey}
        className={`${box} text-center font-mono bg-show-surface border border-show-border rounded-xl text-amber-400
          focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all
          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
          selection:bg-amber-500/30 selection:text-amber-200`}
      />
      <button type="button" onClick={dec}
        className={`${btn} flex items-center justify-center rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors`}>
        <ChevronDown className={ico} />
      </button>
    </div>
  );
}

function PeriodToggle({ period, size = 'lg', onChange }:
  { period: 'AM' | 'PM'; size?: 'lg' | 'sm'; onChange: (p: 'AM' | 'PM') => void }) {
  const big = size === 'lg';
  return (
    <div className={`flex flex-col ${big ? 'gap-1' : 'gap-0.5'} ${big ? 'ml-1' : ''}`}>
      {(['AM', 'PM'] as const).map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`${big ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs'} rounded-lg font-semibold transition-colors border ${
            period === p
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'border-show-border text-slate-500 hover:text-slate-300'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

const Colon = ({ size = 'lg' }: { size?: 'lg' | 'sm' }) => (
  <span className={`${size === 'lg' ? 'text-3xl' : 'text-lg'} font-light text-amber-500/60 select-none pb-0.5`}>:</span>
);

// ── Full picker: HH:MM(:SS) with AM/PM in 12h mode ────────────────────────────

export interface BigTimePickerProps {
  hours: number;          // 0-23
  minutes: number;        // 0-59
  seconds?: number;       // 0-59 (omit to hide the seconds column)
  format: TimeFormat;
  withSeconds?: boolean;
  onChange: (next: { hours: number; minutes: number; seconds: number }) => void;
}

export function BigTimePicker({ hours, minutes, seconds = 0, format, withSeconds = true, onChange }: BigTimePickerProps) {
  const is12 = format === '12h';
  const { hour: h12, period } = to12h(hours);

  const setHour = (display: number) => {
    const h24 = is12 ? from12h(display, period) : display;
    onChange({ hours: h24, minutes, seconds });
  };
  const setPeriod = (p: 'AM' | 'PM') => onChange({ hours: from12h(h12, p), minutes, seconds });
  const setMin = (m: number) => onChange({ hours, minutes: m, seconds });
  const setSec = (s: number) => onChange({ hours, minutes, seconds: s });

  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <SpinUnit value={is12 ? h12 : hours} min={is12 ? 1 : 0} max={is12 ? 12 : 23} onChange={setHour} />
      <Colon />
      <SpinUnit value={minutes} min={0} max={59} onChange={setMin} />
      {withSeconds && (
        <>
          <Colon />
          <SpinUnit value={seconds} min={0} max={59} onChange={setSec} />
        </>
      )}
      {is12 && <PeriodToggle period={period} onChange={setPeriod} />}
    </div>
  );
}

// ── Inline compact picker bound to an "HH:MM" string ──────────────────────────

export interface InlineHmPickerProps {
  value: string;          // "HH:MM" (24h storage) or ''
  format: TimeFormat;
  onChange: (hhmm: string) => void;
}

export function InlineHmPicker({ value, format, onChange }: InlineHmPickerProps) {
  const is12 = format === '12h';
  const [h, m] = value ? value.split(':').map(Number) : [19, 30];
  const { hour: h12, period } = to12h(h);

  const emit = (hh: number, mm: number) =>
    onChange(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);

  const setHour = (display: number) => emit(is12 ? from12h(display, period) : display, m);
  const setPeriod = (p: 'AM' | 'PM') => emit(from12h(h12, p), m);
  const setMin = (mm: number) => emit(h, mm);

  return (
    <div className="flex items-center gap-1.5">
      <SpinUnit size="sm" value={is12 ? h12 : h} min={is12 ? 1 : 0} max={is12 ? 12 : 23} onChange={setHour} />
      <Colon size="sm" />
      <SpinUnit size="sm" value={m} min={0} max={59} onChange={setMin} />
      {is12 && <PeriodToggle size="sm" period={period} onChange={setPeriod} />}
    </div>
  );
}

// ── Enable/clear wrapper: a "Set time" button that expands to the inline picker ─

export function CompactTimePicker({ value, format, onChange, defaultTime = '19:30' }:
  { value: string; format: TimeFormat; onChange: (v: string) => void; defaultTime?: string }) {
  if (value === '') {
    return (
      <button
        type="button"
        onClick={() => onChange(defaultTime)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-show-surface border border-show-border border-dashed rounded-lg text-slate-600 hover:text-slate-400 hover:border-slate-600 text-sm transition-colors"
      >
        <Clock className="w-3.5 h-3.5" />
        Set time
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-show-surface border border-show-border rounded-lg">
      <InlineHmPicker value={value} format={format} onChange={onChange} />
      <button
        type="button"
        onClick={() => onChange('')}
        className="ml-auto self-center w-5 h-5 flex items-center justify-center rounded text-slate-600 hover:text-slate-300 hover:bg-show-hover transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
