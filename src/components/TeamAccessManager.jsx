import { useState } from 'react';
import { KeyRound, RotateCcw } from 'lucide-react';

import { generateTeamActivationCodes, resetTeamPin } from '../utils/teamAuth';

export default function TeamAccessManager({ teams, teamAccess }) {
  const [codes, setCodes] = useState({});
  const [workingTeamId, setWorkingTeamId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');

  const teamEntries = Object.entries(teams)
    .filter(([, team]) => team?.name)
    .sort((a, b) => (a[1].nominationOrder || 999) - (b[1].nominationOrder || 999));

  async function handleGenerate() {
    setGenerating(true);
    setMessage('');
    try {
      const result = await generateTeamActivationCodes();
      setCodes(Object.fromEntries(result.activationCodes.map(entry => [entry.teamId, entry.activationCode])));
      setMessage(result.activationCodes.length
        ? 'Codes are shown once. Share each code privately with that owner.'
        : 'Every team is already claimed.');
    } catch (error) {
      console.error('Unable to generate activation codes:', error);
      setMessage('Activation codes could not be generated. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleReset(teamId, teamName) {
    if (!window.confirm(`Reset the PIN for ${teamName}? Existing sessions will be revoked and the owner will need a new activation code.`)) return;
    setWorkingTeamId(teamId);
    setMessage('');
    try {
      const result = await resetTeamPin(teamId);
      setCodes(current => ({ ...current, [teamId]: result.activationCode }));
      setMessage(`A new one-time code was created for ${teamName}.`);
    } catch (error) {
      console.error('Unable to reset team PIN:', error);
      setMessage('The PIN reset could not be completed. Try again.');
    } finally {
      setWorkingTeamId(null);
    }
  }

  return (
    <section className="team-access-manager">
      <div className="team-access-manager-header">
        <div>
          <p className="entry-section-title">Team Access</p>
          <p className="entry-section-subtitle">Activation codes and owner PIN resets</p>
        </div>
        <button type="button" onClick={handleGenerate} disabled={generating}>
          <KeyRound size={15} /> {generating ? 'Generating…' : 'Generate missing codes'}
        </button>
      </div>
      {message && <p className="team-access-manager-message">{message}</p>}
      <div className="team-access-manager-list">
        {teamEntries.map(([teamId, team]) => {
          const state = teamAccess[teamId]?.state || 'unclaimed';
          return (
            <div className="team-access-manager-row" key={teamId}>
              <span className="team-access-manager-team">{team.name}</span>
              <span className={`team-access-state ${state}`}>{state.replace('-', ' ')}</span>
              <code>{codes[teamId] || '—'}</code>
              <button
                type="button"
                className="team-access-reset"
                onClick={() => handleReset(teamId, team.name)}
                disabled={workingTeamId === teamId || state === 'unclaimed'}
                title={state === 'unclaimed' ? 'Generate an activation code first' : 'Reset owner PIN'}
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
