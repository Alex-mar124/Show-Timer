import { useState, useEffect } from 'react';
import { useShowStore } from '../store';

export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  const offset = useShowStore(s => s.devClockOffsetMs);

  useEffect(() => {
    const tick = () => setNow(new Date());
    let intervalId: ReturnType<typeof setInterval>;
    // align to the next second boundary for smooth ticking
    const delay = 1000 - (Date.now() % 1000);
    const alignTimer = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 1000);
    }, delay);
    return () => {
      clearTimeout(alignTimer);
      clearInterval(intervalId);
    };
  }, []);

  // Apply the dev clock offset (0 in normal use) so dev-mode time-travel
  // affects every elapsed/expected calculation that reads the clock.
  return offset ? new Date(now.getTime() + offset) : now;
}
