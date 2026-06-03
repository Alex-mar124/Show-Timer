import { format } from 'date-fns';
import type { Show, Segment, TimeFormat } from '../types';
import { formatTime, formatDuration, formatDateLong } from './time';
import { getElapsedMs, getTotalRunningMs } from '../types';

export function buildReportLines(show: Show, timeFormat: TimeFormat): string[] {
  const lines: string[] = [];
  lines.push(`SHOW REPORT`);
  lines.push(`${show.production || show.title}`);
  lines.push(formatDateLong(show.date));
  lines.push('─'.repeat(38));

  for (const seg of [...show.segments].sort((a, b) => a.order - b.order)) {
    const start = formatTime(seg.actualStart, timeFormat);
    const end = formatTime(seg.actualEnd, timeFormat);
    const elapsed = seg.actualStart
      ? formatDuration(getElapsedMs(seg, new Date()))
      : null;

    if (seg.actualStart && seg.actualEnd) {
      lines.push(`${seg.label.padEnd(20)} ${start} → ${end}  (${elapsed})`);
    } else if (seg.actualStart) {
      lines.push(`${seg.label.padEnd(20)} ${start} → running`);
    } else {
      lines.push(`${seg.label.padEnd(20)} --:--`);
    }
  }

  lines.push('─'.repeat(38));

  const totalMs = getTotalRunningMs(show, new Date());
  lines.push(`Total Running Time:  ${formatDuration(totalMs)}`);

  if (show.notes) {
    lines.push('');
    lines.push(`Notes: ${show.notes}`);
  }

  return lines;
}

export function buildReportText(show: Show, timeFormat: TimeFormat): string {
  return buildReportLines(show, timeFormat).join('\n');
}

export async function copyReportToClipboard(show: Show, timeFormat: TimeFormat): Promise<boolean> {
  try {
    const text = buildReportText(show, timeFormat);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
