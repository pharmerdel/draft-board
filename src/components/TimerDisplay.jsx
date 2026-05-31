import { useState, useEffect } from 'react';

// Read-only timer shown on participant screens
export default function TimerDisplay({ draft }) {
  const [now, setNow] = useState(Date.now());

  const timerEnabled   = draft?.timerEnabled || false;
  const timerDuration  = draft?.timerDuration || 90;
  const timerStartedAt = draft?.timerStartedAt || null;
  const isRunning      = timerEnabled && timerStartedAt !== null;

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [isRunning]);

  if (!timerEnabled) return null;

  const secondsLeft = isRunning
    ? Math.max(0, Math.ceil((timerStartedAt + timerDuration * 1000 - now) / 1000))
    : null;

  const isExpired = secondsLeft === 0;
  const isWarning = secondsLeft !== null && secondsLeft <= 10 && !isExpired;

  const color = isExpired ? '#f87171' : isWarning ? '#f87171' : '#fbbf24';
  const text  = isRunning ? `${secondsLeft}s` : `${timerDuration}s`;

  return (
    <span style={{
      fontSize: '0.9rem',
      fontWeight: 800,
      color,
      fontVariantNumeric: 'tabular-nums',
      animation: (isWarning || isExpired) ? 'timerPulse 0.5s ease-in-out infinite alternate' : 'none',
      minWidth: '36px',
      textAlign: 'center',
    }}>
      ⏱ {text}
    </span>
  );
}
