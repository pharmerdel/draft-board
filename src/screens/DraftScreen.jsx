import { useCallback, useState, useEffect } from 'react';
import { ref, onValue, update, set, push, remove, serverTimestamp } from 'firebase/database';
import { Download, Flag, Pause, Play, RotateCcw, Save } from 'lucide-react';
import { db } from '../firebase';
import TeamsColumn from '../components/TeamsColumn';
import CenterColumn from '../components/CenterColumn';
import NominationOverlay from '../components/NominationOverlay';
import RightColumn from '../components/RightColumn';
import MobileView from '../components/MobileView';
import ParticipantDesktopView from '../components/ParticipantDesktopView';
import ResetButton from '../components/ResetButton';
import { generateDraftCsv, downloadCsv } from '../utils/exportCsv';
import { saveBackup, downloadBackup } from '../utils/backup';
import { checkFantasyProsNewsHealth } from '../utils/fantasyProsNews';
import DraftClock from '../components/DraftClock';
import LeagueBadge from '../components/LeagueBadge';
import NominationTimer from '../components/NominationTimer';
import DraftSummaryScreen from './DraftSummaryScreen';
import './DraftScreen.css';
import { normalizePlayerNote } from '../utils/playerNotes';
import {
  TOTAL_DRAFT_SLOTS,
  autoAssignSlot,
  findNominatingTeamId,
  isRosterFull,
} from '../utils/rosterRules';
import { resumedTimerStartedAt, timerRemainingMs } from '../utils/draftTimer';

export default function DraftScreen({ complete, preview = false, soldStampPreview = false, selectedTeamId, onTeamClear, themeToggle }) {
  const [draft, setDraft]         = useState(null);
  const [teams, setTeams]         = useState({});
  const [players, setPlayers]     = useState({});
  const [log, setLog]             = useState({});
  const [watchlist, setWatchlist]           = useState({});
  const [personalRanks, setPersonalRanks]   = useState({});
  const [personalTiers, setPersonalTiers]   = useState({});
  const [playerNotes, setPlayerNotes]       = useState({});
  const [soldData, setSoldData]             = useState(null); // { player, team, price, playerId }
  const [syncConnected, setSyncConnected]   = useState(null);
  const [newsHealth, setNewsHealth]         = useState('checking');
  const clearSoldData = useCallback(() => setSoldData(null), []);

  // Live sync everything
  useEffect(() => {
    const unsubs = [
      onValue(ref(db, 'draft'),   s => setDraft(s.val())),
      onValue(ref(db, 'teams'),   s => setTeams(s.val() || {})),
      onValue(ref(db, 'players'), s => setPlayers(s.val() || {})),
      onValue(ref(db, 'log'),     s => setLog(s.val() || {})),
      onValue(ref(db, '.info/connected'), s => setSyncConnected(s.val())),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkNews() {
      setNewsHealth('checking');
      try {
        await checkFantasyProsNewsHealth();
        if (!cancelled) setNewsHealth('live');
      } catch {
        if (!cancelled) setNewsHealth('down');
      }
    }

    checkNews();
    const id = setInterval(checkNews, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Sync private owner preferences for this participant
  useEffect(() => {
    if (!selectedTeamId || selectedTeamId === 'commissioner') return;
    const unsub1 = onValue(ref(db, `watchlists/${selectedTeamId}`), s => setWatchlist(s.val() || {}));
    const unsub2 = onValue(ref(db, `personalRanks/${selectedTeamId}`), s => setPersonalRanks(s.val() || {}));
    const unsub3 = onValue(ref(db, `personalTiers/${selectedTeamId}`), s => setPersonalTiers(s.val() || {}));
    const unsub4 = onValue(ref(db, `playerNotes/${selectedTeamId}`), s => setPlayerNotes(s.val() || {}));
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [selectedTeamId]);

  async function savePersonalRanks(ranks, tierUpdates = null) {
    if (!selectedTeamId) return;
    if (tierUpdates) {
      const combinedUpdates = {};
      Object.entries(ranks).forEach(([playerId, rank]) => {
        combinedUpdates[`personalRanks/${selectedTeamId}/${playerId}`] = rank;
      });
      Object.entries(tierUpdates).forEach(([path, tier]) => {
        combinedUpdates[`personalTiers/${selectedTeamId}/${path}`] = tier;
      });
      await update(ref(db), combinedUpdates);
      return;
    }
    await update(ref(db, `personalRanks/${selectedTeamId}`), ranks);
  }

  async function savePersonalTiers(updates) {
    if (!selectedTeamId || !updates) return;
    await update(ref(db, `personalTiers/${selectedTeamId}`), updates);
  }

  async function savePlayerNote(playerId, text) {
    if (!selectedTeamId || !playerId) return;
    const normalized = normalizePlayerNote(text);
    const noteRef = ref(db, `playerNotes/${selectedTeamId}/${playerId}`);
    if (normalized) await set(noteRef, { text: normalized, updatedAt: serverTimestamp() });
    else await set(noteRef, null);
  }

  const selectedTeamIsStale =
    selectedTeamId &&
    selectedTeamId !== 'commissioner' &&
    Object.keys(teams).length > 0 &&
    !teams[selectedTeamId];

  // Mark this device connected
  useEffect(() => {
    if (!selectedTeamId || selectedTeamId === 'commissioner' || selectedTeamIsStale) return;
    update(ref(db, `teams/${selectedTeamId}`), { connected: true, lastSeen: Date.now() });
    const bye = () => update(ref(db, `teams/${selectedTeamId}`), { connected: false });
    window.addEventListener('beforeunload', bye);
    return () => { window.removeEventListener('beforeunload', bye); bye(); };
  }, [selectedTeamId, selectedTeamIsStale]);

  useEffect(() => {
    if (selectedTeamIsStale) onTeamClear?.();
  }, [selectedTeamIsStale, onTeamClear]);

  if (!draft || !Object.keys(players).length) {
    return (
      <div className="draft-loading">
        <p>Loading draft data…</p>
        <ResetButton />
      </div>
    );
  }

  if (selectedTeamIsStale) {
    return (
      <div className="draft-loading">
        <p>Rejoining draft…</p>
      </div>
    );
  }

  // ── Summary screen when draft is complete ───────────────────────────────
  if (complete || draft.status === 'complete') {
    return (
      <>
        <span className="summary-theme-slot">{themeToggle}</span>
        <DraftSummaryScreen
          draft={draft}
          teams={teams}
          players={players}
          log={log}
          isCommissioner={selectedTeamId === 'commissioner'}
        />
      </>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  // Find the next team that still has open roster slots, starting from nominationIndex.
  // This skips teams that have already filled all 13 spots.
  const computedNominatingTeamId = findNominatingTeamId(
    teams,
    draft.nominationOrderIds || [],
    draft.nominationIndex || 0,
  );
  const nominatingTeamId = draft.nominatingTeamId || computedNominatingTeamId;
  const currentNomination = draft.currentNomination;
  const nominatedPlayer = currentNomination ? players[currentNomination.playerId] : null;
  const [previewPlayerId, previewPlayer] = Object.entries(players)[0] || [];
  const previewTeam = Object.values(teams)[0];
  const displayedSoldData = soldStampPreview && previewPlayer && previewTeam
    ? { player: previewPlayer, team: previewTeam, price: 42, playerId: previewPlayerId }
    : soldData;

  // ── Actions ──────────────────────────────────────────────────────────────

  async function nominatePlayer(playerId) {
    if (draft.status !== 'active') throw new Error('The draft is paused. Resume before nominating.');
    await update(ref(db, 'draft'), {
      currentNomination: {
        playerId,
        nominatingTeamId,
        startedAt: Date.now(),
      },
      timerStartedAt: null, // stop timer when nomination is made
    });
    await update(ref(db, `players/${playerId}`), { status: 'nominated' });
  }

  async function cancelNomination() {
    if (draft.status !== 'active') throw new Error('The draft is paused. Resume before cancelling a nomination.');
    const playerId = currentNomination?.playerId;
    if (!playerId) return;
    await update(ref(db, 'draft'), { currentNomination: null });
    await update(ref(db, `players/${playerId}`), { status: 'available' });
  }

  async function enableTimer(duration) {
    if (draft.status !== 'active') return;
    await update(ref(db, 'draft'), {
      timerEnabled: true,
      timerDuration: duration,
      timerStartedAt: null,
    });
  }

  async function disableTimer() {
    if (draft.status !== 'active') return;
    await update(ref(db, 'draft'), {
      timerEnabled: false,
      timerStartedAt: null,
    });
  }

  async function changeTimerDuration(duration) {
    if (draft.status !== 'active') return;
    await update(ref(db, 'draft'), {
      timerDuration: duration,
      timerStartedAt: null, // reset any running timer
    });
  }

  async function skipNominator() {
    if (draft.status !== 'active') return;
    const nextIndex = (draft.nominationIndex + 1);
    const nextNominatingTeamId = findNominatingTeamId(teams, draft.nominationOrderIds || [], nextIndex);
    await update(ref(db, 'draft'), {
      nominationIndex: nextIndex,
      nominatingTeamId: nextNominatingTeamId,
      timerStartedAt: draft.timerEnabled ? Date.now() : null,
    });
  }

  async function toggleWatch(playerId) {
    if (!selectedTeamId) return;
    const path = `watchlists/${selectedTeamId}/${playerId}`;
    if (watchlist[playerId]) {
      await remove(ref(db, path));
    } else {
      await update(ref(db, path), { watched: true });
    }
  }

  async function addPlayer({ name, position, nflTeam }) {
    if (draft.status !== 'active') throw new Error('The draft is paused. Resume before adding a player.');
    const existingRanks = Object.values(players)
      .filter(p => p.position === position)
      .map(p => p.positionalRank || 0);
    const positionalRank = existingRanks.length > 0 ? Math.max(...existingRanks) + 1 : 1;
    const overallRanks = Object.values(players).map(p => p.overallRank || 0);
    const overallRank = overallRanks.length > 0 ? Math.max(...overallRanks) + 1 : 999;

    await push(ref(db, 'players'), {
      name: name.trim(),
      position,
      nflTeam: nflTeam.trim().toUpperCase(),
      positionalRank,
      overallRank,
      projectedValue: null,
      sleeperPlayerId: null,
      headshotUrl: null,
      status: 'available',
      soldTo: null,
      soldPrice: null,
    });
  }

  async function sellPlayer(playerId, winningTeamId, price) {
    if (draft.status !== 'active') throw new Error('The draft is paused. Resume before recording a sale.');
    const player = players[playerId];
    const team   = teams[winningTeamId];

    if (!player) throw new Error(`Player not found in state: ${playerId}`);
    if (!team)   throw new Error(`Team not found in state: ${winningTeamId}`);

    const priceInt = Number.parseInt(price, 10);
    if (!Number.isInteger(priceInt) || priceInt < 1) throw new Error('Winning bid must be at least $1.');
    if (draft.currentNomination?.playerId !== playerId || player.status !== 'nominated') {
      throw new Error('The nominated player changed. Refresh the board and try again.');
    }
    if (isRosterFull(team)) throw new Error(`${team.name}'s roster is already full.`);

    // Determine roster slot
    const slot = autoAssignSlot(player.position, team.roster || {});
    if (!slot) throw new Error(`${team.name} has no legal roster slot available.`);

    const saleTimestamp = Date.now();
    const currentBudget = team.budgetRemaining ?? 200;
    const updatedBudget = currentBudget - priceInt;
    const nextIndex = draft.nominationIndex + 1;
    const nextNominatingTeamId = findNominatingTeamId(
      teams,
      draft.nominationOrderIds || [],
      nextIndex,
      winningTeamId,
    );
    const allTeamsFull = Object.entries(teams).every(([teamId, candidate]) => {
      const pendingPlayerCount = teamId === winningTeamId ? 1 : 0;
      return Object.keys(candidate.roster || {}).length + pendingPlayerCount >= TOTAL_DRAFT_SLOTS;
    });
    const logRef = push(ref(db, 'log'));
    const projVal = player.projectedValue ?? null;
    const rosterEntry = {
      playerName: player.name,
      position: player.position,
      nflTeam: player.nflTeam,
      slotType: slot,
      pricePaid: priceInt,
      projectedValue: projVal,
    };

    const saleLogEntry = {
      type: 'sold',
      timestamp: saleTimestamp,
      playerId,
      playerName: player.name,
      position: player.position,
      nflTeam: player.nflTeam,
      teamId: winningTeamId,
      teamName: team.name,
      pricePaid: priceInt,
      projectedValue: projVal,
      delta: projVal != null ? priceInt - projVal : null,
      slotType: slot,
    };

    await update(ref(db), {
      [`players/${playerId}/status`]: 'sold',
      [`players/${playerId}/soldTo`]: winningTeamId,
      [`players/${playerId}/soldPrice`]: priceInt,
      [`teams/${winningTeamId}/roster/${playerId}`]: rosterEntry,
      [`teams/${winningTeamId}/budgetRemaining`]: updatedBudget,
      [`log/${logRef.key}`]: saleLogEntry,
      'draft/currentNomination': null,
      'draft/nominationIndex': nextIndex,
      'draft/nominatingTeamId': nextNominatingTeamId,
      'draft/timerStartedAt': allTeamsFull ? null : (draft.timerEnabled ? saleTimestamp : null),
      ...(allTeamsFull ? { 'draft/status': 'complete' } : {}),
    });

    // Auto-save backup to localStorage after every pick
    // Uses current React state + the updates we just made to build an accurate snapshot
    const updatedTeam = {
      ...team,
      budgetRemaining: updatedBudget,
      roster: {
        ...(team.roster || {}),
        [playerId]: rosterEntry,
      }
    };
    // Trigger SOLD animation with a snapshot of the updated data
    setSoldData({ player, team: updatedTeam, price: priceInt, playerId });

    saveBackup({
      draft: {
        ...draft,
        currentNomination: null,
        nominationIndex: nextIndex,
        nominatingTeamId: nextNominatingTeamId,
        timerStartedAt: allTeamsFull ? null : (draft.timerEnabled ? saleTimestamp : null),
        status: allTeamsFull ? 'complete' : draft.status,
      },
      teams: { ...teams, [winningTeamId]: updatedTeam },
      players: { ...players, [playerId]: { ...player, status: 'sold', soldTo: winningTeamId, soldPrice: priceInt } },
      log: { ...log, [logRef.key]: saleLogEntry },
    });
  }

  async function undoLastSale() {
    if (draft.status !== 'active') throw new Error('The draft is paused. Resume before undoing a sale.');
    // Find most recent sold log entry
    const entries = Object.entries(log)
      .filter(([, e]) => e.type === 'sold')
      .sort((a, b) => b[1].timestamp - a[1].timestamp);

    if (!entries.length) return;
    const [logId, entry] = entries[0];

    const team = teams[entry.teamId];
    if (!team) throw new Error('The team for the last sale no longer exists.');

    const previousIndex = Math.max(0, draft.nominationIndex - 1);
    await update(ref(db), {
      [`players/${entry.playerId}/status`]: 'available',
      [`players/${entry.playerId}/soldTo`]: null,
      [`players/${entry.playerId}/soldPrice`]: null,
      [`teams/${entry.teamId}/roster/${entry.playerId}`]: null,
      [`teams/${entry.teamId}/budgetRemaining`]: (team.budgetRemaining ?? 0) + entry.pricePaid,
      [`log/${logId}/type`]: 'undo',
      'draft/nominationIndex': previousIndex,
      'draft/nominatingTeamId': findNominatingTeamId(teams, draft.nominationOrderIds || [], previousIndex),
      'draft/currentNomination': null,
      'draft/timerStartedAt': null,
    });

    const updatedRoster = { ...(team.roster || {}) };
    delete updatedRoster[entry.playerId];
    saveBackup({
      draft: {
        ...draft,
        nominationIndex: previousIndex,
        nominatingTeamId: findNominatingTeamId(teams, draft.nominationOrderIds || [], previousIndex),
        currentNomination: null,
        timerStartedAt: null,
      },
      teams: {
        ...teams,
        [entry.teamId]: {
          ...team,
          roster: updatedRoster,
          budgetRemaining: (team.budgetRemaining ?? 0) + entry.pricePaid,
        },
      },
      players: {
        ...players,
        [entry.playerId]: {
          ...players[entry.playerId],
          status: 'available',
          soldTo: null,
          soldPrice: null,
        },
      },
      log: { ...log, [logId]: { ...entry, type: 'undo' } },
    });
  }

  function downloadCurrentBackup() {
    saveBackup({ draft, teams, players, log });
    downloadBackup();
  }

  async function pauseDraft() {
    if (draft.status !== 'active') return;
    if (!window.confirm('Pause the draft? The current nomination and timer will be preserved.')) return;

    const pausedAt = Date.now();
    const eventRef = push(ref(db, 'log'));
    await update(ref(db), {
      'draft/status': 'paused',
      'draft/pausedAt': pausedAt,
      'draft/pausedTimerRemainingMs': timerRemainingMs(draft, pausedAt),
      'draft/timerStartedAt': null,
      [`log/${eventRef.key}`]: { type: 'pause', timestamp: pausedAt },
    });
  }

  async function resumeDraft() {
    if (draft.status !== 'paused') return;

    const resumedAt = Date.now();
    const eventRef = push(ref(db, 'log'));
    await update(ref(db), {
      'draft/status': 'active',
      'draft/pausedAt': null,
      'draft/pausedTimerRemainingMs': null,
      'draft/timerStartedAt': resumedTimerStartedAt(draft, resumedAt),
      [`log/${eventRef.key}`]: { type: 'resume', timestamp: resumedAt },
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Determine which view to show based on role + screen size
  const isCommissioner = selectedTeamId === 'commissioner';
  const isPaused = draft.status === 'paused';
  const isMobile = window.innerWidth < 768;

  const activeView =
    isCommissioner ? 'commissioner' :
    isMobile       ? 'participant-mobile' :
                     'participant-desktop';

  // Shared props for participant views
  const participantProps = {
    draft, teams, players, log,
    nominatedPlayer, currentNomination,
    selectedTeamId, nominatingTeamId,
    onNominate: nominatePlayer,
    watchlist, onToggleWatch: toggleWatch,
    personalRanks, onSavePersonalRanks: savePersonalRanks,
    personalTiers, onSavePersonalTiers: savePersonalTiers,
    playerNotes, onSavePlayerNote: savePlayerNote,
    onTeamClear,
  };

  return (
    <>
      {isPaused && (
        <div className="draft-paused-banner" role="status">
          Draft paused — rosters and preferences remain available, but draft actions are locked.
        </div>
      )}

      {/* ── Participant mobile ── */}
      {activeView === 'participant-mobile' && (
        <MobileView {...participantProps} themeToggle={themeToggle} />
      )}

      {/* ── Participant desktop ── */}
      {activeView === 'participant-desktop' && (
        <ParticipantDesktopView {...participantProps} themeToggle={themeToggle} />
      )}

      {/* ── Commissioner big board ── */}
      {activeView === 'commissioner' && (
        <div className="draft-screen" inert={preview}>
          <div className="draft-topbar">
            <LeagueBadge className="draft-league-badge" size="topbar" />
            <span className={`draft-status-badge ${isPaused ? 'paused' : complete ? 'complete' : 'live'}`}>
              <span className="draft-status-dot" />
              {isPaused ? 'Paused' : complete ? 'Complete' : 'Live'}
            </span>
            {themeToggle}
            <DraftClock startedAt={draft.startedAt} />
            <NominationTimer
              draft={draft}
              onEnable={enableTimer}
              onDisable={disableTimer}
              onChangeDuration={changeTimerDuration}
              onSkip={skipNominator}
            />
            <button
              className={`export-csv-btn draft-pause-btn ${isPaused ? 'resume' : ''}`}
              onClick={isPaused ? resumeDraft : pauseDraft}
            >
              {isPaused
                ? <><Play size={15} strokeWidth={2.4} /> Resume</>
                : <><Pause size={15} strokeWidth={2.4} /> Pause</>}
            </button>
            <button
              className="export-csv-btn"
              onClick={() => {
                const csv = generateDraftCsv(teams, draft.nominationOrderIds || []);
                const date = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '-');
                downloadCsv(csv, `${draft.leagueName.replace(/\s+/g, '-')}-draft-${date}.csv`);
              }}
            >
              <Download size={15} strokeWidth={2.2} />
              Export CSV
            </button>
            <button
              className="export-csv-btn backup-btn"
              onClick={downloadCurrentBackup}
              title="Download a backup JSON file. Restore it from the Setup screen if needed."
            >
              <Save size={15} strokeWidth={2.2} />
              Backup
            </button>
            <button
              className="export-csv-btn"
              onClick={undoLastSale}
              disabled={isPaused || !Object.values(log).some(e => e.type === 'sold')}
              title="Undo last pick"
            >
              <RotateCcw size={15} strokeWidth={2.2} />
              Undo
            </button>
            <button
              className="end-draft-btn"
              onClick={async () => {
                if (window.confirm('End the draft and show final results? This cannot be undone.')) {
                  await set(ref(db, 'draft/status'), 'complete');
                }
              }}
            >
              <Flag size={15} strokeWidth={2.2} />
              End Draft
            </button>
            <ResetButton compact onTeamClear={onTeamClear} />
          </div>
          <div className="draft-columns">
            <TeamsColumn
              teams={teams}
              draft={draft}
              nominatingTeamId={nominatingTeamId}
              selectedTeamId={selectedTeamId}
            />
            <CenterColumn
              draft={draft}
              teams={teams}
              players={players}
              nominatedPlayer={nominatedPlayer}
              currentNomination={currentNomination}
              nominatingTeamId={nominatingTeamId}
              onNominate={nominatePlayer}
              onSell={sellPlayer}
              onCancelNomination={cancelNomination}
              onAddPlayer={addPlayer}
              commissionerMode
            />
            <RightColumn
              players={players}
              teams={teams}
              log={log}
              onUndo={undoLastSale}
              syncConnected={syncConnected}
              newsHealth={newsHealth}
              actionsDisabled={isPaused}
            />
          </div>

          {/* Nomination overlay — stays mounted during sold animation */}
          {((nominatedPlayer && currentNomination) || displayedSoldData) && (
            <NominationOverlay
              nominatedPlayer={nominatedPlayer}
              currentNomination={currentNomination}
              teams={teams}
              draft={draft}
              onSell={sellPlayer}
              onCancelNomination={cancelNomination}
              soldData={displayedSoldData}
              holdSoldStamp={soldStampPreview}
              onSoldDone={clearSoldData}
            />
          )}
        </div>
      )}

    </>
  );
}
