// ============================================================================
//  KARRALYKA — Show Report  ·  jsPDF renderer  (multi-page · double-sided)
//
//  Drop-in renderer that reproduces the redesigned report layout 1:1.
//  Handles ANY length: staff list, show timing and comments flow across as
//  many pages as needed. Tables repeat their column header on each new page,
//  every page gets the running header + footer, and footers read
//  "PAGE n / N" (real totals via putTotalPages). Margins are symmetric so it
//  prints clean double-sided.
//
//  Source: design handoff (integration/showReportPdf.ts), with one local
//  addition — the signature box renders the captured signature image when
//  present (see drawSignatureImage), falling back to a blank signing line.
// ============================================================================

import type { jsPDF } from 'jspdf';

// ---------------------------------------------------------------------------
//  DATA SHAPE  — map the app's report object onto this
// ---------------------------------------------------------------------------
export interface ShowReport {
  showName: string;          // "Macbeth"
  night: string;             // "Night 1"
  dateLong: string;          // "Sunday 28 June 2026"
  dateShort: string;         // "28 JUN 2026"
  generated: string;         // "18:07 · 30 Jun 2026"
  access: { arrival: string; departure: string; onSite: string };
  totals: { inShow: string; notInShow: string };
  staff: Array<{ name: string; role: string; in: string; out: string; breaks: string; net: string }>;
  timing: Array<{ segment: string; start: string; end: string; duration: string; kind?: 'act' | 'interval' | 'normal' }>;
  techComments: string;
  clientComments: string;
  signature: { name: string; date: string; image?: string | null };
}

export interface LogoAssets {
  markInk: string;       // transparent K-monogram, ink   (data-URL)
  wordmarkInk: string;   // transparent KARRALYKA wordmark (data-URL)
  markWhite: string;     // transparent K-monogram, white  (data-URL) — hero watermark
}

// ---------------------------------------------------------------------------
//  DESIGN TOKENS  (1:1 with the HTML design)
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
const C = {
  ink:      [26, 18, 34] as RGB,   ink2:    [44, 36, 54] as RGB,
  soft:     [58, 51, 67] as RGB,   muted:   [110, 100, 121] as RGB,
  faint:    [137, 127, 149] as RGB, hairline:[236, 230, 243] as RGB,
  line:     [233, 227, 240] as RGB, purple:  [91, 46, 144] as RGB,
  purpleLt: [201, 179, 236] as RGB, wash:    [244, 240, 249] as RGB,
  washRow:  [247, 243, 251] as RGB, washEdge:[234, 217, 242] as RGB,
  heroBg:   [27, 18, 38] as RGB,   heroLilac:[183, 155, 224] as RGB,
  heroMute: [157, 140, 190] as RGB, paper:  [251, 250, 252] as RGB,
  footer:   [167, 157, 179] as RGB, signGuide:[216, 207, 230] as RGB,
};
const F = { serif: 'Spectral', sans: 'Archivo', mono: 'JetBrainsMono' };

// Page geometry (Letter, points). Symmetric margins -> duplex-safe.
const PAGE_W = 612, PAGE_H = 792;
const MX = 46, CW = PAGE_W - MX * 2, RIGHT = PAGE_W - MX;
const BOTTOM = 724;     // lowest a block may reach before a page break
const CONT_TOP = 96;    // first content baseline on a continuation page
const PAGE_TOKEN = '{tp}';

// ---------------------------------------------------------------------------
//  LOW-LEVEL
// ---------------------------------------------------------------------------
const set = (d: jsPDF, c: RGB) => d.setTextColor(c[0], c[1], c[2]);
const fill = (d: jsPDF, c: RGB) => d.setFillColor(c[0], c[1], c[2]);
const stroke = (d: jsPDF, c: RGB) => d.setDrawColor(c[0], c[1], c[2]);

function font(d: jsPDF, key: keyof typeof F, weight: 'normal' | 'bold' | 'italic' = 'normal') {
  const fam = F[key];
  const styles: string[] = (d as any).getFontList?.()[fam] ?? [];
  if (styles.length) {
    // Family is embedded — use the requested style, else fall back within the
    // family (e.g. italic → normal when no italic face was embedded).
    if (styles.includes(weight)) { d.setFont(fam, weight); return; }
    if (styles.includes('normal')) { d.setFont(fam, 'normal'); return; }
    d.setFont(fam, styles[0]); return;
  }
  const fb = key === 'serif' ? 'times' : key === 'mono' ? 'courier' : 'helvetica';
  d.setFont(fb, weight);
}

// ---------------------------------------------------------------------------
//  RENDER CONTEXT  — carries the moving cursor + current page number
// ---------------------------------------------------------------------------
interface Ctx { d: jsPDF; r: ShowReport; logos: LogoAssets; y: number; page: number; }

function paintBase(d: jsPDF) {
  fill(d, C.paper); d.rect(0, 0, PAGE_W, PAGE_H, 'F');
  fill(d, C.purple); d.rect(0, 0, PAGE_W, 4, 'F');
}

function drawFooter(ctx: Ctx) {
  const { d, r } = ctx, y = PAGE_H - 40;
  stroke(d, C.line); d.setLineWidth(0.75); d.line(MX, y, RIGHT, y);
  font(d, 'mono', 'normal'); d.setFontSize(7.5); set(d, C.footer);
  d.text(`KARRALYKA · ${r.showName.toUpperCase()} · ${r.night.toUpperCase()}`, MX, y + 14, { charSpace: 0.5 });
  d.text(`PAGE ${ctx.page} / ${PAGE_TOKEN}`, RIGHT, y + 14, { align: 'right', charSpace: 0.5 });
}

// compact running header used on continuation pages; returns y after it
function runningHeader(ctx: Ctx): number {
  const { d, r, logos } = ctx, y = 60;
  d.addImage(logos.markInk, 'PNG', MX, y - 14, 20, 20);
  font(d, 'serif', 'normal'); d.setFontSize(15); set(d, C.ink);
  d.text(r.showName, MX + 28, y - 4);
  font(d, 'mono', 'normal'); d.setFontSize(7); set(d, C.faint);
  d.text(`${r.night.toUpperCase()} · ${r.dateShort}`, MX + 28, y + 6, { charSpace: 1 });
  font(d, 'mono', 'bold'); d.setFontSize(8); set(d, C.purple);
  d.text('SHOW REPORT', RIGHT, y - 2, { align: 'right', charSpace: 1.6 });
  stroke(d, C.line); d.setLineWidth(0.75); d.line(MX, y + 14, RIGHT, y + 14);
  return CONT_TOP;
}

// close current page, open a fresh continuation page, reset cursor
function breakPage(ctx: Ctx) {
  drawFooter(ctx);
  ctx.d.addPage('letter', 'portrait');
  ctx.page++;
  paintBase(ctx.d);
  ctx.y = runningHeader(ctx);
}

// ensure `need` pts of vertical room; page-break (optionally repeating a
// header drawer such as a table's column row) if not
function ensure(ctx: Ctx, need: number, repeat?: (c: Ctx) => void) {
  if (ctx.y + need > BOTTOM) { breakPage(ctx); if (repeat) repeat(ctx); }
}

// ---------------------------------------------------------------------------
//  SHARED PIECES
// ---------------------------------------------------------------------------
function sectionHeader(ctx: Ctx, num: string, label: string) {
  const { d } = ctx, y = ctx.y;
  font(d, 'mono', 'bold'); d.setFontSize(10); set(d, C.purple);
  d.text(num, MX, y);
  const up = label.toUpperCase();
  font(d, 'sans', 'bold'); d.setFontSize(9.5); set(d, C.ink);
  d.text(up, MX + 22, y, { charSpace: 1.2 });
  const lw = d.getTextWidth(up);
  stroke(d, C.line); d.setLineWidth(0.75); d.line(MX + 22 + lw + 12, y - 3, RIGHT, y - 3);
  ctx.y += 16;
}

function drawTotal(d: jsPDF, rx: number, y: number, label: string, value: string, sub: string, valueCol: RGB) {
  font(d, 'sans', 'bold'); d.setFontSize(7.5); set(d, C.heroMute);
  d.text(label, rx, y, { align: 'right', charSpace: 1 });
  font(d, 'mono', 'bold'); d.setFontSize(23); set(d, valueCol);
  d.text(value, rx, y + 24, { align: 'right' });
  font(d, 'sans', 'normal'); d.setFontSize(7); set(d, [126, 111, 156]);
  d.text(sub, rx, y + 38, { align: 'right', charSpace: 0.6 });
}

function accessCard(d: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, tinted: boolean) {
  if (tinted) { fill(d, C.wash); stroke(d, C.washEdge); } else { fill(d, [255, 255, 255]); stroke(d, C.line); }
  d.setLineWidth(0.75); d.roundedRect(x, y, w, h, 9, 9, 'FD');
  font(d, 'sans', 'bold'); d.setFontSize(7.5); set(d, tinted ? [122, 91, 160] : C.faint);
  d.text(label, x + 16, y + 22, { charSpace: 1.1 });
  font(d, 'mono', 'bold'); d.setFontSize(18); set(d, tinted ? C.purple : C.ink);
  d.text(value, x + 16, y + 47);
}

// simple, identical panel for both Tech and Client comments
function commentPanel(ctx: Ctx, text: string) {
  const { d } = ctx, padX = 20, padY = 17, lineH = 17;
  font(d, 'sans', 'normal'); d.setFontSize(11);
  const lines = d.splitTextToSize(text, CW - padX * 2 - 3) as string[];
  const boxH = padY * 2 + lines.length * lineH;
  ensure(ctx, boxH + 6);
  const y = ctx.y;
  fill(d, [255, 255, 255]); stroke(d, C.line); d.setLineWidth(0.75);
  d.roundedRect(MX, y, CW, boxH, 10, 10, 'FD');
  fill(d, C.purple); d.rect(MX, y + 1, 3, boxH - 2, 'F');
  set(d, C.ink2); font(d, 'sans', 'normal'); d.setFontSize(11);
  let ty = y + padY + 9;
  for (const ln of lines) { d.text(ln, MX + padX, ty); ty += lineH; }
  ctx.y = y + boxH;
}

// Fit the captured signature PNG inside the signing box (aspect-preserving).
function drawSignatureImage(d: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
  try {
    const props = d.getImageProperties(dataUrl);
    const maxW = w - 40, maxH = h - 46;
    const aspect = props.width / props.height;
    let rw = maxW, rh = rw / aspect;
    if (rh > maxH) { rh = maxH; rw = rh * aspect; }
    const ix = x + 20;
    const iy = y + 30 + (maxH - rh) / 2;
    d.addImage(dataUrl, 'PNG', ix, iy, rw, rh);
  } catch { /* ignore bad image data */ }
}

// ---------------------------------------------------------------------------
//  MAIN
// ---------------------------------------------------------------------------
export async function drawShowReport(d: jsPDF, r: ShowReport, logos: LogoAssets) {
  const ctx: Ctx = { d, r, logos, y: 0, page: 1 };
  paintBase(d);

  // ---- brand header (page 1 only) ----------------------------------------
  let y = 64;
  d.addImage(logos.markInk, 'PNG', MX, y - 12, 22, 22);
  d.addImage(logos.wordmarkInk, 'PNG', MX + 30, y - 5, 92, 92 * (15 / 92));
  font(d, 'mono', 'bold'); d.setFontSize(8); set(d, C.purple);
  d.text('SHOW REPORT', RIGHT, y - 6, { align: 'right', charSpace: 1.4 });
  font(d, 'mono', 'normal'); d.setFontSize(7.5); set(d, C.faint);
  d.text(`GENERATED ${r.generated.toUpperCase()}`, RIGHT, y + 5, { align: 'right', charSpace: 0.4 });
  y += 18; stroke(d, C.line); d.setLineWidth(0.75); d.line(MX, y, RIGHT, y); y += 20;

  // ---- hero (page 1 only) -------------------------------------------------
  const heroH = 132;
  fill(d, C.heroBg); d.roundedRect(MX, y, CW, heroH, 12, 12, 'F');
  d.addImage(logos.markWhite, 'PNG', RIGHT - 150, y - 26, 160, 160);
  fill(d, C.paper); d.rect(RIGHT + 6, y - 30, 40, heroH + 60, 'F'); d.rect(MX - 4, y - 30, CW + 12, 30, 'F');
  const hx = MX + 28, hy = y + 34;
  font(d, 'mono', 'bold'); d.setFontSize(7.5); set(d, C.heroLilac);
  d.text('SHOW REPORT', hx, hy, { charSpace: 2.4 });
  font(d, 'serif', 'normal'); d.setFontSize(40); set(d, [246, 242, 251]);
  d.text(r.showName, hx - 1, hy + 38);
  const pillY = hy + 60; font(d, 'mono', 'bold'); d.setFontSize(7.5);
  const pillTxt = r.night.toUpperCase(), pw = d.getTextWidth(pillTxt) + 16;
  fill(d, C.purpleLt); d.roundedRect(hx, pillY - 9, pw, 15, 7.5, 7.5, 'F');
  set(d, C.ink); d.text(pillTxt, hx + 8, pillY + 1, { charSpace: 0.8 });
  font(d, 'sans', 'normal'); d.setFontSize(10); set(d, [200, 189, 216]);
  d.text(r.dateLong, hx + pw + 10, pillY + 1);
  const t2x = RIGHT - 28, t1x = t2x - 150;
  drawTotal(d, t1x, y + 30, 'TIME IN SHOW', r.totals.inShow, 'PERFORMANCE', [246, 242, 251]);
  drawTotal(d, t2x, y + 30, 'NOT IN SHOW', r.totals.notInShow, 'BUMP / TURNAROUND', C.heroLilac);
  stroke(d, [70, 56, 96]); d.setLineWidth(0.6); d.line(t1x + 16, y + 26, t1x + 16, y + heroH - 26);
  ctx.y = y + heroH + 30;

  // ---- 01 CLIENT ACCESS ---------------------------------------------------
  ensure(ctx, 96);
  sectionHeader(ctx, '01', 'Client Access');
  const cardW = (CW - 28) / 3, cardH = 64, ay = ctx.y;
  accessCard(d, MX, ay, cardW, cardH, 'ARRIVAL', r.access.arrival, false);
  accessCard(d, MX + cardW + 14, ay, cardW, cardH, 'DEPARTURE', r.access.departure, false);
  accessCard(d, MX + (cardW + 14) * 2, ay, cardW, cardH, 'CLIENT ON SITE', r.access.onSite, true);
  ctx.y = ay + cardH + 30;

  // ---- 02 STAFF -----------------------------------------------------------
  if (r.staff.length > 0) {
    const staffHead = (c: Ctx) => {
      font(d, 'sans', 'bold'); d.setFontSize(7.5); set(d, C.muted);
      d.text('NAME', MX, c.y, { charSpace: 0.9 });
      d.text('ROLE', MX + 150, c.y, { charSpace: 0.9 });
      d.text('IN', 372, c.y, { align: 'right', charSpace: 0.9 });
      d.text('OUT', 432, c.y, { align: 'right', charSpace: 0.9 });
      d.text('BREAKS', 500, c.y, { align: 'right', charSpace: 0.9 });
      set(d, C.purple); d.text('NET HOURS', RIGHT, c.y, { align: 'right', charSpace: 0.9 });
      c.y += 6; stroke(d, C.ink); d.setLineWidth(1.1); d.line(MX, c.y, RIGHT, c.y); c.y += 16;
    };
    ensure(ctx, 60);
    sectionHeader(ctx, '02', 'Staff'); staffHead(ctx);
    for (let i = 0; i < r.staff.length; i++) {
      ensure(ctx, 28, staffHead);
      const s = r.staff[i];
      font(d, 'sans', 'bold'); d.setFontSize(11); set(d, C.ink); d.text(s.name, MX, ctx.y);
      font(d, 'sans', 'normal'); d.setFontSize(10); set(d, C.muted); d.text(s.role, MX + 150, ctx.y);
      font(d, 'mono', 'normal'); d.setFontSize(9); set(d, C.soft);
      d.text(s.in, 372, ctx.y, { align: 'right' }); d.text(s.out, 432, ctx.y, { align: 'right' });
      set(d, C.faint); d.text(s.breaks, 500, ctx.y, { align: 'right' });
      font(d, 'mono', 'bold'); d.setFontSize(10); set(d, C.purple); d.text(s.net, RIGHT, ctx.y, { align: 'right' });
      ctx.y += 10;
      if (i < r.staff.length - 1) { stroke(d, C.hairline); d.setLineWidth(0.75); d.line(MX, ctx.y, RIGHT, ctx.y); }
      ctx.y += 16;
    }
    ctx.y += 14;
  }

  // ---- 03 SHOW TIMING -----------------------------------------------------
  const timeHead = (c: Ctx) => {
    font(d, 'sans', 'bold'); d.setFontSize(7.5); set(d, C.muted);
    d.text('SEGMENT', MX, c.y, { charSpace: 0.9 });
    d.text('START', 372, c.y, { align: 'right', charSpace: 0.9 });
    d.text('END', 460, c.y, { align: 'right', charSpace: 0.9 });
    d.text('DURATION', RIGHT, c.y, { align: 'right', charSpace: 0.9 });
    c.y += 6; stroke(d, C.ink); d.setLineWidth(1.1); d.line(MX, c.y, RIGHT, c.y); c.y += 14;
  };
  ensure(ctx, 60);
  sectionHeader(ctx, '03', 'Show Timing'); timeHead(ctx);
  for (let i = 0; i < r.timing.length; i++) {
    const rowH = 24; ensure(ctx, rowH, timeHead);
    const t = r.timing[i], isAct = t.kind === 'act', isInt = t.kind === 'interval', yy = ctx.y;
    if (isAct) { fill(d, C.washRow); d.rect(MX, yy - 11, CW, rowH, 'F'); }
    if (isAct || isInt) { fill(d, isAct ? C.purple : C.purpleLt); d.rect(MX, yy - 11, 2.5, rowH, 'F'); }
    const segX = (isAct || isInt) ? MX + 10 : MX;
    font(d, 'sans', isAct ? 'bold' : isInt ? 'italic' : 'normal'); d.setFontSize(10);
    set(d, isAct ? C.ink : isInt ? C.muted : C.soft); d.text(t.segment, segX, yy + 2);
    font(d, 'mono', 'normal'); d.setFontSize(9); set(d, isAct ? C.soft : C.muted);
    d.text(t.start, 372, yy + 2, { align: 'right' }); d.text(t.end, 460, yy + 2, { align: 'right' });
    font(d, 'mono', isAct ? 'bold' : 'normal'); d.setFontSize(9.5); set(d, isAct ? C.purple : C.ink);
    d.text(t.duration, RIGHT, yy + 2, { align: 'right' });
    ctx.y += rowH; stroke(d, C.hairline); d.setLineWidth(0.75); d.line(MX, ctx.y - 11, RIGHT, ctx.y - 11);
  }

  // ---- comments + signature : start on a fresh page -----------------------
  breakPage(ctx);

  ensure(ctx, 70);
  sectionHeader(ctx, '04', 'Tech Comments'); commentPanel(ctx, r.techComments); ctx.y += 24;

  ensure(ctx, 70);
  sectionHeader(ctx, '05', 'Client Comments'); commentPanel(ctx, r.clientComments); ctx.y += 24;

  // 06 SIGNATURE — captured signature (or blank signing area) + name + date
  ensure(ctx, 200);
  sectionHeader(ctx, '06', 'Client Signature'); ctx.y += 12;
  const boxY = ctx.y, boxH = 100;
  fill(d, [255, 255, 255]); stroke(d, C.line); d.setLineWidth(0.75);
  d.roundedRect(MX, boxY, CW, boxH, 11, 11, 'FD');
  font(d, 'sans', 'bold'); d.setFontSize(8); set(d, [188, 179, 201]);
  d.text('SIGNATURE', MX + 18, boxY + 22, { charSpace: 1.4 });
  if (r.signature.image) {
    drawSignatureImage(d, r.signature.image, MX, boxY, CW, boxH);
  } else {
    stroke(d, C.signGuide); d.setLineWidth(0.6); d.setLineDashPattern([3, 3], 0);
    d.line(MX + 18, boxY + boxH - 28, RIGHT - 18, boxY + boxH - 28);
    d.setLineDashPattern([], 0);
  }
  ctx.y = boxY + boxH + 26;
  const fieldW = (CW - 24) * 0.6;
  font(d, 'sans', 'bold'); d.setFontSize(13); set(d, C.ink); d.text(r.signature.name, MX, ctx.y);
  font(d, 'mono', 'normal'); d.setFontSize(12); set(d, C.ink); d.text(r.signature.date, MX + fieldW + 24, ctx.y);
  ctx.y += 11; stroke(d, C.ink); d.setLineWidth(1.2);
  d.line(MX, ctx.y, MX + fieldW, ctx.y); d.line(MX + fieldW + 24, ctx.y, RIGHT, ctx.y);
  ctx.y += 13; font(d, 'sans', 'bold'); d.setFontSize(7.5); set(d, C.faint);
  d.text('PRINT NAME', MX, ctx.y, { charSpace: 1.1 });
  d.text('DATE', MX + fieldW + 24, ctx.y, { charSpace: 1.1 });

  // ---- finalise: footer on last page + real page totals -------------------
  drawFooter(ctx);
  (d as any).putTotalPages(PAGE_TOKEN);
}
