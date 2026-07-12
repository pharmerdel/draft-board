import { Moon, Sun } from 'lucide-react';
import './ThemeToggle.css';

export default function ThemeToggle({ theme, onToggle, className = '' }) {
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle ${isDark ? 'dark' : 'light'} ${className}`}
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? <Sun size={15} strokeWidth={2.3} /> : <Moon size={15} strokeWidth={2.3} />}
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
