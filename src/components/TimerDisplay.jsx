import { useNow } from '../hooks/useNow';

// Read-only timer shown on participant screens
export default function TimerDisplay({ draft }) {
  const timerEnabled   = draft?.timerEnabled || false;
  const timerDuration  = draft?.timerDuration || 90;
  const timerStartedAt = draft?.timerStartedAt || null;
  const isPaused       = draft?.status === 'paused';
  const isRunning      = timerEnabled && timerStartedAt !== null;
  const now            = useNow(isRunning, 250);

  if (!timerEnabled) return null;

  const secondsLeft = isPaused && draft?.pausedTimerRemainingMs != null
    ? Math.max(0, Math.ceil(draft.pausedTimerRemainingMs / 1000))
    : isRunning
      ? Math.max(0, Math.ceil((timerStartedAt + timerDuration * 1000 - (now || timerStartedAt)) / 1000))
      : null;

  const isExpired = secondsLeft === 0;
  const isWarning = secondsLeft !== null && secondsLeft <= 10 && !isExpired;

  const color = isExpired ? '#f87171' : isWarning ? '#f87171' : '#fbbf24';
  const text  = secondsLeft !== null ? `${secondsLeft}s` : `${timerDuration}s`;

  return (
    <span style={{
      fontSize: '0.9rem',
      fontWeight: 800,
      color,
      fontVariantNumeric: 'tabular-nums',
      animation: !isPaused && (isWarning || isExpired) ? 'timerPulse 0.5s ease-in-out infinite alternate' : 'none',
      minWidth: '36px',
      textAlign: 'center',
    }}>
      {isPaused ? '⏸' : '⏱'} {text}
    </span>
  );
}
