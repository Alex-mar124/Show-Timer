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

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    let expectedStart: Date | null = null;

    if (i === 0 && show.doorsOpenTime) {
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
      // show_end has no duration, just mark as null
      prevExpectedEnd = seg.actualStart ? new Date(seg.actualStart) : expectedStart;
    } else if (seg.actualEnd) {
      // Segment finished — actual end is our most accurate anchor
      prevExpectedEnd = new Date(seg.actualEnd);
    } else if (seg.actualStart && seg.expectedDurationMinutes) {
      // Currently running — expected end = actual start + expected duration
      prevExpectedEnd = new Date(
        new Date(seg.actualStart).getTime() + seg.expectedDurationMinutes * 60_000
      );
    } else if (expectedStart && seg.expectedDurationMinutes) {
      // Not started — cascade expected start + expected duration
      prevExpectedEnd = new Date(
        expectedStart.getTime() + seg.expectedDurationMinutes * 60_000
      );
    } else {
      prevExpectedEnd = null;
    }
  }

  return result;
}
