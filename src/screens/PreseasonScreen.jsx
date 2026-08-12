import { useEffect, useRef, useState } from 'react';
import { onValue, ref, serverTimestamp, set, update } from 'firebase/database';
import { ArrowRight, ClipboardList, LogOut, ShieldCheck, Star, UsersRound } from 'lucide-react';

import PreseasonPlayerWorkspace from '../components/PreseasonPlayerWorkspace';
import TeamAccessManager from '../components/TeamAccessManager';
import { db } from '../firebase';
import { buildDraftDayLobbyUpdates, sortTeamsForDisplay } from '../utils/draftLifecycle';
import './PreseasonScreen.css';

export default function PreseasonScreen({ selectedTeamId, onTeamClear, themeToggle, preview = false }) {
  const [draft, setDraft] = useState({});
  const [teams, setTeams] = useState({});
  const [players, setPlayers] = useState({});
  const [teamAccess, setTeamAccess] = useState({});
  const [personalRanks, setPersonalRanks] = useState({});
  const [watchlist, setWatchlist] = useState({});
  const [syncConnected, setSyncConnected] = useState(null);
  const [openingLobby, setOpeningLobby] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [retryAction, setRetryAction] = useState(null);
  const saveAttempt = useRef(0);

  const isCommissioner = selectedTeamId === 'commissioner';
  const team = isCommissioner ? null : teams[selectedTeamId];
  const teamEntries = sortTeamsForDisplay(teams);
  const claimedCount = teamEntries.filter(([teamId]) => teamAccess[teamId]?.state === 'claimed').length;

  useEffect(() => {
    const unsubscribers = [
      onValue(ref(db, 'draft'), snapshot => setDraft(snapshot.val() || {})),
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

  function savePersonalRanks(ranks) {
    if (!selectedTeamId || isCommissioner) return;
    if (preview) {
      setPersonalRanks(ranks);
      setSavedAt(new Date());
      setSaveState('saved');
      return;
    }
    return savePreference(() => update(ref(db, `personalRanks/${selectedTeamId}`), ranks));
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

  return (
    <div className="preseason-screen">
      <header className="preseason-header">
        <div>
          <p className="preseason-kicker">Preseason Workspace</p>
          <h1>{draft.leagueName || 'Rx Degenerates'}</h1>
          <p>{isCommissioner ? 'Commissioner administration' : `${team?.name || 'Team'} · ${team?.ownerName || 'Owner'}`}</p>
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
              <strong>{Object.keys(personalRanks).length}</strong>
              <span>Personal ranks saved</span>
            </article>
            <article>
              <Star size={20} />
              <strong>{Object.keys(watchlist).length}</strong>
              <span>Starred players</span>
            </article>
            <article>
              <UsersRound size={20} />
              <strong>{Object.keys(players).length}</strong>
              <span>Players available</span>
            </article>
          </div>

          <PreseasonPlayerWorkspace
            players={players}
            personalRanks={personalRanks}
            watchlist={watchlist}
            onSavePersonalRanks={savePersonalRanks}
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
