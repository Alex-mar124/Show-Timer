import type { Show } from '../types';

/**
 * Compute the expected start time for every segment based on:
 *
 *  Anchors (highest priority first):
 *   1. seg.plannedStart   — user-pinned time on the segment, always wins
 *   2. pre_show           — works backwards: doorsOpenTime − expectedDuration
 *   3. doors segment      — anchored to show.doorsOpenTime when unstarted
 *   4. everything else    — pure cascade from prevExpectedEnd
 *
 *  Note: show.plannedStartTime is a report/display field only. It is NOT used
 *  as a cascade anchor so that estimates update dynamically as timing drifts.
 *  To pin Act 1 to a fixed curtain time, set seg.plannedStart on that segment.
 *
 *  Cascade source (after each segment):
 *   - actualEnd if complete
 *   - plannedEnd if pinned and not yet started
 *   - max(actualStart + expectedDuration + holdTime, now) when active → drifts live
 *   - expectedStart + expectedDuration when pending
 *   - performance_start is zero-duration: passes prevExpectedEnd through unchanged
 *
 * `now` is passed in so the active-segment branch updates every clock tick.
 */
export function computeExpectedStarts(show: Show, now: Date = new Date()): Map<string, Date | null> {
  const sorted = [...show.segments].sort((a, b) => a.order - b.order);
  const result  = new Map<string, Date | null>();

  let prevExpectedEnd: Date | null = null;

  function timeOnDate(hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number);
    const [y, mo, d] = show.date.split('-').map(Number);
    return new Date(y, mo - 1, d, h, m, 0, 0);
  }

  const doorsMs = show.doorsOpenTime ? new Date(show.doorsOpenTime).getTime() : null;

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    let expectedStart: Date | null = null;

    // ── Choose expectedStart ───────────────────────────────────────────────────
    if (seg.plannedStart) {
      // 1. Explicit user-pinned start on segment — always wins
      expectedStart = timeOnDate(seg.plannedStart);

    } else if (seg.type === 'pre_show' && doorsMs && seg.expectedDurationMinutes && !seg.actualStart) {
      // 2. Unstarted pre_show: anchor backwards from doors time so it shows
      //    the right call-time without distorting the Doors expected-start.
      expectedStart = new Date(doorsMs - seg.expectedDurationMinutes * 60_000);

    } else if (seg.type === 'doors' && doorsMs && !seg.actualStart) {
      // 3. Unstarted doors segment: pin to configured doors time.
      expectedStart = new Date(doorsMs);

    } else {
      // 4. Pure cascade — no further anchors.
      expectedStart = prevExpectedEnd;
    }

    result.set(seg.id, expectedStart);

    // ── Compute prevExpectedEnd for the next iteration ─────────────────────────
    if (seg.type === 'show_end') {
      prevExpectedEnd = seg.actualStart ? new Date(seg.actualStart) : expectedStart;

    } else if (seg.type === 'performance_start') {
      // Zero-duration label — passes cascade through unchanged when pending,
      // uses its stamp time when complete.
      if (seg.actualStart) prevExpectedEnd = new Date(seg.actualStart);
      // else: leave prevExpectedEnd as-is

    } else if (seg.type === 'changeover') {
      // Auto-derive end from surrounding segments rather than using a fixed duration.
      if (seg.actualEnd) {
        prevExpectedEnd = new Date(seg.actualEnd);
      } else if (seg.actualStart) {
        // Active: check whether the next performance has already started (e.g. advance was called)
        const nextReal = sorted.slice(i + 1).find(s => s.type !== 'performance_start');
        if (nextReal?.actualStart) {
          prevExpectedEnd = new Date(nextReal.actualStart);
        } else {
          const totalHoldMs = seg.holds.reduce((acc, h) => {
            const hs = new Date(h.startTime).getTime();
            const he = h.endTime ? new Date(h.endTime).getTime() : now.getTime();
            return acc + (he - hs);
          }, 0);
          const expectedEndMs = new Date(seg.actualStart).getTime() + (seg.expectedDurationMinutes ?? 60) * 60_000 + totalHoldMs;
          prevExpectedEnd = new Date(Math.max(expectedEndMs, now.getTime()));
        }
      } else {
        // Pending: if the next performance has a pinned curtain time, anchor to that
        // so the estimated changeover length auto-derives from the surrounding schedule.
        const nextReal = sorted.slice(i + 1).find(s => s.type !== 'performance_start');
        if (nextReal?.plannedStart) {
          prevExpectedEnd = timeOnDate(nextReal.plannedStart);
        } else if (expectedStart && seg.expectedDurationMinutes) {
          prevExpectedEnd = new Date(expectedStart.getTime() + seg.expectedDurationMinutes * 60_000);
        } else {
          prevExpectedEnd = null;
        }
      }

    } else if (seg.actualEnd) {
      prevExpectedEnd = new Date(seg.actualEnd);

    } else if (seg.plannedEnd && !seg.actualStart) {
      prevExpectedEnd = timeOnDate(seg.plannedEnd);

    } else if (seg.actualStart && seg.expectedDurationMinutes) {
      // Active segment — accumulate hold time (open holds use now as their end)
      const totalHoldMs = seg.holds.reduce((acc, h) => {
        const hs = new Date(h.startTime).getTime();
        const he = h.endTime ? new Date(h.endTime).getTime() : now.getTime();
        return acc + (he - hs);
      }, 0);
      const expectedEndMs =
        new Date(seg.actualStart).getTime() + seg.expectedDurationMinutes * 60_000 + totalHoldMs;
      // If running over, cascade from NOW so downstream times drift in real time
      prevExpectedEnd = new Date(Math.max(expectedEndMs, now.getTime()));

    } else if (expectedStart && seg.expectedDurationMinutes) {
      prevExpectedEnd = new Date(expectedStart.getTime() + seg.expectedDurationMinutes * 60_000);

    } else {
      prevExpectedEnd = null;
    }
  }

  return result;
}
