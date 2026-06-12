import type { Show, Run, Segment, StaffMember } from '../types';
import { normalizeShow } from '../types';

export interface ExportBundle {
  app: 'show-timer';
  v: 2;
  kind: 'show' | 'run';
  preset: boolean;
  exportedAt: string;
  runs: Run[];
  shows: Show[];
}

function safeName(s: string): string {
  return (s || 'show-timer').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'show-timer';
}

/** Trigger a browser/webview file download for a JSON bundle. */
function download(filename: string, bundle: ExportBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Strip all live/run data, leaving a clean preset (plan only). */
function toPreset(show: Show): Show {
  const segments: Segment[] = show.segments.map(seg => ({
    ...seg,
    actualStart: null,
    actualEnd: null,
    holds: [],
    notes: '',
  }));
  const staff: StaffMember[] = show.staff.map(m => ({ ...m, arrival: null, departure: null }));
  return {
    ...show,
    segments,
    staff,
    notes: '',
    techNotes: '',
    clientArrival: null,
    clientDeparture: null,
    clientComments: '',
    clientSignature: null,
    completedAt: null,
  };
}

export function exportShow(show: Show, preset = false): void {
  const out = preset ? toPreset(show) : show;
  download(
    `${safeName(show.production || show.title)}-${show.date}${preset ? '-preset' : ''}.showtimer.json`,
    { app: 'show-timer', v: 2, kind: 'show', preset, exportedAt: new Date().toISOString(), runs: [], shows: [out] },
  );
}

export function exportRun(run: Run, runShows: Show[], preset = false): void {
  const shows = preset ? runShows.map(toPreset) : runShows;
  download(
    `${safeName(run.name || run.production)}-run${preset ? '-preset' : ''}.showtimer.json`,
    { app: 'show-timer', v: 2, kind: 'run', preset, exportedAt: new Date().toISOString(), runs: [run], shows },
  );
}

/** Parse + validate a bundle from raw file text. Throws on invalid input. */
export function parseBundle(text: string): { runs: Run[]; shows: Show[]; preset: boolean } {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.app !== 'show-timer' || !Array.isArray(parsed.shows)) {
    throw new Error('Not a valid Show Timer file');
  }
  return {
    runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    shows: parsed.shows.map(normalizeShow),
    preset: !!parsed.preset,
  };
}

/** Open a native file picker and resolve the chosen file's text (or null if cancelled). */
export function pickFile(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.showtimer.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}
