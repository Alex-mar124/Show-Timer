import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { Show, TimeFormat } from '../types';
import { getSegmentStatus, getElapsedMs, getTotalRunningMs } from '../types';
import { formatTime, formatDuration, formatDurationShort, formatOverUnder, formatDateLong } from './time';

// Colour palette (RGB)
const C = {
  amber:      [245, 158, 11]  as [number, number, number],
  amberLight: [254, 243, 199] as [number, number, number],
  dark:       [15, 23, 42]    as [number, number, number],
  mid:        [30, 41, 59]    as [number, number, number],
  slate:      [100, 116, 139] as [number, number, number],
  light:      [248, 250, 252] as [number, number, number],
  white:      [255, 255, 255] as [number, number, number],
  green:      [34, 197, 94]   as [number, number, number],
  red:        [239, 68, 68]   as [number, number, number],
  border:     [226, 232, 240] as [number, number, number],
};

function rgb(c: [number, number, number]): [number, number, number] { return c; }

export function generatePDF(show: Show, timeFormat: TimeFormat): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();
  const W = 210;
  const margin = 16;

  // ─── Amber top bar ─────────────────────────────────────────────────────────
  doc.setFillColor(...C.amber);
  doc.rect(0, 0, W, 5, 'F');

  // ─── Header block ──────────────────────────────────────────────────────────
  let y = 18;

  // Amber "SHOW REPORT" label
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.amber);
  doc.text('SHOW REPORT', margin, y);
  y += 7;

  // Production name — large
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.dark);
  doc.text(show.production || show.title, margin, y);
  y += 7;

  // Show label / subtitle
  if (show.title && show.title !== show.production) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate);
    doc.text(show.title, margin, y);
    y += 5.5;
  }

  // Date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.slate);
  doc.text(formatDateLong(show.date), margin, y);

  // Generated timestamp (right-aligned)
  doc.setFontSize(8);
  doc.setTextColor(...C.slate);
  const genStr = `Generated ${format(now, 'HH:mm · d MMM yyyy')}`;
  const genW = doc.getTextWidth(genStr);
  doc.text(genStr, W - margin - genW, 18);

  y += 8;

  // ─── Divider ───────────────────────────────────────────────────────────────
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin, y);
  y += 7;

  // ─── TIMING section header ─────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.amber);
  doc.text('TIMING', margin, y);
  y += 4;

  // ─── Table ─────────────────────────────────────────────────────────────────
  const segments = [...show.segments].sort((a, b) => a.order - b.order);

  const tableRows = segments.map(seg => {
    const status = getSegmentStatus(seg);
    const elapsed = getElapsedMs(seg, now);
    const overUnderMs = seg.expectedDurationMinutes && status !== 'pending'
      ? elapsed - seg.expectedDurationMinutes * 60_000
      : null;
    const { label: ouLabel, sign: ouSign } = overUnderMs !== null
      ? formatOverUnder(overUnderMs)
      : { label: '—', sign: '' as '' };

    return {
      label: seg.label,
      start: formatTime(seg.actualStart, timeFormat),
      end: formatTime(seg.actualEnd, timeFormat),
      duration: seg.actualStart ? formatDuration(elapsed) : '—',
      expected: seg.expectedDurationMinutes ? `${seg.expectedDurationMinutes}m` : '—',
      overUnder: overUnderMs !== null && Math.abs(overUnderMs) > 5000
        ? `${ouSign}${ouLabel}`
        : '—',
      overUnderMs,
      notes: seg.notes,
    };
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Segment', 'Start', 'End', 'Duration', 'Expected', '+/−']],
    body: tableRows.map(r => [r.label, r.start, r.end, r.duration, r.expected, r.overUnder]),
    theme: 'grid',
    headStyles: {
      fillColor: C.mid,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 22, halign: 'center', font: 'courier' },
      2: { cellWidth: 22, halign: 'center', font: 'courier' },
      3: { cellWidth: 26, halign: 'center', font: 'courier' },
      4: { cellWidth: 24, halign: 'center' },
      5: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
    },
    bodyStyles: {
      fontSize: 8.5,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      textColor: C.dark,
    },
    alternateRowStyles: {
      fillColor: C.light,
    },
    didParseCell: (data) => {
      // Colour the +/− column
      if (data.column.index === 5 && data.section === 'body') {
        const row = tableRows[data.row.index];
        if (row?.overUnderMs !== null && row.overUnderMs !== undefined) {
          if (row.overUnderMs > 5 * 60_000) {
            data.cell.styles.textColor = C.red;
          } else if (row.overUnderMs > 0) {
            data.cell.styles.textColor = C.amber;
          } else if (row.overUnderMs < -5000) {
            data.cell.styles.textColor = C.green;
          }
        }
      }
    },
  });

  // ─── Totals summary ────────────────────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 40;
  y = finalY + 6;

  const totalMs = getTotalRunningMs(show, now);
  const totalExpMin = segments
    .filter(s => s.expectedDurationMinutes)
    .reduce((acc, s) => acc + (s.expectedDurationMinutes ?? 0), 0);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.dark);
  doc.text('Total Running Time:', margin, y);
  doc.setFont('courier', 'bold');
  doc.text(formatDuration(totalMs), margin + 42, y);

  if (totalExpMin > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate);
    doc.text(`(Expected: ${formatDurationShort(totalExpMin)})`, margin + 65, y);
  }

  // Show notes
  if (show.notes) {
    y += 6;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.slate);
    doc.text(`Show notes: ${show.notes}`, margin, y);
  }

  y += 9;

  // ─── Technical Notes section ───────────────────────────────────────────────
  if (show.techNotes?.trim()) {
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(margin, y, W - margin, y);
    y += 7;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.amber);
    doc.text('TECHNICAL NOTES', margin, y);
    y += 5;

    // Amber left accent bar
    doc.setFillColor(...C.amber);
    doc.rect(margin, y - 1, 2, 1, 'F'); // placeholder for bar

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.dark);

    const splitNotes = doc.splitTextToSize(show.techNotes, W - margin * 2 - 6);
    const notesLineHeight = 5;
    const notesBlockHeight = splitNotes.length * notesLineHeight + 8;

    // Light background block
    doc.setFillColor(...C.light);
    doc.setDrawColor(...C.border);
    doc.roundedRect(margin, y - 2, W - margin * 2, notesBlockHeight, 2, 2, 'FD');

    // Amber left bar
    doc.setFillColor(...C.amber);
    doc.rect(margin, y - 2, 2.5, notesBlockHeight, 'F');

    doc.setTextColor(...C.dark);
    doc.text(splitNotes, margin + 6, y + 3);
    y += notesBlockHeight + 6;
  }

  // ─── Footer ────────────────────────────────────────────────────────────────
  const pageH = 297; // A4 height mm
  doc.setDrawColor(...C.amber);
  doc.setLineWidth(0.4);
  doc.line(margin, pageH - 14, W - margin, pageH - 14);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.slate);
  doc.text('Show Timer · Professional Theatre Timing', margin, pageH - 9);

  const pageStr = 'Page 1 of 1';
  doc.text(pageStr, W - margin - doc.getTextWidth(pageStr), pageH - 9);

  // ─── Save ──────────────────────────────────────────────────────────────────
  const filename = `${(show.production || show.title).replace(/[^a-z0-9]/gi, '-')}-report-${show.date}.pdf`;
  doc.save(filename);
}
