import type { Show, Segment } from '../types';

/**
 * Compute the expected start time for every segment based on:
 *  - show.doorsOpenTime   → anchor for the first (doors) segment
 *  - show.plannedStartTime → anchor for the first 'act' segment (Act 1)
 *  - each segment's actualEnd (if finished) as the anchor for the next
 *  - each segment's expectedDurationMinutes to cascade forward when not yet finished
 *
 * Returns a Map<segmentId, Date | null>.
 */
export function computeExpectedStarts(show: Show): Map<string, Date | null> {
  const sorted = [...show.segments].sort((a, b) => a.order - b.order);
  const result = new Map<string, Date | null>();

  let prevExpectedEnd: Date | null = null;

  // Helper: convert "HH:MM" on show date to a local Date
  function timeOnDate(hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number);
    const [y, mo, d] = show.date.split('-').map(Number);
    return new Date(y, mo - 1, d, h, m, 0, 0);
  }

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    let expectedStart: Date | null = null;

    // User-set planned start overrides all cascade logic
    if (seg.plannedStart) {
      expectedStart = timeOnDate(seg.plannedStart);
    } else if (i === 0 && show.doorsOpenTime) {
      // First segment: use doors open time if provided
      expectedStart = new Date(show.doorsOpenTime);
    } else if (i === 0 && prevExpectedEnd) {
      expectedStart = prevExpectedEnd;
    } else {
      // Find the first 'act' segment to anchor to plannedStartTime
      const isFirstAct = seg.type === 'act' && !sorted.slice(0, i).some(s => s.type === 'act');
      if (isFirstAct && show.plannedStartTime) {
        // Check if the preceding segment(s) have finished — if so, use actual cascade;
        // if not, prefer the planned start time as anchor
        const allPrevComplete = sorted.slice(0, i).every(s => s.actualEnd);
        if (!allPrevComplete) {
          expectedStart = new Date(show.plannedStartTime);
        } else {
          expectedStart = prevExpectedEnd;
        }
      } else {
        expectedStart = prevExpectedEnd;
      }
    }

    result.set(seg.id, expectedStart);

    // Calculate the expected END of this segment to feed the next iteration
    if (seg.type === 'show_end') {
      prevExpectedEnd = seg.actualStart ? new Date(seg.actualStart) : expectedStart;
    } else if (seg.actualEnd) {
      prevExpectedEnd = new Date(seg.actualEnd);
    } else if (seg.plannedEnd && !seg.actualStart) {
      // User-set planned end — use as cascade anchor when segment hasn't started yet
      prevExpectedEnd = timeOnDate(seg.plannedEnd);
    } else if (seg.actualStart && seg.expectedDurationMinutes) {
      prevExpectedEnd = new Date(
        new Date(seg.actualStart).getTime() + seg.expectedDurationMinutes * 60_000
      );
    } else if (expectedStart && seg.expectedDurationMinutes) {
      prevExpectedEnd = new Date(
        expectedStart.getTime() + seg.expectedDurationMinutes * 60_000
      );
    } else {
      prevExpectedEnd = null;
    }
  }

  return result;
}
