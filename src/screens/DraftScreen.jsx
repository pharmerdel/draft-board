import { useState, useEffect } from 'react';
import { ref, onValue, update, set, push, remove } from 'firebase/database';
import { Download, Flag, RotateCcw, Save } from 'lucide-react';
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
import DraftClock from '../components/DraftClock';
import NominationTimer from '../components/NominationTimer';
import TimerDisplay from '../components/TimerDisplay';
import DraftSummaryScreen from './DraftSummaryScreen';
import './DraftScreen.css';

export default function DraftScreen({ complete, selectedTeamId, onTeamClear, themeToggle }) {
  const [draft, setDraft]         = useState(null);
  const [teams, setTeams]         = useState({});
  const [players, setPlayers]     = useState({});
  const [log, setLog]             = useState({});
  const [watchlist, setWatchlist]           = useState({});
  const [personalRanks, setPersonalRanks]   = useState({});
  const [soldData, setSoldData]             = useState(null); // { player, team, price, playerId }

  // Live sync everything
  useEffect(() => {
    const unsubs = [
      onValue(ref(db, 'draft'),   s => setDraft(s.val())),
      onValue(ref(db, 'teams'),   s => setTeams(s.val() || {})),
      onValue(ref(db, 'players'), s => setPlayers(s.val() || {})),
      onValue(ref(db, 'log'),     s => setLog(s.val() || {})),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // Sync watchlist + personal ranks for this participant
  useEffect(() => {
    if (!selectedTeamId || selectedTeamId === 'commissioner') return;
    const unsub1 = onValue(ref(db, `watchlists/${selectedTeamId}`), s => setWatchlist(s.val() || {}));
    const unsub2 = onValue(ref(db, `personalRanks/${selectedTeamId}`), s => setPersonalRanks(s.val() || {}));
    return () => { unsub1(); unsub2(); };
  }, [selectedTeamId]);

  async function savePersonalRanks(ranks) {
    if (!selectedTeamId) return;
    await update(ref(db, `personalRanks/${selectedTeamId}`), ranks);
  }

  const selectedTeamIsStale =
    selectedTeamId &&
    selectedTeamId !== 'commissioner' &&
    Object.keys(teams).length > 0 &&
    !teams[selectedTeamId];

  // Mark this device connected
  useEffect(() => {
    if (!selectedTeamId || selectedTeamIsStale) return;
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
  const nominatingTeamId = (() => {
    const ids = draft.nominationOrderIds || [];
    const n = ids.length;
    for (let i = 0; i < n * 2; i++) {
      const teamId = ids[(draft.nominationIndex + i) % n];
      const team = teams[teamId];
      if (team && Object.values(team.roster || {}).length < TOTAL_DRAFT_SLOTS) return teamId;
    }
    return null; // all teams full
  })();
  const currentNomination = draft.currentNomination;
  const nominatedPlayer = currentNomination ? players[currentNomination.playerId] : null;

  // ── Actions ──────────────────────────────────────────────────────────────

  async function nominatePlayer(playerId) {
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
    const playerId = currentNomination?.playerId;
    if (!playerId) return;
    await update(ref(db, 'draft'), { currentNomination: null });
    await update(ref(db, `players/${playerId}`), { status: 'available' });
  }

  async function enableTimer(duration) {
    await update(ref(db, 'draft'), {
      timerEnabled: true,
      timerDuration: duration,
      timerStartedAt: null,
    });
  }

  async function disableTimer() {
    await update(ref(db, 'draft'), {
      timerEnabled: false,
      timerStartedAt: null,
    });
  }

  async function changeTimerDuration(duration) {
    await update(ref(db, 'draft'), {
      timerDuration: duration,
      timerStartedAt: null, // reset any running timer
    });
  }

  async function skipNominator() {
    const nextIndex = (draft.nominationIndex + 1);
    await update(ref(db, 'draft'), {
      nominationIndex: nextIndex,
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
    const player = players[playerId];
    const team   = teams[winningTeamId];

    if (!player) throw new Error(`Player not found in state: ${playerId}`);
    if (!team)   throw new Error(`Team not found in state: ${winningTeamId}`);

    const priceInt = parseInt(price, 10);

    // Determine roster slot
    const slot = autoAssignSlot(player.position, team.roster || {});

    // Update player
    await update(ref(db, `players/${playerId}`), {
      status: 'sold',
      soldTo: winningTeamId,
      soldPrice: priceInt,
    });

    const projVal = player.projectedValue ?? null;

    // Add to team roster
    await update(ref(db, `teams/${winningTeamId}/roster/${playerId}`), {
      playerName: player.name,
      position: player.position,
      nflTeam: player.nflTeam,
      slotType: slot,
      pricePaid: priceInt,
      projectedValue: projVal,
    });

    // Deduct budget
    await update(ref(db, `teams/${winningTeamId}`), {
      budgetRemaining: (team.budgetRemaining || 200) - priceInt,
    });

    // Append to log
    await push(ref(db, 'log'), {
      type: 'sold',
      timestamp: Date.now(),
      playerId,
      playerName: player.name,
      position: player.position,
      nflTeam: player.nflTeam,
      teamId: winningTeamId,
      teamName: team.name,
      pricePaid: priceInt,
      projectedValue: projVal,
      delta: projVal != null ? priceInt - projVal : null,
    });

    // Advance nomination order, clear block, start timer if enabled
    const nextIndex = (draft.nominationIndex + 1);
    await update(ref(db, 'draft'), {
      currentNomination: null,
      nominationIndex: nextIndex,
      timerStartedAt: draft.timerEnabled ? Date.now() : null,
    });

    // Auto-end draft if every team has filled all roster slots
    const allTeamsFull = Object.entries(teams).every(([tid, t]) => {
      const filled = Object.values(t.roster || {}).length + (tid === winningTeamId ? 1 : 0);
      return filled >= TOTAL_DRAFT_SLOTS;
    });
    if (allTeamsFull) {
      await set(ref(db, 'draft/status'), 'complete');
    }

    // Auto-save backup to localStorage after every pick
    // Uses current React state + the updates we just made to build an accurate snapshot
    const updatedTeam = {
      ...team,
      budgetRemaining: (team.budgetRemaining || 200) - priceInt,
      roster: {
        ...(team.roster || {}),
        [playerId]: {
          playerName: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          slotType: slot,
          pricePaid: priceInt,
          projectedValue: projVal,
        }
      }
    };
    // Trigger SOLD animation with a snapshot of the updated data
    setSoldData({ player, team: updatedTeam, price: priceInt, playerId });

    saveBackup({
      draft: { ...draft, currentNomination: null, nominationIndex: nextIndex },
      teams: { ...teams, [winningTeamId]: updatedTeam },
      players: { ...players, [playerId]: { ...player, status: 'sold', soldTo: winningTeamId, soldPrice: priceInt } },
      log,
    });
  }

  async function undoLastSale() {
    // Find most recent sold log entry
    const entries = Object.entries(log)
      .filter(([, e]) => e.type === 'sold')
      .sort((a, b) => b[1].timestamp - a[1].timestamp);

    if (!entries.length) return;
    const [logId, entry] = entries[0];

    // Restore player
    await update(ref(db, `players/${entry.playerId}`), {
      status: 'available',
      soldTo: null,
      soldPrice: null,
    });

    // Remove from roster
    await remove(ref(db, `teams/${entry.teamId}/roster/${entry.playerId}`));

    // Restore budget
    const team = teams[entry.teamId];
    await update(ref(db, `teams/${entry.teamId}`), {
      budgetRemaining: (team.budgetRemaining || 0) + entry.pricePaid,
    });

    // Roll back nomination index
    await update(ref(db, 'draft'), {
      nominationIndex: Math.max(0, draft.nominationIndex - 1),
      currentNomination: null,
    });

    // Mark log entry as undone
    await update(ref(db, `log/${logId}`), { type: 'undo' });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Determine which view to show based on role + screen size
  const isCommissioner = selectedTeamId === 'commissioner';
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
  };

  return (
    <>
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
        <div className="draft-screen">
          <div className="draft-topbar">
            <span className="draft-league-name">{draft.leagueName}</span>
            <span className={`draft-status-badge ${complete ? 'complete' : 'live'}`}>
              <span className="draft-status-dot" />
              {complete ? 'Complete' : 'Live'}
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
              onClick={downloadBackup}
              title="Download a backup JSON file. Restore it from the Setup screen if needed."
            >
              <Save size={15} strokeWidth={2.2} />
              Backup
            </button>
            <button
              className="export-csv-btn"
              onClick={undoLastSale}
              disabled={!Object.values(log).some(e => e.type === 'sold')}
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
              selectedTeamId={selectedTeamId}
            />
          </div>

          {/* Nomination overlay — stays mounted during sold animation */}
          {((nominatedPlayer && currentNomination) || soldData) && (
            <NominationOverlay
              nominatedPlayer={nominatedPlayer}
              currentNomination={currentNomination}
              teams={teams}
              draft={draft}
              onSell={sellPlayer}
              onCancelNomination={cancelNomination}
              soldData={soldData}
              onSoldDone={() => setSoldData(null)}
            />
          )}
        </div>
      )}

    </>
  );
}

// ── Slot assignment helper ────────────────────────────────────────────────────
// Fills QB → RB → WR → TE → FLEX → BN in order

const TOTAL_DRAFT_SLOTS = 13;
const SLOT_LIMITS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 };
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE'];

function autoAssignSlot(position, roster) {
  const filled = Object.values(roster);
  const count = (slot) => filled.filter(p => p.slotType === slot).length;

  // Try primary slot first
  if (count(position) < SLOT_LIMITS[position]) return position;

  // Try FLEX
  if (FLEX_ELIGIBLE.includes(position) && count('FLEX') < SLOT_LIMITS.FLEX) return 'FLEX';

  // Fall to bench
  return 'BN';
}
