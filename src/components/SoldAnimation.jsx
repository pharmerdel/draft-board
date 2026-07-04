import { useState, useEffect } from 'react';
import { usePlayerStats, PlayerStatsBody } from './PlayerStats';
import './SoldAnimation.css';

const SLOT_ORDER  = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];
const SLOT_LIMITS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 };
const TOTAL_DRAFT_SLOTS = 13;

function maxBid(team) {
  const filled = Object.values(team.roster || {}).length;
  const empty  = Math.max(0, TOTAL_DRAFT_SLOTS - filled);
  return Math.max(1, (team.budgetRemaining || 0) - (empty - 1));
}

// PHASE 1 — 1.5s diagonal SOLD stamp
function SoldStamp({ player, price }) {
  return (
    <div className="sa-stamp-screen">
      <div className="sa-stamp-player">
        <div className="sa-stamp-headshot">
          {player.headshotUrl
            ? <img src={player.headshotUrl} alt={player.name} />
            : <div className="sa-stamp-sil">{player.position}</div>
          }
        </div>
        <div className="sa-stamp-info">
          <span className={`sa-stamp-pos pos-${player.position}`}>
            {player.position}{player.positionalRank}
          </span>
          <h1 className="sa-stamp-name">{player.name}</h1>
          <span className="sa-stamp-nfl">{player.nflTeam}</span>
          <span className="sa-stamp-price">${price}</span>
        </div>
      </div>
      <div className="sa-sold-diagonal">SOLD</div>
    </div>
  );
}

// PHASE 2 — 6s info panel
function SoldInfo({ player, team, price, newPlayerId, onDone }) {
  const { stats, proj, loading } = usePlayerStats(player.sleeperPlayerId);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 6000;
    const interval = 50;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      setProgress(Math.min(elapsed / duration, 1));
      if (elapsed >= duration) {
        clearInterval(timer);
        onDone();
      }
    }, interval);
    return () => clearInterval(timer);
  }, []);

  const playersBySlot = {};
  Object.entries(team.roster || {}).forEach(([id, p]) => {
    const slot = p.slotType || 'BN';
    if (!playersBySlot[slot]) playersBySlot[slot] = [];
    playersBySlot[slot].push({ id, ...p });
  });

  return (
    <div className="sa-info-screen">

      {/* ── Left: Player card + stats ── */}
      <div className="sa-info-left">
        <div className="sa-info-player-header">
          <div className="sa-info-headshot">
            {player.headshotUrl
              ? <img src={player.headshotUrl} alt={player.name} />
              : <div className="sa-info-sil">{player.position}</div>
            }
          </div>
          <div className="sa-info-player-details">
            <span className={`sa-info-pos pos-${player.position}`}>
              {player.position}{player.positionalRank}
            </span>
            <h2 className="sa-info-name">{player.name}</h2>
            <span className="sa-info-nfl">{player.nflTeam}</span>
            <span className="sa-info-price-paid">Sold for <strong>${price}</strong></span>
          </div>
        </div>

        <div className="sa-info-stats">
          {loading
            ? <p className="sa-stats-loading">Loading stats…</p>
            : <PlayerStatsBody stats={stats} proj={proj} pos={player.position} />
          }
        </div>
      </div>

      {/* ── Right: Team roster ── */}
      <div className="sa-info-right">
        <div className="sa-team-header">
          <div className="sa-team-names">
            <span className="sa-team-name">{team.name}</span>
            <span className="sa-team-owner">{team.ownerName}</span>
          </div>
          <div className="sa-team-budget-info">
            <div className="sa-budget-pill">
              <span className="sa-budget-val">${team.budgetRemaining ?? 200}</span>
              <span className="sa-budget-label">Remaining</span>
            </div>
            <div className="sa-budget-pill">
              <span className="sa-budget-val max">${maxBid(team)}</span>
              <span className="sa-budget-label">Max Bid</span>
            </div>
            <div className="sa-budget-pill">
              <span className="sa-budget-val">{Object.values(team.roster || {}).length}/{TOTAL_DRAFT_SLOTS}</span>
              <span className="sa-budget-label">Roster</span>
            </div>
          </div>
        </div>

        <div className="sa-roster">
          {SLOT_ORDER.map(slot => {
            const limit   = SLOT_LIMITS[slot];
            const slotPlayers = playersBySlot[slot] || [];
            const empties = Math.max(0, limit - slotPlayers.length);

            return [
              ...slotPlayers.map((p, i) => (
                <div key={`${slot}-${i}`} className={`sa-roster-row ${p.id === newPlayerId ? 'new-player' : ''}`}>
                  <span className="sa-slot-label">{slot}</span>
                  <span className={`sa-pos-badge pos-${p.position}`}>{p.position}</span>
                  <span className="sa-player-name">{p.playerName}</span>
                  <span className="sa-player-nfl">{p.nflTeam}</span>
                  <span className="sa-player-price">${p.pricePaid}</span>
                  {p.id === newPlayerId && <span className="sa-new-badge">NEW</span>}
                </div>
              )),
              ...Array.from({ length: empties }, (_, i) => (
                <div key={`${slot}-e${i}`} className="sa-roster-row empty">
                  <span className="sa-slot-label">{slot}</span>
                  <span className="sa-empty-label">— Empty —</span>
                </div>
              )),
            ];
          })}
        </div>
      </div>

      {/* Progress bar */}
      <div className="sa-progress-bar">
        <div className="sa-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SoldAnimation({ player, team, price, newPlayerId, onDone }) {
  const [phase, setPhase] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setPhase(2), 1500);
    return () => clearTimeout(t);
  }, []);

  if (phase === 1) return <SoldStamp player={player} price={price} />;
  return <SoldInfo player={player} team={team} price={price} newPlayerId={newPlayerId} onDone={onDone} />;
}
