import { useEffect, useState } from 'react';
import { MonitorUp, X } from 'lucide-react';

import { authenticateCommissioner } from '../utils/teamAuth';

export default function CommissionerAccessModal({ accessState = 'unclaimed', onClose, onAuthenticated }) {
  const activating = accessState === 'unclaimed';
  const [setupCode, setSetupCode] = useState('');
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
      const role = await authenticateCommissioner({ accessState, setupCode, pin });
      onAuthenticated(role);
    } catch (authError) {
      console.error('Commissioner authentication failed:', authError);
      setError('We could not verify commissioner access. Check the information and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="team-access-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section className="team-access-modal" role="dialog" aria-modal="true" aria-labelledby="commissioner-access-title">
        <button className="team-access-close" type="button" onClick={onClose} disabled={submitting} aria-label="Close">
          <X size={19} />
        </button>
        <span className="team-access-icon commissioner"><MonitorUp size={22} /></span>
        <p className="team-access-kicker">{activating ? 'Set up commissioner access' : 'Commissioner login'}</p>
        <h2 id="commissioner-access-title">Commissioner Board</h2>

        <form onSubmit={handleSubmit}>
          {activating && (
            <label className="team-access-field">
              <span>One-time setup code</span>
              <input
                autoFocus
                autoComplete="one-time-code"
                value={setupCode}
                onChange={event => setSetupCode(event.target.value.toUpperCase())}
                placeholder="Enter commissioner code"
                required
              />
            </label>
          )}
          <label className="team-access-field">
            <span>{activating ? 'Choose a commissioner PIN' : 'Commissioner PIN'}</span>
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
            {submitting ? 'Verifying…' : (activating ? 'Secure commissioner access' : 'Open commissioner board')}
          </button>
        </form>
      </section>
    </div>
  );
}
