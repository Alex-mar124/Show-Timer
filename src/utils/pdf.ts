import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { Show, Run, TimeFormat } from '../types';
import { getElapsedMs, getShowTimeWindowMs, getNonShowTimeMs, staffBreakMinutes, staffWorkedMs, effectiveClientArrival, effectiveClientDeparture } from '../types';
import { formatTime, formatDuration, formatDateLong, formatDateShort } from './time';

// Colour palette (RGB)
const C = {
  amber:  [245, 158, 11]  as [number, number, number],
  dark:   [15, 23, 42]    as [number, number, number],
  mid:    [30, 41, 59]    as [number, number, number],
  slate:  [100, 116, 139] as [number, number, number],
  light:  [248, 250, 252] as [number, number, number],
  white:  [255, 255, 255] as [number, number, number],
  green:  [22, 163, 74]   as [number, number, number],
  rose:   [225, 29, 72]   as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
};

const W = 210;       // A4 width mm
const PAGE_H = 297;  // A4 height mm
const MARGIN = 16;

function lastTableY(doc: jsPDF, fallback: number): number {
  return (doc as any).lastAutoTable?.finalY ?? fallback;
}

/** Add a new page if there isn't room for `needed` mm; return the working y. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - 18) {
    doc.addPage();
    return 20;
  }
  return y;
}

function sectionLabel(doc: jsPDF, label: string, y: number): number {
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.amber);
  doc.text(label.toUpperCase(), MARGIN, y);
  return y + 4;
}

function divider(doc: jsPDF, y: number): number {
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, W - MARGIN, y);
  return y + 7;
}

function commentBox(doc: jsPDF, title: string, text: string, y: number, minHeight = 22): number {
  y = ensureSpace(doc, y, minHeight + 12);
  y = sectionLabel(doc, title, y) + 1;

  const body = text?.trim() || '—';
  const lines = doc.splitTextToSize(body, W - MARGIN * 2 - 8);
  const height = Math.max(minHeight, lines.length * 5 + 8);

  doc.setFillColor(...C.light);
  doc.setDrawColor(...C.border);
  doc.roundedRect(MARGIN, y - 2, W - MARGIN * 2, height, 2, 2, 'FD');
  doc.setFillColor(...C.amber);
  doc.rect(MARGIN, y - 2, 2.5, height, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', text?.trim() ? 'normal' : 'italic');
  doc.setTextColor(...(text?.trim() ? C.dark : C.slate));
  doc.text(lines, MARGIN + 6, y + 4);
  return y + height + 7;
}

function header(doc: jsPDF, kicker: string, title: string, subtitle: string | null, dateStr: string): number {
  doc.setFillColor(...C.amber);
  doc.rect(0, 0, W, 5, 'F');

  let y = 18;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.amber);
  doc.text(kicker, MARGIN, y);
  y += 7;

  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.dark);
  doc.text(title, MARGIN, y);
  y += 7;

  if (subtitle) {
    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.slate);
    doc.text(subtitle, MARGIN, y);
    y += 5.5;
  }

  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.slate);
  doc.text(dateStr, MARGIN, y);

  doc.setFontSize(8); doc.setTextColor(...C.slate);
  const gen = `Generated ${format(new Date(), 'HH:mm · d MMM yyyy')}`;
  doc.text(gen, W - MARGIN - doc.getTextWidth(gen), 18);

  y += 8;
  return divider(doc, y);
}

function footer(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.amber); doc.setLineWidth(0.4);
    doc.line(MARGIN, PAGE_H - 14, W - MARGIN, PAGE_H - 14);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.slate);
    doc.text('Show Timer · Professional Theatre Timing', MARGIN, PAGE_H - 9);
    const ps = `Page ${i} of ${pages}`;
    doc.text(ps, W - MARGIN - doc.getTextWidth(ps), PAGE_H - 9);
  }
}

// Two side-by-side stat cards (used for client access + totals).
function statCard(doc: jsPDF, x: number, w: number, y: number, label: string, value: string, color: [number, number, number]): void {
  doc.setFillColor(...C.light); doc.setDrawColor(...C.border); doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, 16, 2, 2, 'FD');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.slate);
  doc.text(label.toUpperCase(), x + 4, y + 5.5);
  doc.setFontSize(13); doc.setFont('courier', 'bold'); doc.setTextColor(...color);
  doc.text(value, x + 4, y + 12.5);
}

function span(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = new Date(b).getTime() - new Date(a).getTime();
  return d >= 0 ? d : null;
}

// ── Single-show report ────────────────────────────────────────────────────────

export function generatePDF(show: Show, timeFormat: TimeFormat): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();

  let y = header(
    doc, 'SHOW REPORT',
    show.production || show.title,
    show.title && show.title !== show.production ? show.title : null,
    formatDateLong(show.date),
  );

  // ─── Client access ─────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'Client Access', y) + 1;
  const half = (W - MARGIN * 2 - 4) / 2;
  const cArr = effectiveClientArrival(show);
  const cDep = effectiveClientDeparture(show);
  statCard(doc, MARGIN, half, y, 'Arrival', formatTime(cArr, timeFormat), C.green);
  statCard(doc, MARGIN + half + 4, half, y, 'Departure', formatTime(cDep, timeFormat), C.rose);
  y += 20;
  const onSite = span(cArr, cDep);
  if (onSite !== null) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.slate);
    doc.text(`Client on site: ${formatDuration(onSite)}`, MARGIN, y);
    y += 6;
  }

  // ─── Staff ─────────────────────────────────────────────────────────────────
  if (show.staff.length > 0) {
    y = ensureSpace(doc, y, 24);
    y = sectionLabel(doc, 'Staff', y);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Name', 'Role', 'In', 'Out', 'Breaks', 'Net Hours']],
      body: show.staff.map(m => {
        const bm = staffBreakMinutes(m);
        const net = staffWorkedMs(m);
        return [
          m.name || '—', m.role || '—',
          formatTime(m.arrival, timeFormat),
          formatTime(m.departure, timeFormat),
          m.breaks.length > 0 ? `${m.breaks.length} · ${bm}m` : '—',
          net !== null ? formatDuration(net) : '—',
        ];
      }),
      theme: 'grid',
      headStyles: { fillColor: C.mid, textColor: C.white, fontStyle: 'bold', fontSize: 8, cellPadding: 3 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3, textColor: C.dark },
      alternateRowStyles: { fillColor: C.light },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold' },
        2: { halign: 'center', font: 'courier' },
        3: { halign: 'center', font: 'courier' },
        4: { halign: 'center' },
        5: { halign: 'center', font: 'courier', fontStyle: 'bold' },
      },
    });
    y = lastTableY(doc, y) + 8;
  }

  // ─── Show timing (no +/- column) ───────────────────────────────────────────
  const segments = [...show.segments].sort((a, b) => a.order - b.order);
  y = ensureSpace(doc, y, 24);
  y = sectionLabel(doc, 'Show Timing', y);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Segment', 'Start', 'End', 'Duration']],
    body: segments.map(seg => [
      seg.label,
      formatTime(seg.actualStart, timeFormat),
      seg.type === 'show_end' ? '—' : formatTime(seg.actualEnd, timeFormat),
      seg.actualStart && seg.type !== 'show_end' ? formatDuration(getElapsedMs(seg, now)) : '—',
    ]),
    theme: 'grid',
    headStyles: { fillColor: C.mid, textColor: C.white, fontStyle: 'bold', fontSize: 8, cellPadding: 3.5 },
    bodyStyles: { fontSize: 8.5, cellPadding: 3.5, textColor: C.dark },
    alternateRowStyles: { fillColor: C.light },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: 'bold' },
      1: { halign: 'center', font: 'courier' },
      2: { halign: 'center', font: 'courier' },
      3: { halign: 'center', font: 'courier' },
    },
  });
  y = lastTableY(doc, y) + 8;

  // ─── Totals: in-show vs not-in-show ────────────────────────────────────────
  y = ensureSpace(doc, y, 24);
  const showMs = getShowTimeWindowMs(show, now);
  const nonShowMs = getNonShowTimeMs(show, now);
  statCard(doc, MARGIN, half, y, 'Time in show (doors → finish)', formatDuration(showMs), C.amber);
  statCard(doc, MARGIN + half + 4, half, y, 'Time not in show', formatDuration(nonShowMs), C.slate);
  y += 22;

  // ─── Comments + signature ──────────────────────────────────────────────────
  y = commentBox(doc, 'Tech Comments', show.techNotes, y);
  y = commentBox(doc, 'Client Comments', show.clientComments, y);

  // Signature
  y = ensureSpace(doc, y, 34);
  y = sectionLabel(doc, 'Client Signature', y) + 2;
  if (show.clientSignature) {
    try {
      doc.addImage(show.clientSignature, 'PNG', MARGIN, y, 60, 22);
    } catch { /* ignore bad image data */ }
    y += 24;
  } else {
    doc.setDrawColor(...C.slate); doc.setLineWidth(0.4);
    doc.line(MARGIN, y + 14, MARGIN + 80, y + 14);
    y += 18;
  }
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.slate);
  doc.text('Signed', MARGIN, y);
  doc.text(`Date: ${formatDateShort(show.date)}`, MARGIN + 90, y);

  footer(doc);
  const filename = `${(show.production || show.title).replace(/[^a-z0-9]/gi, '-')}-${show.date}.pdf`;
  doc.save(filename);
}

// ── Printable double-sided report (blank for handwriting) ─────────────────────

/** Draw N ruled lines for handwritten input. Returns new y. */
function ruledArea(doc: jsPDF, y: number, lines: number, gap = 9): number {
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  for (let i = 0; i < lines; i++) {
    y += gap;
    doc.line(MARGIN, y, W - MARGIN, y);
  }
  return y + 4;
}

function timingTable(doc: jsPDF, show: Show, timeFormat: TimeFormat, y: number, now: Date): number {
  y = sectionLabel(doc, 'Show Timing', y);
  const segments = [...show.segments].sort((a, b) => a.order - b.order);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Segment', 'Start', 'End', 'Duration']],
    body: segments.map(seg => [
      seg.label,
      formatTime(seg.actualStart, timeFormat),
      seg.type === 'show_end' ? '—' : formatTime(seg.actualEnd, timeFormat),
      seg.actualStart && seg.type !== 'show_end' ? formatDuration(getElapsedMs(seg, now)) : '—',
    ]),
    theme: 'grid',
    headStyles: { fillColor: C.mid, textColor: C.white, fontStyle: 'bold', fontSize: 8, cellPadding: 3.5 },
    bodyStyles: { fontSize: 8.5, cellPadding: 3.5, textColor: C.dark },
    alternateRowStyles: { fillColor: C.light },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: 'bold' },
      1: { halign: 'center', font: 'courier' },
      2: { halign: 'center', font: 'courier' },
      3: { halign: 'center', font: 'courier' },
    },
  });
  return lastTableY(doc, y) + 8;
}

function totalsRow(doc: jsPDF, show: Show, y: number, now: Date): number {
  const half = (W - MARGIN * 2 - 4) / 2;
  statCard(doc, MARGIN, half, y, 'Time in show (doors → finish)', formatDuration(getShowTimeWindowMs(show, now)), C.amber);
  statCard(doc, MARGIN + half + 4, half, y, 'Time not in show', formatDuration(getNonShowTimeMs(show, now)), C.slate);
  return y + 22;
}

/**
 * Two-page printable report: page 1 is the client copy (blank comment +
 * signature space), page 2 is the tech copy (tech comments). Both carry the
 * same timing summary so either side stands alone. Print double-sided.
 */
export function generatePrintablePDF(show: Show, timeFormat: TimeFormat): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();
  const title = show.production || show.title;
  const sub = show.title && show.title !== show.production ? show.title : null;

  // ── Page 1 — CLIENT COPY ───────────────────────────────────────────────────
  let y = header(doc, 'CLIENT COPY', title, sub, formatDateLong(show.date));

  y = sectionLabel(doc, 'Client Access', y) + 1;
  const half = (W - MARGIN * 2 - 4) / 2;
  statCard(doc, MARGIN, half, y, 'Arrival', formatTime(effectiveClientArrival(show), timeFormat), C.green);
  statCard(doc, MARGIN + half + 4, half, y, 'Departure', formatTime(effectiveClientDeparture(show), timeFormat), C.rose);
  y += 22;

  y = timingTable(doc, show, timeFormat, y, now);
  y = totalsRow(doc, show, y, now);

  y = ensureSpace(doc, y, 50);
  y = sectionLabel(doc, 'Client Comments', y);
  y = ruledArea(doc, y, 4);

  y += 6;
  y = sectionLabel(doc, 'Client Signature', y) + 6;
  doc.setDrawColor(...C.slate); doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 6, MARGIN + 80, y + 6);
  doc.line(W - MARGIN - 55, y + 6, W - MARGIN, y + 6);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.slate);
  doc.text('Signed', MARGIN, y + 11);
  doc.text('Date', W - MARGIN - 55, y + 11);

  // ── Page 2 — TECH COPY ─────────────────────────────────────────────────────
  doc.addPage();
  y = header(doc, 'TECH COPY', title, sub, formatDateLong(show.date));

  if (show.staff.length > 0) {
    y = sectionLabel(doc, 'Staff', y);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Name', 'Role', 'In', 'Out', 'Breaks', 'Net Hours']],
      body: show.staff.map(m => {
        const net = staffWorkedMs(m);
        return [
          m.name || '—', m.role || '—',
          formatTime(m.arrival, timeFormat), formatTime(m.departure, timeFormat),
          m.breaks.length > 0 ? `${m.breaks.length} · ${staffBreakMinutes(m)}m` : '—',
          net !== null ? formatDuration(net) : '—',
        ];
      }),
      theme: 'grid',
      headStyles: { fillColor: C.mid, textColor: C.white, fontStyle: 'bold', fontSize: 8, cellPadding: 3 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3, textColor: C.dark },
      alternateRowStyles: { fillColor: C.light },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold' },
        2: { halign: 'center', font: 'courier' }, 3: { halign: 'center', font: 'courier' },
        4: { halign: 'center' }, 5: { halign: 'center', font: 'courier', fontStyle: 'bold' },
      },
    });
    y = lastTableY(doc, y) + 8;
  }

  y = timingTable(doc, show, timeFormat, y, now);
  y = totalsRow(doc, show, y, now);

  y = sectionLabel(doc, 'Tech Comments', y);
  if (show.techNotes?.trim()) {
    const lines = doc.splitTextToSize(show.techNotes, W - MARGIN * 2 - 8);
    const h = Math.max(24, lines.length * 5 + 8);
    doc.setFillColor(...C.light); doc.setDrawColor(...C.border);
    doc.roundedRect(MARGIN, y, W - MARGIN * 2, h, 2, 2, 'FD');
    doc.setFillColor(...C.amber); doc.rect(MARGIN, y, 2.5, h, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.dark);
    doc.text(lines, MARGIN + 6, y + 6);
  } else {
    ruledArea(doc, y, 4);
  }

  footer(doc);
  doc.save(`${safeName(title)}-${show.date}-printable.pdf`);
}

function safeName(s: string): string {
  return (s || 'show').replace(/[^a-z0-9]/gi, '-');
}

// ── Combined run report ───────────────────────────────────────────────────────

/** Earliest staff arrival / latest staff departure across a show. */
function staffWindow(show: Show): { first: string | null; last: string | null } {
  let first: number | null = null;
  let last: number | null = null;
  for (const m of show.staff) {
    if (m.arrival) { const t = new Date(m.arrival).getTime(); if (first === null || t < first) first = t; }
    if (m.departure) { const t = new Date(m.departure).getTime(); if (last === null || t > last) last = t; }
  }
  return {
    first: first !== null ? new Date(first).toISOString() : null,
    last: last !== null ? new Date(last).toISOString() : null,
  };
}

/** Daily breakdown table + run totals. Returns y after the totals block. */
function runSummaryBody(doc: jsPDF, run: Run, shows: Show[], timeFormat: TimeFormat, y: number, now: Date): number {
  y = sectionLabel(doc, 'Daily Breakdown', y);
  let totalShow = 0;
  let totalNonShow = 0;

  const rows = shows.map((s, i) => {
    const showMs = getShowTimeWindowMs(s, now);
    totalShow += showMs;
    totalNonShow += getNonShowTimeMs(s, now);
    const sw = staffWindow(s);
    return [
      String(i + 1),
      formatDateShort(s.date),
      s.title || '—',
      formatTime(effectiveClientArrival(s), timeFormat),
      formatTime(effectiveClientDeparture(s), timeFormat),
      formatTime(sw.first, timeFormat),
      formatTime(sw.last, timeFormat),
      showMs > 0 ? formatDuration(showMs) : '—',
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['#', 'Date', 'Day', 'Client In', 'Client Out', 'Staff In', 'Staff Out', 'Show Time']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: C.mid, textColor: C.white, fontStyle: 'bold', fontSize: 7.5, cellPadding: 2.5 },
    bodyStyles: { fontSize: 8, cellPadding: 2.5, textColor: C.dark },
    alternateRowStyles: { fillColor: C.light },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      3: { halign: 'center', font: 'courier' }, 4: { halign: 'center', font: 'courier' },
      5: { halign: 'center', font: 'courier' }, 6: { halign: 'center', font: 'courier' },
      7: { halign: 'center', font: 'courier', fontStyle: 'bold' },
    },
  });
  y = lastTableY(doc, y) + 8;

  y = ensureSpace(doc, y, 24);
  const half = (W - MARGIN * 2 - 4) / 2;
  statCard(doc, MARGIN, half, y, 'Total time in show', formatDuration(totalShow), C.amber);
  statCard(doc, MARGIN + half + 4, half, y, 'Total time not in show', formatDuration(totalNonShow), C.slate);
  y += 22;

  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.slate);
  doc.text(`${shows.length} day${shows.length === 1 ? '' : 's'} · ${run.production}${run.venue ? ` · ${run.venue}` : ''}`, MARGIN, y);
  return y;
}

export function generateRunReportPDF(run: Run, runShows: Show[], timeFormat: TimeFormat): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();
  const shows = [...runShows].sort((a, b) => a.date.localeCompare(b.date));
  const dateRange = shows.length
    ? `${formatDateShort(shows[0].date)} — ${formatDateShort(shows[shows.length - 1].date)}`
    : '';

  let y = header(doc, 'RUN SUMMARY REPORT', run.name || run.production, run.venue || null, dateRange);
  y = runSummaryBody(doc, run, shows, timeFormat, y, now);

  if (run.notes?.trim()) {
    y += 8;
    y = commentBox(doc, 'Run Notes', run.notes, y);
  }

  footer(doc);
  doc.save(`${safeName(run.name || run.production)}-run-summary.pdf`);
}

/**
 * Double-sided printable run summary: page 1 client copy (summary + blank
 * client notes + signature space), page 2 tech copy (summary + tech notes).
 */
export function generateRunPrintablePDF(run: Run, runShows: Show[], timeFormat: TimeFormat): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();
  const shows = [...runShows].sort((a, b) => a.date.localeCompare(b.date));
  const dateRange = shows.length
    ? `${formatDateShort(shows[0].date)} — ${formatDateShort(shows[shows.length - 1].date)}`
    : '';
  const titleStr = run.name || run.production;

  // ── Page 1 — CLIENT COPY ───────────────────────────────────────────────────
  let y = header(doc, 'CLIENT COPY', titleStr, run.venue || null, dateRange);
  y = runSummaryBody(doc, run, shows, timeFormat, y, now);

  y = ensureSpace(doc, y + 6, 50);
  y = sectionLabel(doc, 'Client Comments', y);
  y = ruledArea(doc, y, 4);

  y += 6;
  y = sectionLabel(doc, 'Client Signature', y) + 6;
  doc.setDrawColor(...C.slate); doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 6, MARGIN + 80, y + 6);
  doc.line(W - MARGIN - 55, y + 6, W - MARGIN, y + 6);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.slate);
  doc.text('Signed', MARGIN, y + 11);
  doc.text('Date', W - MARGIN - 55, y + 11);

  // ── Page 2 — TECH COPY ─────────────────────────────────────────────────────
  doc.addPage();
  y = header(doc, 'TECH COPY', titleStr, run.venue || null, dateRange);
  y = runSummaryBody(doc, run, shows, timeFormat, y, now);

  y += 6;
  y = sectionLabel(doc, 'Tech Notes', y);
  if (run.notes?.trim()) {
    const lines = doc.splitTextToSize(run.notes, W - MARGIN * 2 - 8);
    const h = Math.max(24, lines.length * 5 + 8);
    doc.setFillColor(...C.light); doc.setDrawColor(...C.border);
    doc.roundedRect(MARGIN, y, W - MARGIN * 2, h, 2, 2, 'FD');
    doc.setFillColor(...C.amber); doc.rect(MARGIN, y, 2.5, h, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.dark);
    doc.text(lines, MARGIN + 6, y + 6);
  } else {
    ruledArea(doc, y, 4);
  }

  footer(doc);
  doc.save(`${safeName(titleStr)}-run-printable.pdf`);
}

/** Generate one individual PDF per show in a run (sequential downloads). */
export function generateAllRunReports(runShows: Show[], timeFormat: TimeFormat): void {
  [...runShows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((show, i) => setTimeout(() => generatePDF(show, timeFormat), i * 400));
}
