import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import './NominationTimer.css';

// Commissioner-facing timer component with controls
export default function NominationTimer({
  draft,
  onEnable,
  onDisable,
  onChangeDuration,
  onSkip,
}) {
  const [now, setNow] = useState(Date.now());

  const timerEnabled    = draft?.timerEnabled || false;
  const timerDuration   = draft?.timerDuration || 90;
  const timerStartedAt  = draft?.timerStartedAt || null;
  const isRunning       = timerEnabled && timerStartedAt !== null;

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [isRunning]);

  const secondsLeft = isRunning
    ? Math.max(0, Math.ceil((timerStartedAt + timerDuration * 1000 - now) / 1000))
    : null;

  const isExpired  = secondsLeft === 0;
  const isWarning  = secondsLeft !== null && secondsLeft <= 10 && !isExpired;

  return (
    <div className="nom-timer">
      {!timerEnabled ? (
        // Timer off — show activate buttons
        <div className="nom-timer-activate">
          <span className="nom-timer-label">Nom Timer</span>
          <button className="nom-timer-btn" onClick={() => onEnable(90)}>90s</button>
          <button className="nom-timer-btn" onClick={() => onEnable(60)}>60s</button>
        </div>
      ) : (
        // Timer on — show countdown + controls
        <div className="nom-timer-active">
          {/* Countdown display */}
          <div className={`nom-timer-display ${isExpired ? 'expired' : isWarning ? 'warning' : isRunning ? 'running' : 'idle'}`}>
            {isRunning
              ? `${secondsLeft}s`
              : isExpired
                ? '0s'
                : `${timerDuration}s`
            }
          </div>

          {/* Duration switcher */}
          <div className="nom-timer-controls">
            <button
              className={`nom-timer-dur-btn ${timerDuration === 90 ? 'active' : ''}`}
              onClick={() => onChangeDuration(90)}
            >90s</button>
            <button
              className={`nom-timer-dur-btn ${timerDuration === 60 ? 'active' : ''}`}
              onClick={() => onChangeDuration(60)}
            >60s</button>
            <button className="nom-timer-off-btn" onClick={onDisable}>Off</button>
          </div>

          {/* Skip button — only appears when timer has expired */}
          {isExpired && (
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
