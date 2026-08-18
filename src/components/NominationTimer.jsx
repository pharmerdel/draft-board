import { ArrowRight } from 'lucide-react';
import { useNow } from '../hooks/useNow';
import './NominationTimer.css';

// Commissioner-facing timer component with controls
export default function NominationTimer({
  draft,
  onEnable,
  onDisable,
  onChangeDuration,
  onSkip,
}) {
  const timerEnabled    = draft?.timerEnabled || false;
  const timerDuration   = draft?.timerDuration || 90;
  const timerStartedAt  = draft?.timerStartedAt || null;
  const isPaused        = draft?.status === 'paused';
  const isRunning       = timerEnabled && timerStartedAt !== null;
  const now             = useNow(isRunning, 250);

  const secondsLeft = isPaused && draft?.pausedTimerRemainingMs != null
    ? Math.max(0, Math.ceil(draft.pausedTimerRemainingMs / 1000))
    : isRunning
      ? Math.max(0, Math.ceil((timerStartedAt + timerDuration * 1000 - (now || timerStartedAt)) / 1000))
      : null;

  const isExpired  = secondsLeft === 0;
  const isWarning  = secondsLeft !== null && secondsLeft <= 10 && !isExpired;

  return (
    <div className="nom-timer">
      {!timerEnabled ? (
        // Timer off — show activate buttons
        <div className="nom-timer-activate">
          <span className="nom-timer-label">Nom Timer</span>
          <button className="nom-timer-btn" onClick={() => onEnable(90)} disabled={isPaused}>90s</button>
          <button className="nom-timer-btn" onClick={() => onEnable(60)} disabled={isPaused}>60s</button>
        </div>
      ) : (
        // Timer on — show countdown + controls
        <div className="nom-timer-active">
          {/* Countdown display */}
          <div className={`nom-timer-display ${isExpired ? 'expired' : isWarning ? 'warning' : isRunning ? 'running' : 'idle'}`}>
            {secondsLeft !== null
              ? `${secondsLeft}s`
              : `${timerDuration}s`
            }
          </div>

          {/* Duration switcher */}
          <div className="nom-timer-controls">
            <button
              className={`nom-timer-dur-btn ${timerDuration === 90 ? 'active' : ''}`}
              onClick={() => onChangeDuration(90)}
              disabled={isPaused}
            >90s</button>
            <button
              className={`nom-timer-dur-btn ${timerDuration === 60 ? 'active' : ''}`}
              onClick={() => onChangeDuration(60)}
              disabled={isPaused}
            >60s</button>
            <button className="nom-timer-off-btn" onClick={onDisable} disabled={isPaused}>Off</button>
          </div>

          {/* Skip button — only appears when timer has expired */}
          {isExpired && !isPaused && (
            <button className="nom-timer-skip-btn" onClick={onSkip}>
              Skip
              <ArrowRight size={14} strokeWidth={2.4} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
