import { format, parse, isValid } from 'date-fns';
import { type TimeFormat } from '../types';

export function formatClock(date: Date, timeFormat: TimeFormat): string {
  return format(date, timeFormat === '12h' ? 'hh:mm:ss aa' : 'HH:mm:ss');
}

export function formatTime(date: Date | string | null, timeFormat: TimeFormat): string {
  if (!date) return '--:--';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!isValid(d)) return '--:--';
  return format(d, timeFormat === '12h' ? 'h:mm aa' : 'HH:mm');
}

export function formatTimeWithSeconds(date: Date | string | null, timeFormat: TimeFormat): string {
  if (!date) return '--:--:--';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!isValid(d)) return '--:--:--';
  return format(d, timeFormat === '12h' ? 'h:mm:ss aa' : 'HH:mm:ss');
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDurationShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatOverUnder(ms: number): { label: string; sign: '+' | '-' | '' } {
  const abs = Math.abs(ms);
  const totalSeconds = Math.floor(abs / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (ms === 0) return { label: 'On time', sign: '' };
  const label = m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
  return { label, sign: ms > 0 ? '+' : '-' };
}

export function parseManualTime(input: string, baseDate: Date): Date | null {
  const formats = [
    'HH:mm:ss', 'HH:mm', 'H:mm:ss', 'H:mm',
    'hh:mm:ss a', 'hh:mm a', 'h:mm:ss a', 'h:mm a',
    'HH:mm:ss aa', 'hh:mm:ss aa',
  ];
  for (const fmt of formats) {
    try {
      const d = parse(input, fmt, baseDate);
      if (isValid(d)) return d;
    } catch {
      // try next
    }
  }
  return null;
}

export function formatDateLong(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'EEEE d MMMM yyyy');
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'EEE d MMM yyyy');
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
