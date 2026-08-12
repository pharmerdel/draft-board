import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { grantLeagueAccess } from '../utils/accessGateStorage';
import './AccessGate.css';

const DEFAULT_DEV_PASSWORD = 'draftday';

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export default function AccessGate({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const entered = password.trim();
    if (!entered || checking) return;

    setChecking(true);
    setError('');

    const configuredHash = (import.meta.env.VITE_LEAGUE_PASSWORD_SHA256 || '').trim().toLowerCase();
    const configuredPassword = import.meta.env.VITE_LEAGUE_PASSWORD || (import.meta.env.DEV ? DEFAULT_DEV_PASSWORD : '');

    try {
      if (!configuredHash && !configuredPassword) {
        setError('League password is not configured for this build.');
        return;
      }

      const ok = configuredHash
        ? await sha256(entered) === configuredHash
        : entered === configuredPassword;

      if (!ok) {
        setError('That password did not match.');
        setPassword('');
        return;
      }

      grantLeagueAccess();
      onUnlock();
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="access-gate">
      <form className="access-card" onSubmit={handleSubmit}>
        <span className="access-icon">
          <LockKeyhole size={24} strokeWidth={2.2} />
        </span>
        <p className="access-kicker">Private Draft Room</p>
        <h1>League Access</h1>
        <p className="access-copy">Enter the league password to open the draft board on this device.</p>

        <label className="access-label" htmlFor="league-password">
          Password
        </label>
        <input
          id="league-password"
          className="access-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="access-error">{error}</p>}

        <button className="access-submit" type="submit" disabled={!password.trim() || checking}>
          {checking ? 'Checking...' : 'Unlock Draft Board'}
        </button>
      </form>
    </main>
  );
}
