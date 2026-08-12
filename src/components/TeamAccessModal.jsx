import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';

import { authenticateTeam } from '../utils/teamAuth';

const GENERIC_ERROR = 'We could not verify that team. Check the information and try again.';

export default function TeamAccessModal({ teamId, team, accessState = 'unclaimed', onClose, onAuthenticated }) {
  const activating = accessState === 'unclaimed' || accessState === 'reset-required';
  const [activationCode, setActivationCode] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!/^\d{4,8}$/.test(pin)) {
      setError('Choose a PIN containing 4 to 8 digits.');
      return;
    }
    if (activating && pin !== confirmPin) {
      setError('The PINs do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const authenticatedTeamId = await authenticateTeam({
        teamId,
        accessState,
        activationCode,
        pin,
      });
      onAuthenticated(authenticatedTeamId);
    } catch (authError) {
      console.error('Team authentication failed:', authError);
      setError(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="team-access-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section className="team-access-modal" role="dialog" aria-modal="true" aria-labelledby="team-access-title">
        <button className="team-access-close" type="button" onClick={onClose} disabled={submitting} aria-label="Close">
          <X size={19} />
        </button>
        <span className="team-access-icon"><KeyRound size={22} /></span>
        <p className="team-access-kicker">{activating ? 'Activate team access' : 'Owner login'}</p>
        <h2 id="team-access-title">{team?.name || teamId}</h2>
        <p className="team-access-owner">{team?.ownerName}</p>

        <form onSubmit={handleSubmit}>
          {activating && (
            <label className="team-access-field">
              <span>Activation code</span>
              <input
                autoFocus
                autoComplete="one-time-code"
                value={activationCode}
                onChange={event => setActivationCode(event.target.value.toUpperCase())}
                placeholder="Enter your team code"
                required
              />
            </label>
          )}
          <label className="team-access-field">
            <span>{activating ? 'Choose a PIN' : 'Team PIN'}</span>
            <input
              autoFocus={!activating}
              autoComplete={activating ? 'new-password' : 'current-password'}
              inputMode="numeric"
              pattern="[0-9]{4,8}"
              maxLength={8}
              value={pin}
              onChange={event => setPin(event.target.value.replace(/\D/g, ''))}
              placeholder="4–8 digits"
              type="password"
              required
            />
          </label>
          {activating && (
            <label className="team-access-field">
              <span>Confirm PIN</span>
              <input
                autoComplete="new-password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                maxLength={8}
                value={confirmPin}
                onChange={event => setConfirmPin(event.target.value.replace(/\D/g, ''))}
                placeholder="Enter the PIN again"
                type="password"
                required
              />
            </label>
          )}
          {error && <p className="team-access-error" role="alert">{error}</p>}
          <button className="team-access-submit" type="submit" disabled={submitting}>
            {submitting ? 'Verifying…' : (activating ? 'Activate this team' : 'Open my team')}
          </button>
        </form>
        <p className="team-access-help">
          {activating
            ? 'Your activation code works once. After that, use your PIN on any device.'
            : 'Use the PIN chosen when this team was activated.'}
        </p>
      </section>
    </div>
  );
}
