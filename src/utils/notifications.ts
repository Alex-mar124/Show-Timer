import { formatTime } from './time';
import type { AppSettings, Show, Segment, TimeFormat } from '../types';

let scheduledTimeouts: ReturnType<typeof setTimeout>[] = [];

function clearAllScheduled() {
  scheduledTimeouts.forEach(clearTimeout);
  scheduledTimeouts = [];
}

async function fireNotification(title: string, body: string) {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      '@tauri-apps/plugin-notification'
    );
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === 'granted';
    }
    if (granted) {
      await sendNotification({ title, body });
    }
  } catch {
    // Notification not available in browser dev mode — silently skip
  }
}

function scheduleAt(targetMs: number, title: string, body: string) {
  const delay = targetMs - Date.now();
  if (delay <= 0) return;
  const id = setTimeout(() => fireNotification(title, body), delay);
  scheduledTimeouts.push(id);
}

export function schedulePreShowNotifications(
  plannedStartISO: string,
  settings: AppSettings,
  timeFormat: TimeFormat
) {
  clearPreShowNotifications();
  if (!settings.preshowAlertsEnabled) return;

  const startMs = new Date(plannedStartISO).getTime();

  for (const minutesBefore of settings.preshowAlertMinutes) {
    const alertMs = startMs - minutesBefore * 60_000;
    const timeStr = formatTime(new Date(alertMs), timeFormat);
    scheduleAt(
      alertMs,
      `${minutesBefore} Minute Call`,
      `Show starts in ${minutesBefore} minutes (${timeStr})`
    );
  }

  // Beginners call — 5 min before start
  const beginnersMs = startMs - 5 * 60_000;
  scheduleAt(beginnersMs, 'Beginners Call', 'Beginners to the stage, please!');
}

export function scheduleIntervalNotification(
  segment: Segment,
  settings: AppSettings,
  timeFormat: TimeFormat
) {
  if (!settings.intervalWarningEnabled) return;
  if (!segment.actualStart || !segment.expectedDurationMinutes) return;

  const startMs = new Date(segment.actualStart).getTime();
  const endMs = startMs + segment.expectedDurationMinutes * 60_000;
  const warnMs = endMs - settings.intervalWarningMinutes * 60_000;
  const backAtStr = formatTime(new Date(endMs), timeFormat);

  scheduleAt(
    warnMs,
    `${settings.intervalWarningMinutes} Minute Warning`,
    `${segment.label} ends in ${settings.intervalWarningMinutes} min — Back at ${backAtStr}`
  );
  scheduleAt(endMs, 'Interval Over', `Time to start the next act! (Back at ${backAtStr})`);
}

let preShowTimeouts: ReturnType<typeof setTimeout>[] = [];

export function clearPreShowNotifications() {
  preShowTimeouts.forEach(clearTimeout);
  preShowTimeouts = [];
}

export function clearIntervalNotifications() {
  // We share the pool; fine for now
}

export function getIntervalBackAtTime(segment: Segment): Date | null {
  if (!segment.actualStart || !segment.expectedDurationMinutes) return null;
  return new Date(
    new Date(segment.actualStart).getTime() + segment.expectedDurationMinutes * 60_000
  );
}

export { clearAllScheduled };
