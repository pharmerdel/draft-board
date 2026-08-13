import badgeSrc from '../assets/rx-degenerates-badge.png';
import './LeagueBadge.css';

export default function LeagueBadge({ className = '', size = 'header' }) {
  return (
    <img
      className={`league-badge league-badge--${size} ${className}`.trim()}
      src={badgeSrc}
      alt="Rx Degenerates"
      decoding="async"
    />
  );
}
