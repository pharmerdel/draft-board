import { useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref, serverTimestamp, set, update } from 'firebase/database';
import { ArrowRight, ClipboardList, Download, LogOut, ShieldCheck, Star, Upload, UsersRound } from 'lucide-react';

import PreseasonPlayerWorkspace from '../components/PreseasonPlayerWorkspace';
import EditableTeamName from '../components/EditableTeamName';
import LeagueBadge from '../components/LeagueBadge';
import TeamAccessManager from '../components/TeamAccessManager';
import { db } from '../firebase';
import { buildDraftDayLobbyUpdates, sortTeamsForDisplay } from '../utils/draftLifecycle';
import { applyPersonalTierUpdates } from '../utils/personalTiers';
import { applyPlayerNoteUpdate, normalizePlayerNote } from '../utils/playerNotes';
import {
  createOwnerPreferencesBackup,
  downloadOwnerPreferencesBackup,
  ownerPreferenceCounts,
  parseOwnerPreferencesBackupFile,
} from '../utils/ownerPreferencesBackup';
import './PreseasonScreen.css';

export default function PreseasonScreen({ selectedTeamId, onTeamClear, themeToggle, preview = false }) {
  const [teams, setTeams] = useState({});
  const [players, setPlayers] = useState({});
  const [teamAccess, setTeamAccess] = useState({});
  const [personalRanks, setPersonalRanks] = useState({});
  const [personalTiers, setPersonalTiers] = useState({});
  const [playerNotes, setPlayerNotes] = useState({});
  const [watchlist, setWatchlist] = useState({});
  const [syncConnected, setSyncConnected] = useState(null);
  const [openingLobby, setOpeningLobby] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [retryAction, setRetryAction] = useState(null);
  const [backupState, setBackupState] = useState({ type: 'idle', message: '' });
  const saveAttempt = useRef(0);
  const backupInputRef = useRef(null);

  const isCommissioner = selectedTeamId === 'commissioner';
  const team = isCommissioner ? null : teams[selectedTeamId];
  const teamEntries = sortTeamsForDisplay(teams);
  const claimedCount = teamEntries.filter(([teamId]) => teamAccess[teamId]?.state === 'claimed').length;
  const currentPreferences = useMemo(() => ({
    personalRanks: Object.fromEntries(Object.entries(personalRanks).filter(([playerId]) => players[playerId])),
    personalTiers: Object.fromEntries(Object.entries(personalTiers).map(([scope, assignments]) => [
      scope,
      Object.fromEntries(Object.entries(assignments || {}).filter(([playerId]) => players[playerId])),
    ]).filter(([, assignments]) => Object.keys(assignments).length)),
    playerNotes: Object.fromEntries(Object.entries(playerNotes).filter(([playerId]) => players[playerId])),
    watchlists: Object.fromEntries(Object.entries(watchlist).filter(([playerId]) => players[playerId])),
  }), [personalRanks, personalTiers, playerNotes, players, watchlist]);
  const preferenceCounts = ownerPreferenceCounts(currentPreferences);

  useEffect(() => {
    const unsubscribers = [
      onValue(ref(db, 'teams'), snapshot => setTeams(snapshot.val() || {})),
      onValue(ref(db, 'players'), snapshot => setPlayers(snapshot.val() || {})),
      onValue(ref(db, 'teamAccess'), snapshot => setTeamAccess(snapshot.val() || {})),
      onValue(ref(db, '.info/connected'), snapshot => setSyncConnected(snapshot.val() === true)),
    ];
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, []);

  useEffect(() => {
    if (preview || isCommissioner || !selectedTeamId) return undefined;
    const unsubscribers = [
      onValue(ref(db, `personalRanks/${selectedTeamId}`), snapshot => setPersonalRanks(snapshot.val() || {})),
      onValue(ref(db, `personalTiers/${selectedTeamId}`), snapshot => setPersonalTiers(snapshot.val() || {})),
      onValue(ref(db, `playerNotes/${selectedTeamId}`), snapshot => setPlayerNotes(snapshot.val() || {})),
      onValue(ref(db, `watchlists/${selectedTeamId}`), snapshot => setWatchlist(snapshot.val() || {})),
    ];
    update(ref(db, `teams/${selectedTeamId}`), { connected: true, lastSeen: serverTimestamp() });
    const markDisconnected = () => update(ref(db, `teams/${selectedTeamId}`), { connected: false });
    window.addEventListener('beforeunload', markDisconnected);
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
      window.removeEventListener('beforeunload', markDisconnected);
      markDisconnected();
    };
  }, [isCommissioner, preview, selectedTeamId]);

  async function openDraftDayLobby() {
    if (!window.confirm('Open the pre-draft lobby? Nomination order will remain unset until you randomize it there.')) return;
    setOpeningLobby(true);
    try {
      await update(ref(db), buildDraftDayLobbyUpdates(teams));
    } finally {
      setOpeningLobby(false);
    }
  }

  async function savePreference(action) {
    const attempt = ++saveAttempt.current;
    setSaveState('saving');
    setSaveError('');
    try {
      await action();
      if (attempt !== saveAttempt.current) return;
      setSavedAt(new Date());
      setSaveState('saved');
      setRetryAction(null);
    } catch (error) {
      console.error('Unable to save owner preference:', error);
      if (attempt !== saveAttempt.current) return;
      setSaveState('error');
      setSaveError('That change did not save. Your previous preferences are still safe.');
      setRetryAction(() => action);
    }
  }

  function savePersonalRanks(ranks, tierUpdates = null) {
    if (!selectedTeamId || isCommissioner) return;
    if (preview) {
      setPersonalRanks(ranks);
      if (tierUpdates) {
        setPersonalTiers(current => applyPersonalTierUpdates(current, tierUpdates));
      }
      setSavedAt(new Date());
      setSaveState('saved');
      return;
    }
    if (tierUpdates) {
      const combinedUpdates = {};
      Object.entries(ranks).forEach(([playerId, rank]) => {
        combinedUpdates[`personalRanks/${selectedTeamId}/${playerId}`] = rank;
      });
      Object.entries(tierUpdates).forEach(([path, tier]) => {
        combinedUpdates[`personalTiers/${selectedTeamId}/${path}`] = tier;
      });
      return savePreference(() => update(ref(db), combinedUpdates));
    }
    return savePreference(() => update(ref(db, `personalRanks/${selectedTeamId}`), ranks));
  }

  function savePersonalTiers(updates) {
    if (!selectedTeamId || isCommissioner || !updates) return;
    if (preview) {
      setPersonalTiers(current => applyPersonalTierUpdates(current, updates));
      setSavedAt(new Date());
      setSaveState('saved');
      return;
    }
    return savePreference(() => update(ref(db, `personalTiers/${selectedTeamId}`), updates));
  }

  function savePlayerNote(playerId, text) {
    if (!selectedTeamId || isCommissioner || !playerId) return;
    const normalized = normalizePlayerNote(text);
    if (preview) {
      setPlayerNotes(current => applyPlayerNoteUpdate(current, playerId, normalized));
      setSavedAt(new Date());
      setSaveState('saved');
      return;
    }
    const noteRef = ref(db, `playerNotes/${selectedTeamId}/${playerId}`);
    return savePreference(() => normalized
      ? set(noteRef, { text: normalized, updatedAt: serverTimestamp() })
      : set(noteRef, null));
  }

  function importPreferences(ranks, notes = null) {
    if (!selectedTeamId || isCommissioner) return;
    if (preview) {
      setPersonalRanks(ranks);
      if (notes) {
        setPlayerNotes(current => Object.entries(notes).reduce(
          (next, [playerId, text]) => applyPlayerNoteUpdate(next, playerId, text),
          current,
        ));
      }
      setSavedAt(new Date());
      setSaveState('saved');
      return;
    }

    const combinedUpdates = { [`personalRanks/${selectedTeamId}`]: ranks };
    Object.entries(notes || {}).forEach(([playerId, text]) => {
      combinedUpdates[`playerNotes/${selectedTeamId}/${playerId}`] = {
        text: normalizePlayerNote(text),
        updatedAt: serverTimestamp(),
      };
    });
    return savePreference(() => update(ref(db), combinedUpdates));
  }

  function toggleWatch(playerId) {
    if (!selectedTeamId || isCommissioner) return;
    if (preview) {
      setWatchlist(current => {
        const next = { ...current };
        if (next[playerId]) delete next[playerId];
        else next[playerId] = { watched: true };
        return next;
      });
      setSavedAt(new Date());
      setSaveState('saved');
      return;
    }
    const playerRef = ref(db, `watchlists/${selectedTeamId}/${playerId}`);
    return savePreference(() => watchlist[playerId]
      ? set(playerRef, null)
      : set(playerRef, { watched: true }));
  }

  function downloadMyBackup() {
    try {
      const backup = createOwnerPreferencesBackup({
        teamId: selectedTeamId,
        teamName: team?.name,
        leagueName: 'Rx Degenerates',
        players,
        ...currentPreferences,
      });
      downloadOwnerPreferencesBackup(backup);
      setBackupState({
        type: 'success',
        message: `Backup downloaded with ${backup.counts.ranks} ranks, ${backup.counts.tiers} tier assignments, ${backup.counts.notes} notes, and ${backup.counts.starred} starred players.`,
      });
    } catch (error) {
      setBackupState({ type: 'error', message: error.message || 'Your backup could not be created.' });
    }
  }

  async function restoreMyBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBackupState({ type: 'working', message: 'Checking backup…' });
    try {
      const backup = await parseOwnerPreferencesBackupFile(file, { teamId: selectedTeamId, players });
      const { counts } = backup;
      const ignored = backup.ignoredPlayerReferences
        ? ` ${backup.ignoredPlayerReferences} players no longer in the current pool will be skipped.`
        : '';
      const confirmed = window.confirm(
        `Restore this preseason backup? It will replace your current preparation with ${counts.ranks} ranks, ${counts.tiers} tier assignments, ${counts.notes} notes, and ${counts.starred} starred players.${ignored}`,
      );
      if (!confirmed) {
        setBackupState({ type: 'idle', message: 'Restore cancelled. Your current preparation was not changed.' });
        return;
      }
      const restored = backup.preferences;
      await update(ref(db), {
        [`personalRanks/${selectedTeamId}`]: Object.keys(restored.personalRanks).length ? restored.personalRanks : null,
        [`personalTiers/${selectedTeamId}`]: Object.keys(restored.personalTiers).length ? restored.personalTiers : null,
        [`playerNotes/${selectedTeamId}`]: Object.keys(restored.playerNotes).length ? restored.playerNotes : null,
        [`watchlists/${selectedTeamId}`]: Object.keys(restored.watchlists).length ? restored.watchlists : null,
      });
      setSavedAt(new Date());
      setSaveState('saved');
      setBackupState({ type: 'success', message: `Restored ${file.name}. Your preseason preparation is live on this device.` });
    } catch (error) {
      setBackupState({ type: 'error', message: error.message || 'This backup could not be restored.' });
    }
  }

  return (
    <div className="preseason-screen">
      <header className="preseason-header">
        <div>
          <p className="preseason-kicker">Preseason Workspace</p>
          <LeagueBadge className="preseason-league-badge" size="header" />
          {isCommissioner ? (
            <p>Commissioner administration</p>
          ) : (
            <p className="preseason-team-identity">
              <EditableTeamName teamId={selectedTeamId} name={team?.name} disabled={preview} />
              <span>· {team?.ownerName || 'Owner'}</span>
            </p>
          )}
        </div>
        <div className="preseason-header-actions">
          {themeToggle}
          {!preview && <button type="button" onClick={onTeamClear}><LogOut size={15} /> {isCommissioner ? 'Sign out' : 'Switch team'}</button>}
        </div>
      </header>

      {isCommissioner ? (
        <>
          <section className="preseason-admin-hero">
            <div>
              <span className="preseason-icon"><ShieldCheck size={22} /></span>
              <div>
                <h2>League access is open</h2>
                <p>{claimedCount} of {teamEntries.length} teams have selected a PIN. Nomination order does not exist yet.</p>
              </div>
            </div>
            <button type="button" onClick={openDraftDayLobby} disabled={openingLobby}>
              {openingLobby ? 'Opening…' : 'Open draft-day lobby'} <ArrowRight size={17} />
            </button>
          </section>
          <TeamAccessManager teams={teams} teamAccess={teamAccess} showNominationRandomizer={false} />
        </>
      ) : (
        <main className="preseason-owner-shell">
          <section className="preseason-owner-intro">
            <div>
              <p className="preseason-kicker">Private preparation</p>
              <h2>Your player workspace</h2>
              <p>{preview ? 'Try rankings, search, player details, and starring here. Preview changes are not sent to Firebase.' : 'Your rankings and starred players belong only to this team and will carry into draft day.'}</p>
            </div>
            <span className={`preseason-live ${preview || syncConnected ? '' : 'offline'}`}>
              <span /> {preview ? 'Safe local preview' : syncConnected ? 'Live sync' : 'Connecting…'}
            </span>
          </section>

          <div className="preseason-summary-grid">
            <article>
              <ClipboardList size={20} />
              <strong>{preferenceCounts.ranks}</strong>
              <span>Personal ranks saved</span>
            </article>
            <article>
              <Star size={20} />
              <strong>{preferenceCounts.starred}</strong>
              <span>Starred players</span>
            </article>
            <article>
              <UsersRound size={20} />
              <strong>{Object.keys(players).length}</strong>
              <span>Players available</span>
            </article>
          </div>

          {!preview && (
            <section className="preseason-backup-panel" aria-label="My preseason backup">
              <div>
                <ShieldCheck size={20} />
                <span><strong>My preseason backup</strong><small>Save or restore only your private ranks, tiers, notes, and starred players.</small></span>
              </div>
              <div className="preseason-backup-actions">
                <button type="button" onClick={downloadMyBackup}><Download size={16} /> Download my backup</button>
                <input ref={backupInputRef} type="file" accept=".json,application/json" onChange={restoreMyBackup} hidden />
                <button type="button" onClick={() => backupInputRef.current?.click()} disabled={backupState.type === 'working'}>
                  <Upload size={16} /> {backupState.type === 'working' ? 'Checking…' : 'Restore my backup'}
                </button>
              </div>
              {backupState.message && <p className={backupState.type} role={backupState.type === 'error' ? 'alert' : 'status'}>{backupState.message}</p>}
            </section>
          )}

          <PreseasonPlayerWorkspace
            players={players}
            personalRanks={personalRanks}
            personalTiers={personalTiers}
            playerNotes={playerNotes}
            watchlist={watchlist}
            onSavePersonalRanks={savePersonalRanks}
            onSavePersonalTiers={savePersonalTiers}
            onSavePlayerNote={savePlayerNote}
            onImportPreferences={importPreferences}
            onToggleWatch={toggleWatch}
            saveState={saveState}
            savedAt={savedAt}
            saveError={saveError}
            onRetry={() => retryAction && savePreference(retryAction)}
          />
        </main>
      )}
    </div>
  );
}
