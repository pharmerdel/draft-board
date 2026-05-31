import { useState, useEffect } from 'react';
import { ref, onValue, update, set, push, remove } from 'firebase/database';
import { db } from '../firebase';
import TeamsColumn from '../components/TeamsColumn';
import CenterColumn from '../components/CenterColumn';
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

export default function DraftScreen({ complete, selectedTeamId, onTeamClear }) {
  const [draft, setDraft]     = useState(null);
  const [teams, setTeams]     = useState({});
  const [players, setPlayers] = useState({});
  const [log, setLog]         = useState({});

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

  // Mark this device connected
  useEffect(() => {
    if (!selectedTeamId) return;
    update(ref(db, `teams/${selectedTeamId}`), { connected: true, lastSeen: Date.now() });
    const bye = () => update(ref(db, `teams/${selectedTeamId}`), { connected: false });
    window.addEventListener('beforeunload', bye);
    return () => { window.removeEventListener('beforeunload', bye); bye(); };
  }, [selectedTeamId]);

  if (!draft || !Object.keys(players).length) {
    return (
      <div className="draft-loading">
        <p>Loading draft data…</p>
        <ResetButton />
      </div>
    );
  }

  // ── Summary screen when draft is complete ───────────────────────────────
  if (complete || draft.status === 'complete') {
    return (
      <DraftSummaryScreen
        draft={draft}
        teams={teams}
        log={log}
        isCommissioner={selectedTeamId === 'commissioner'}
      />
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const nominatingTeamId = draft.nominationOrderIds?.[draft.nominationIndex % 12];
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
  };

  return (
    <>
      {/* ── Participant mobile ── */}
      {activeView === 'participant-mobile' && (
        <MobileView {...participantProps} />
      )}

      {/* ── Participant desktop ── */}
      {activeView === 'participant-desktop' && (
        <ParticipantDesktopView {...participantProps} />
      )}

      {/* ── Commissioner big board ── */}
      {activeView === 'commissioner' && (
        <div className="draft-screen">
          <div className="draft-topbar">
            <span className="draft-league-name">{draft.leagueName}</span>
            <span className="draft-status-badge">
              {complete ? '✅ Complete' : '🔴 Live'}
            </span>
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
              ⬇ Export CSV
            </button>
            <button
              className="export-csv-btn backup-btn"
              onClick={downloadBackup}
              title="Download a backup JSON file. Restore it from the Setup screen if needed."
            >
              💾 Backup
            </button>
            <button
              className="end-draft-btn"
              onClick={async () => {
                if (window.confirm('End the draft and show final results? This cannot be undone.')) {
                  await set(ref(db, 'draft/status'), 'complete');
                }
              }}
            >
              🏁 End Draft
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
            />
            <RightColumn
              players={players}
              teams={teams}
              log={log}
              onUndo={undoLastSale}
              selectedTeamId={selectedTeamId}
            />
          </div>
        </div>
      )}

    </>
  );
}

// ── Slot assignment helper ────────────────────────────────────────────────────
// Fills QB → RB → WR → TE → FLEX → BN in order

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
