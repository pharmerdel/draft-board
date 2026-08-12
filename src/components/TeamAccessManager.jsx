import { useState } from 'react';
import { ref, update } from 'firebase/database';
import { Dices, KeyRound, RotateCcw } from 'lucide-react';

import { db } from '../firebase';
import { generateTeamActivationCodes, resetTeamPin } from '../utils/teamAuth';
import { sortTeamsForDisplay } from '../utils/draftLifecycle';
import { secureShuffle } from '../utils/secureShuffle';

export default function TeamAccessManager({ teams, teamAccess, showNominationRandomizer = true }) {
  const [codes, setCodes] = useState({});
  const [workingTeamId, setWorkingTeamId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [randomizing, setRandomizing] = useState(false);
  const [message, setMessage] = useState('');

  const teamEntries = sortTeamsForDisplay(teams, showNominationRandomizer);

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

  async function handleGenerateTeam(teamId, teamName) {
    setWorkingTeamId(teamId);
    setMessage('');
    try {
      const result = await generateTeamActivationCodes([teamId]);
      const entry = result.activationCodes.find(code => code.teamId === teamId);
      if (!entry) {
        setMessage(`${teamName} already has a PIN. Use Reset if the owner needs a new activation code.`);
        return;
      }
      setCodes(current => ({ ...current, [teamId]: entry.activationCode }));
      setMessage(`A one-time activation code was created for ${teamName}.`);
    } catch (error) {
      console.error('Unable to generate team activation code:', error);
      setMessage(`The activation code for ${teamName} could not be generated. Try again.`);
    } finally {
      setWorkingTeamId(null);
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

  async function handleRandomizeOrder() {
    if (!window.confirm('Randomize the nomination order now? This replaces the current order for every team.')) return;
    setRandomizing(true);
    setMessage('');
    try {
      const randomizedIds = secureShuffle(teamEntries.map(([teamId]) => teamId));
      const updates = {
        'draft/nominationOrderIds': randomizedIds,
        'draft/nominationIndex': 0,
        'draft/nominatingTeamId': randomizedIds[0],
        'draft/nominationOrderRandomizedAt': Date.now(),
      };
      randomizedIds.forEach((teamId, index) => {
        updates[`teams/${teamId}/nominationOrder`] = index + 1;
      });
      await update(ref(db), updates);
      setMessage('Nomination order randomized. The updated order is visible in the Owners list above.');
    } catch (error) {
      console.error('Unable to randomize nomination order:', error);
      setMessage(error.message || 'The nomination order could not be randomized. Try again.');
    } finally {
      setRandomizing(false);
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
      {showNominationRandomizer && (
        <div className="nomination-randomizer">
          <div>
            <span className="nomination-randomizer-title">Draft-day nomination order</span>
            <span className="nomination-randomizer-help">Uses secure browser randomness and creates the official order for every connected screen.</span>
          </div>
          <button type="button" onClick={handleRandomizeOrder} disabled={randomizing}>
            <Dices size={16} /> {randomizing ? 'Randomizing…' : 'Randomize order'}
          </button>
        </div>
      )}
      {message && <p className="team-access-manager-message">{message}</p>}
      <div className="team-access-manager-list">
        {teamEntries.map(([teamId, team]) => {
          const state = teamAccess[teamId]?.state || 'unclaimed';
          return (
            <div className="team-access-manager-row" key={teamId}>
              <span className="team-access-manager-team">{team.name}</span>
              <span className={`team-access-state ${state}`}>{state.replace('-', ' ')}</span>
              <code>{codes[teamId] || '—'}</code>
              {state === 'unclaimed' ? (
                <button
                  type="button"
                  className="team-access-reset team-access-generate"
                  onClick={() => handleGenerateTeam(teamId, team.name)}
                  disabled={workingTeamId === teamId || generating}
                  title={`Generate an activation code for ${team.name}`}
                >
                  <KeyRound size={14} /> {workingTeamId === teamId ? 'Working…' : 'Generate'}
                </button>
              ) : (
                <button
                  type="button"
                  className="team-access-reset"
                  onClick={() => handleReset(teamId, team.name)}
                  disabled={workingTeamId === teamId}
                  title="Reset owner PIN"
                >
                  <RotateCcw size={14} /> {workingTeamId === teamId ? 'Working…' : 'Reset'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
