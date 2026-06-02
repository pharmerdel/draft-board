import { useState } from 'react';
import { ref, set } from 'firebase/database';
import { db } from '../firebase';
import { parseFantasyProsCsv } from '../utils/csvParser';
import { parseBackupFile } from '../utils/backup';
import { enrichPlayersWithHeadshots } from '../utils/sleeperApi';
import './SetupScreen.css';

const TEAM_COUNT = 12;
const emptyTeam = () => ({ teamName: '', ownerName: '', nominationOrder: '' });

export default function SetupScreen() {
  const [leagueName, setLeagueName] = useState('');
  const [teams, setTeams] = useState(Array.from({ length: TEAM_COUNT }, emptyTeam));
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');
  const [errors, setErrors] = useState([]);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const usedOrders = teams.map(t => t.nominationOrder).filter(Boolean);

  function updateTeam(index, field, value) {
    setTeams(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  }

  function handleCsvChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const players = parseFantasyProsCsv(ev.target.result);
        const positions = players.reduce((acc, p) => {
          acc[p.position] = (acc[p.position] || 0) + 1;
          return acc;
        }, {});
        setCsvPreview({ count: players.length, positions });
      } catch (err) {
        setCsvPreview(null);
        setErrors([`CSV parse error: ${err.message}`]);
      }
    };
    reader.readAsText(file);
  }

  function validate() {
    const errs = [];
    if (!leagueName.trim()) errs.push('League name is required.');
    if (!csvFile) errs.push('Please upload a FantasyPros rankings CSV.');

    teams.forEach((t, i) => {
      if (!t.teamName.trim()) errs.push(`Team ${i + 1}: Team name is required.`);
      if (!t.ownerName.trim()) errs.push(`Team ${i + 1}: Owner name is required.`);
      if (!t.nominationOrder) errs.push(`Team ${i + 1}: Nomination order is required.`);
    });

    const orders = teams.map(t => t.nominationOrder).filter(Boolean);
    const dupes = orders.filter((o, i) => orders.indexOf(o) !== i);
    if (dupes.length > 0) {
      errs.push(`Nomination order ${[...new Set(dupes)].join(', ')} is assigned to more than one team.`);
    }

    return errs;
  }

  async function handleLaunch() {
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setErrors([]);

    try {
      // Parse CSV into players object
      const reader = new FileReader();
      const csvText = await new Promise(res => {
        reader.onload = e => res(e.target.result);
        reader.readAsText(csvFile);
      });
      const rawPlayers = parseFantasyProsCsv(csvText);

      // Enrich with Sleeper headshots — makes an API call to sleeper.app
      // Matched players get a headshotUrl; unmatched silently use a silhouette
      const { players: enrichedPlayers, matchCount, total } = await enrichPlayersWithHeadshots(rawPlayers);
      console.log(`Sleeper headshots: ${matchCount}/${total} players matched`);

      const playersData = {};
      enrichedPlayers.forEach((p, i) => {
        playersData[`player_${i + 1}`] = { ...p, status: 'available', soldTo: null, soldPrice: null };
      });

      // Build teams
      const teamsData = {};
      teams.forEach((t, i) => {
        teamsData[`team_${i + 1}`] = {
          name: t.teamName.trim(),
          ownerName: t.ownerName.trim(),
          nominationOrder: parseInt(t.nominationOrder),
          budgetRemaining: 200,
          connected: false,
          lastSeen: null,
          roster: {}
        };
      });

      const nominationOrderIds = Object.entries(teamsData)
        .sort((a, b) => a[1].nominationOrder - b[1].nominationOrder)
        .map(([teamId]) => teamId);

      await set(ref(db, 'players'), playersData);
      await set(ref(db, 'teams'), teamsData);
      await set(ref(db, 'draft'), {
        leagueName: leagueName.trim(),
        status: 'lobby',
        nominationOrderIds,
        nominationIndex: 0,
        currentNomination: null,
        createdAt: Date.now()
      });
      await set(ref(db, 'log'), null);

    } catch (err) {
      console.error(err);
      setErrors(['Failed to save to Firebase. Check your connection and try again.']);
      setSaving(false);
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
          {errors.map((e, i) => <p key={i}>⚠️ {e}</p>)}
        </div>
      )}

      {/* League Name */}
      <div className="setup-section">
        <label className="setup-label" htmlFor="league-name">League Name</label>
        <input
          id="league-name"
          className="setup-input"
          type="text"
          placeholder="e.g. The League"
          value={leagueName}
          onChange={e => setLeagueName(e.target.value)}
        />
      </div>

      {/* CSV Upload */}
      <div className="setup-section">
        <label className="setup-label">FantasyPros Rankings CSV</label>
        <div className="csv-upload-area">
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            onChange={handleCsvChange}
            style={{ display: 'none' }}
          />
          <label htmlFor="csv-upload" className="csv-upload-btn">
            {csvFile ? `📄 ${csvFile.name}` : '📂 Choose CSV file'}
          </label>
          {csvPreview && (
            <div className="csv-preview">
              <span className="csv-preview-count">✓ {csvPreview.count} players loaded</span>
              <span className="csv-preview-breakdown">
                {Object.entries(csvPreview.positions)
                  .sort((a, b) => ['QB','RB','WR','TE'].indexOf(a[0]) - ['QB','RB','WR','TE'].indexOf(b[0]))
                  .map(([pos, count]) => `${count} ${pos}`)
                  .join(' · ')}
              </span>
            </div>
          )}
        </div>
        <p className="setup-field-hint">Download from fantasypros.com → Rankings → Export CSV</p>
      </div>

      {/* Teams */}
      <div className="setup-section">
        <div className="teams-grid-header">
          <span>#</span>
          <span>Team Name</span>
          <span>Owner Name</span>
          <span>Nom. Order</span>
        </div>

        {teams.map((team, i) => (
          <div key={i} className="team-row">
            <span className="team-num">{i + 1}</span>
            <input
              className="setup-input"
              type="text"
              placeholder="Team name"
              value={team.teamName}
              onChange={e => updateTeam(i, 'teamName', e.target.value)}
            />
            <input
              className="setup-input"
              type="text"
              placeholder="Owner name"
              value={team.ownerName}
              onChange={e => updateTeam(i, 'ownerName', e.target.value)}
            />
            <select
              className="setup-select"
              value={team.nominationOrder}
              onChange={e => updateTeam(i, 'nominationOrder', e.target.value)}
            >
              <option value="">—</option>
              {Array.from({ length: TEAM_COUNT }, (_, n) => n + 1).map(n => (
                <option
                  key={n}
                  value={n}
                  disabled={usedOrders.includes(String(n)) && team.nominationOrder !== String(n)}
                >
                  {n}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="setup-launch">
        <button className="launch-btn" onClick={handleLaunch} disabled={saving}>
          {saving ? 'Launching...' : '🚀 Launch Draft'}
        </button>
        <p className="launch-hint">This saves all team and player info and moves everyone to the pre-draft lobby.</p>
      </div>

      {/* ── Restore from backup ── */}
      <div className="restore-section">
        <div className="restore-header">
          <span className="restore-title">🔄 Restore from Backup</span>
          <span className="restore-subtitle">
            Use this if the draft lost its data mid-way. Upload the backup JSON file
            downloaded from the commissioner screen to pick up exactly where you left off.
          </span>
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
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                setRestoring(true);
                setErrors([]);
                try {
                  const snapshot = await parseBackupFile(file);
                  await set(ref(db, 'draft'),   snapshot.draft);
                  await set(ref(db, 'teams'),   snapshot.teams);
                  await set(ref(db, 'players'), snapshot.players);
                  await set(ref(db, 'log'),     snapshot.log || null);
                  setRestoreSuccess(true);
                } catch (err) {
                  setErrors([`Restore failed: ${err.message}`]);
                } finally {
                  setRestoring(false);
                }
              }}
            />
            <label htmlFor="restore-upload" className="restore-btn">
              {restoring ? 'Restoring...' : '📂 Upload backup JSON'}
            </label>
          </>
        )}
      </div>
    </div>
  );
}
