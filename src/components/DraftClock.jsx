import { useState, useEffect } from 'react';

// Shows time-of-day the draft started and running elapsed time
export default function DraftClock({ startedAt }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!startedAt) return null;

  const startTime = new Date(startedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const elapsed = Math.floor((now - startedAt) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const elapsedStr = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
      <span style={{ fontSize: '0.62rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Started {startTime}
      </span>
      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#aaa', fontVariantNumeric: 'tabular-nums' }}>
        {elapsedStr}
      </span>
    </div>
  );
}
