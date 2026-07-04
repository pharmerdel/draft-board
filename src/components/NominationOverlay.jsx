import { useState, useEffect } from 'react';
import { usePlayerStats, PlayerStatsBody } from './PlayerStats';
import './NominationOverlay.css';

const TOTAL_DRAFT_SLOTS = 13;
const SLOT_ORDER  = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];
const SLOT_LIMITS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 };

function maxBid(team) {
  const filled = Object.values(team.roster || {}).length;
  const empty  = Math.max(0, TOTAL_DRAFT_SLOTS - filled);
  return Math.max(1, (team.budgetRemaining || 0) - (empty - 1));
}

export default function NominationOverlay({
  nominatedPlayer, currentNomination,
  teams, draft,
  onSell, onCancelNomination,
  soldData, onSoldDone,
}) {
  const [winTeamId, setWinTeamId] = useState('');
  const [price, setPrice]         = useState('');
  const [selling, setSelling]     = useState(false);
  const [soldPhase, setSoldPhase] = useState(0); // 0=normal 1=stamp 2=winner
  const [progress, setProgress]   = useState(0);

  // Use soldData's player snapshot during animation so left panel stays stable
  const displayPlayer = soldData?.player || nominatedPlayer;
  const { stats, proj, loading } = usePlayerStats(displayPlayer?.sleeperPlayerId);

  const nominationOrderIds = draft?.nominationOrderIds || [];
  const priceNum     = parseInt(price) || 0;
  const nomTeam      = teams[currentNomination?.nominatingTeamId];
  const winningTeam  = teams[winTeamId];
  const winningTeamMax  = winningTeam ? maxBid(winningTeam) : null;
  const exceedsMax    = winningTeam && priceNum > 0 && priceNum > winningTeamMax;
  const exceedsBudget = winningTeam && priceNum > 0 && priceNum > (winningTeam.budgetRemaining ?? 200);

  // Kick off sold animation sequence when soldData arrives
  useEffect(() => {
    if (!soldData) { setSoldPhase(0); setProgress(0); return; }

    setSoldPhase(1);

    // Phase 1 → Phase 2 after 1.5s
    const t1 = setTimeout(() => {
      setSoldPhase(2);
      // Progress bar for 6.5s
      const duration = 6500;
      const tick = 50;
      let elapsed = 0;
      const bar = setInterval(() => {
        elapsed += tick;
        setProgress(Math.min(elapsed / duration, 1));
        if (elapsed >= duration) {
          clearInterval(bar);
          onSoldDone();
        }
      }, tick);
    }, 1500);

    return () => clearTimeout(t1);
  }, [soldData]);

  async function handleSell() {
    if (!winTeamId || priceNum < 1 || selling) return;
    if (exceedsBudget) {
      if (!window.confirm(`$${priceNum} exceeds ${winningTeam.name}'s remaining budget of $${winningTeam.budgetRemaining}. Record anyway?`)) return;
    } else if (exceedsMax) {
      if (!window.confirm(`$${priceNum} exceeds ${winningTeam.name}'s max bid of $${winningTeamMax} (they need $1 per remaining empty slot). Record anyway?`)) return;
    }
    setSelling(true);
    try {
      await onSell(currentNomination.playerId, winTeamId, price);
      setWinTeamId('');
      setPrice('');
    } catch (err) {
      alert(`Sell failed: ${err.message}`);
    } finally {
      setSelling(false);
    }
  }

  if (!displayPlayer) return null;

  return (
    <div className="no-overlay">

      {/* ── Left: Player card + stats (never changes) ── */}
      <div className="no-left">
        <div className="no-player-card">
          <div className="no-headshot">
            {displayPlayer.headshotUrl
              ? <img src={displayPlayer.headshotUrl} alt={displayPlayer.name} />
              : <div className="no-headshot-sil">{displayPlayer.position}</div>
            }
          </div>
          <div className="no-player-info">
            <span className={`no-pos-badge pos-${displayPlayer.position}`}>
              {displayPlayer.position}{displayPlayer.positionalRank}
            </span>
            <h1 className="no-player-name">{displayPlayer.name}</h1>
            <span className="no-nfl-team">{displayPlayer.nflTeam}</span>
            {soldData ? (
              <span className="no-sold-confirm">
                Sold to <strong>{soldData.team.name}</strong> for <strong>${soldData.price}</strong>
              </span>
            ) : nomTeam && (
              <span className="no-nominated-by">
                Nominated by {nomTeam.name}
                {nomTeam.ownerName && <span className="no-nominated-owner"> ({nomTeam.ownerName})</span>}
              </span>
            )}
          </div>
        </div>

        <div className="no-stats">
          {loading
            ? <p className="no-stats-loading">Loading stats…</p>
            : <PlayerStatsBody stats={stats} proj={proj} pos={displayPlayer.position} />
          }
        </div>

        {/* Sell controls — hidden during sold animation */}
        {!soldData && (
          <>
            <div className="no-sell">
              <p className="no-sell-heading">Winning Bid</p>
              <p className="no-sell-directive">
                {winTeamId
                  ? <span className="no-sell-selected">✓ {winningTeam?.name} selected</span>
                  : '← Select the winning team from the grid'
                }
              </p>
              {exceedsBudget && (
                <p className="no-bid-warning error">⚠ Exceeds budget (${winningTeam.budgetRemaining} left)</p>
              )}
              {!exceedsBudget && exceedsMax && (
                <p className="no-bid-warning">⚠ Exceeds max bid (${winningTeamMax})</p>
              )}
              <div className="no-price-row">
                <div className="no-price-wrap">
                  <span className="no-price-dollar">$</span>
                  <input
                    className="no-price-input"
                    type="number"
                    min="1"
                    placeholder="0"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSell()}
                    autoFocus
                  />
                </div>
                <button
                  className="no-sold-btn"
                  onClick={handleSell}
                  disabled={!winTeamId || priceNum < 1 || selling}
                >
                  {selling ? 'Saving…' : '✓ SOLD'}
                </button>
              </div>
            </div>
            <button className="no-cancel-btn" onClick={onCancelNomination}>
              ✕ Cancel Nomination
            </button>
          </>
        )}
      </div>

      {/* ── Right: 12-team grid OR enlarged winner ── */}
      {soldPhase === 2 && soldData
        ? <WinnerPanel team={soldData.team} newPlayerId={soldData.playerId} progress={progress} />
        : (
          <div className="no-teams-grid">
            {nominationOrderIds.map((teamId, idx) => {
              const team = teams[teamId];
              if (!team) return null;
              const max = maxBid(team);
              const isFull = Object.values(team.roster || {}).length >= TOTAL_DRAFT_SLOTS;
              const canAfford = priceNum === 0 || team.budgetRemaining >= priceNum;
              const isWinner = teamId === winTeamId;
              const isNominating = teamId === currentNomination?.nominatingTeamId;

              return (
                <div
                  key={teamId}
                  className={`no-team-card
                    ${isFull ? 'full' : 'clickable'}
                    ${!isFull && !canAfford ? 'dimmed' : ''}
                    ${isWinner ? 'winner' : ''}
                    ${isNominating && !isWinner ? 'nominating' : ''}
                  `}
                  onClick={() => !soldData && !isFull && setWinTeamId(isWinner ? '' : teamId)}
                  title={isFull ? 'Roster full' : undefined}
                >
                  <div className="no-team-header">
                    <span className="no-team-idx">{idx + 1}</span>
                    <div className="no-team-names">
                      <span className="no-team-name">{team.name}</span>
                      <span className="no-team-owner">{team.ownerName}</span>
                    </div>
                    {isNominating && <span className="no-nom-badge">NOM</span>}
                  </div>
                  <div className="no-team-stats">
                    <div className="no-stat">
                      <span className="no-stat-val budget">${team.budgetRemaining ?? 200}</span>
                      <span className="no-stat-label">Budget</span>
                    </div>
                    <div className="no-stat">
                      <span className="no-stat-val max">${max}</span>
                      <span className="no-stat-label">Max</span>
                    </div>
                  </div>
                  <div className="no-slot-pills">
                    {Object.entries(SLOT_LIMITS).map(([slot, limit]) => {
                      const filledCount = Object.values(team.roster || {})
                        .filter(p => p.slotType === slot).length;
                      return Array.from({ length: limit }, (_, i) => (
                        <span key={`${slot}${i}`} className={`no-slot-pill ${i < filledCount ? 'filled' : 'empty'}`}>
                          {slot}
                        </span>
                      ));
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {/* ── SOLD stamp — phase 1 overlay ── */}
      {soldPhase === 1 && <div className="no-sold-stamp">SOLD</div>}

    </div>
  );
}

// ── Enlarged winner team panel ────────────────────────────────────────────────

function WinnerPanel({ team, newPlayerId, progress }) {
  const playersBySlot = {};
  Object.entries(team.roster || {}).forEach(([id, p]) => {
    const slot = p.slotType || 'BN';
    if (!playersBySlot[slot]) playersBySlot[slot] = [];
    playersBySlot[slot].push({ id, ...p });
  });

  const spent = Object.values(team.roster || {}).reduce((s, p) => s + (p.pricePaid || 0), 0);

  // Flat ordered list of all slot instances
  const slotInstances = SLOT_ORDER.flatMap(slot =>
    Array.from({ length: SLOT_LIMITS[slot] }, (_, i) => ({
      slot,
      key: `${slot}-${i}`,
      player: (playersBySlot[slot] || [])[i] || null,
    }))
  );

  return (
    <div className="no-winner-panel">

      {/* Header card */}
      <div className="no-winner-header">
        <div className="no-winner-names">
          <span className="no-winner-team-name">{team.name}</span>
          <span className="no-winner-owner">{team.ownerName}</span>
        </div>
        <div className="no-winner-budget">
          <div className="no-winner-stat">
            <span className="no-winner-stat-val green">${team.budgetRemaining ?? 200}</span>
            <span className="no-winner-stat-label">Budget</span>
          </div>
          <div className="no-winner-stat">
            <span className="no-winner-stat-val">${spent}</span>
            <span className="no-winner-stat-label">Spent</span>
          </div>
          <div className="no-winner-stat">
            <span className="no-winner-stat-val amber">${maxBid(team)}</span>
            <span className="no-winner-stat-label">Max</span>
          </div>
        </div>
      </div>

      {/* Uniform slot tile grid */}
      <div className="no-winner-tiles">
        {slotInstances.map(({ slot, key, player }) => {
          const isNew = player?.id === newPlayerId;
          return (
            <div key={key} className={`no-wtile ${player ? 'filled' : 'empty'} ${isNew ? 'new-player' : ''}`}>
              <div className="no-wtile-top">
                <span className="no-wtile-slot">{slot}</span>
                {isNew && <span className="no-wtile-new">NEW</span>}
              </div>
              <span className="no-wtile-name">
                {player ? player.playerName : '—'}
              </span>
              <span className="no-wtile-price">
                {player ? `$${player.pricePaid}` : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div className="no-progress-bar">
        <div className="no-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
