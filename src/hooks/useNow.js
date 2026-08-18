import { useEffect, useState } from 'react';

export function useNow(active = true, intervalMs = 1000) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!active) return undefined;

    const tick = () => setNow(Date.now());
    const initialTimer = setTimeout(tick, 0);
    const interval = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [active, intervalMs]);

  return now;
}
