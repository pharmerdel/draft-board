import { useEffect, useState } from 'react';
import { get, onValue, ref, set, update } from 'firebase/database';
import { db } from '../firebase';
import { DEFAULT_LEAGUE_NAME, DEFAULT_TEAMS } from '../config/leagueDefaults';
import { parseBackupFile } from '../utils/backup';
import { buildDraftPlayers, summarizeDraftPlayers } from '../utils/draftPlayers';
import { buildPreseasonDraft } from '../utils/draftLifecycle';
import './SetupScreen.css';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE'];

export default function SetupScreen() {
  const [leagueName, setLeagueName] = useState(DEFAULT_LEAGUE_NAME);
  const [teams, setTeams] = useState(() => DEFAULT_TEAMS.map(team => ({ ...team })));
  const [catalogPlayers, setCatalogPlayers] = useState(null);
  const [catalogMetadata, setCatalogMetadata] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');
  const [errors, setErrors] = useState([]);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const catalogSummary = summarizeDraftPlayers(catalogPlayers);

  useEffect(() => {
    const unsubscribeCatalog = onValue(
      ref(db, 'playerCatalog'),
      snapshot => {
        const activePlayers = buildDraftPlayers(snapshot.val() || {});
        if (Object.keys(activePlayers).length === 0) {
          setCatalogPlayers(null);
          setCatalogError('No active players are available in the shared catalog.');
        } else {
          setCatalogPlayers(activePlayers);
          setCatalogError('');
        }
        setCatalogLoading(false);
      },
      error => {
        console.error('Failed to load player catalog:', error);
        setCatalogPlayers(null);
        setCatalogMetadata(null);
        setCatalogError(error.message || 'The shared player catalog could not be loaded.');
        setCatalogLoading(false);
      },
    );
    const unsubscribeMetadata = onValue(
      ref(db, 'catalogMetadata'),
      snapshot => setCatalogMetadata(snapshot.val() || null),
      error => console.warn('Failed to load catalog metadata:', error),
    );
    return () => {
      unsubscribeCatalog();
      unsubscribeMetadata();
    };
  }, [catalogReloadKey]);

  function retryCatalog() {
    setCatalogLoading(true);
    setCatalogError('');
    setCatalogReloadKey(current => current + 1);
  }

  function updateTeam(index, field, value) {
    setTeams(previous => previous.map((team, teamIndex) => (
      teamIndex === index ? { ...team, [field]: value } : team
    )));
  }

  function validate() {
    const validationErrors = [];
    if (!leagueName.trim()) validationErrors.push('League name is required.');
    if (!catalogPlayers || catalogSummary.count === 0) {
      validationErrors.push('The shared player catalog must be loaded before launching the draft.');
    }

    teams.forEach((team, index) => {
      if (!team.teamName.trim()) validationErrors.push(`Team ${index + 1}: Team name is required.`);
      if (!team.ownerName.trim()) validationErrors.push(`Team ${index + 1}: Owner name is required.`);
    });
    return validationErrors;
  }

  async function handleLaunch() {
    const validationErrors = validate();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setSavingStatus('Preparing player catalog...');
    setErrors([]);

    try {
      // Re-read immediately before launch so setup always uses the latest catalog.
      const [catalogSnapshot, metadataSnapshot] = await Promise.all([
        get(ref(db, 'playerCatalog')),
        get(ref(db, 'catalogMetadata')),
      ]);
      const playersData = buildDraftPlayers(catalogSnapshot.val() || {});
      const latestCatalogMetadata = metadataSnapshot.val() || catalogMetadata;
      if (Object.keys(playersData).length === 0) {
        throw new Error('No active players are available in the shared catalog.');
      }

      const teamsData = {};
      teams.forEach((team, index) => {
        teamsData[`team_${index + 1}`] = {
          name: team.teamName.trim(),
          ownerName: team.ownerName.trim(),
          budgetRemaining: 200,
          connected: false,
          lastSeen: null,
          roster: {},
        };
      });

      setSavingStatus('Creating preseason workspace...');
      await update(ref(db), {
        players: playersData,
        teams: teamsData,
        draft: buildPreseasonDraft({ leagueName, catalogMetadata: latestCatalogMetadata }),
        log: null,
      });
    } catch (error) {
      console.error(error);
      setErrors([error.message || 'Failed to save to Firebase. Check your connection and try again.']);
      setSaving(false);
      setSavingStatus('');
    }
  }

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <h1>🏈 FF Auction Draft Board</h1>
        <p className="setup-subtitle">Commissioner Setup</p>
      </div>

      {errors.length > 0 && (
        <div className="setup-errors">
          {errors.map((error, index) => <p key={index}>⚠️ {error}</p>)}
        </div>
      )}

      <div className="setup-section">
        <label className="setup-label" htmlFor="league-name">League Name</label>
        <input
          id="league-name"
          className="setup-input"
          type="text"
          placeholder="e.g. The League"
          value={leagueName}
          onChange={event => setLeagueName(event.target.value)}
        />
      </div>

      <div className="setup-section">
        <span className="setup-label">Shared Player Catalog</span>
        <div className={`catalog-status ${catalogError ? 'catalog-status-error' : ''}`}>
          {catalogLoading && <span>Loading the preseason player database...</span>}
          {!catalogLoading && catalogPlayers && (
            <>
              <span className="catalog-status-count">✓ {catalogSummary.count} active players ready</span>
              <span className="catalog-status-breakdown">
                {Object.entries(catalogSummary.positions)
                  .sort((left, right) => POSITION_ORDER.indexOf(left[0]) - POSITION_ORDER.indexOf(right[0]))
                  .map(([position, count]) => `${count} ${position}`)
                  .join(' · ')}
              </span>
              {catalogMetadata?.sourceFileName && (
                <span className="catalog-status-source">Source: {catalogMetadata.sourceFileName}</span>
              )}
            </>
          )}
          {!catalogLoading && catalogError && (
            <>
              <span>{catalogError}</span>
              <button type="button" className="catalog-retry-btn" onClick={retryCatalog}>Retry</button>
            </>
          )}
        </div>
        <p className="setup-field-hint">Rankings are loaded automatically from the established preseason catalog.</p>
      </div>

      <div className="setup-section">
        <div className="setup-teams-heading">
          <div>
            <span className="setup-label">League Teams</span>
            <p className="setup-field-hint">Nomination order will be created in the pre-draft lobby on draft day.</p>
          </div>
        </div>
        <div className="teams-grid-header">
          <span>#</span><span>Team Name</span><span>Owner Name</span>
        </div>

        {teams.map((team, index) => (
          <div key={index} className="team-row">
            <span className="team-num">{index + 1}</span>
            <input className="setup-input" type="text" placeholder="Team name" value={team.teamName} onChange={event => updateTeam(index, 'teamName', event.target.value)} />
            <input className="setup-input" type="text" placeholder="Owner name" value={team.ownerName} onChange={event => updateTeam(index, 'ownerName', event.target.value)} />
          </div>
        ))}
      </div>

      <div className="setup-launch">
        <button className="launch-btn" onClick={handleLaunch} disabled={saving || catalogLoading || !catalogPlayers}>
          {saving ? (savingStatus || 'Opening...') : 'Open Preseason Workspace'}
        </button>
        <p className="launch-hint">This saves league data and opens private owner preparation. Draft-day order remains unset.</p>
      </div>

      <div className="restore-section">
        <div className="restore-header">
          <span className="restore-title">🔄 Restore from Backup</span>
          <span className="restore-subtitle">Use this if the draft lost its data mid-way. Upload the backup JSON file downloaded from the commissioner screen to pick up exactly where you left off.</span>
        </div>

        {restoreSuccess ? (
          <p className="restore-success">✓ Draft restored. Everyone can rejoin at the same URL.</p>
        ) : (
          <>
            <input
              id="restore-upload"
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={async event => {
                const file = event.target.files[0];
                if (!file) return;
                setRestoring(true);
                setErrors([]);
                try {
                  const snapshot = await parseBackupFile(file);
                  await set(ref(db, 'draft'), snapshot.draft);
                  await set(ref(db, 'teams'), snapshot.teams);
                  await set(ref(db, 'players'), snapshot.players);
                  await set(ref(db, 'log'), snapshot.log || null);
                  setRestoreSuccess(true);
                } catch (error) {
                  setErrors([`Restore failed: ${error.message}`]);
                } finally {
                  setRestoring(false);
                }
              }}
            />
            <label htmlFor="restore-upload" className="restore-btn">{restoring ? 'Restoring...' : '📂 Upload backup JSON'}</label>
          </>
        )}
      </div>
    </div>
  );
}
