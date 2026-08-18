import { useNow } from '../hooks/useNow';
import './DraftClock.css';

// Shows time-of-day the draft started and running elapsed time
export default function DraftClock({ startedAt }) {
  const now = useNow(Boolean(startedAt));

  if (!startedAt) return null;

  const startTime = new Date(startedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const elapsed = Math.max(0, Math.floor(((now || startedAt) - startedAt) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const elapsedStr = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;

  return (
    <div className="draft-clock">
      <span className="draft-clock-label">Started {startTime}</span>
      <span className="draft-clock-value">{elapsedStr}</span>
    </div>
  );
}
