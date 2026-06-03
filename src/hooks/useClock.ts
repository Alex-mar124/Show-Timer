import { useState, useEffect } from 'react';

export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());

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

  return now;
}
