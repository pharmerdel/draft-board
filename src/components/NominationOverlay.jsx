import { useState } from 'react';
import { usePlayerStats, PlayerStatsBody } from './PlayerStats';
import './NominationOverlay.css';

const TOTAL_DRAFT_SLOTS = 13;
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
}) {
  const [winTeamId, setWinTeamId] = useState('');
  const [price, setPrice]         = useState('');
  const [selling, setSelling]     = useState(false);

  const { stats, proj, loading } = usePlayerStats(nominatedPlayer.sleeperPlayerId);
  const nomTeam = teams[currentNomination?.nominatingTeamId];
  const nominationOrderIds = draft?.nominationOrderIds || [];
  const priceNum = parseInt(price) || 0;

  async function handleSell() {
    if (!winTeamId || priceNum < 1 || selling) return;
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

  return (
    <div className="no-overlay">

      {/* ── Left: Player card + sell controls ── */}
      <div className="no-left">

        <div className="no-player-card">
          <div className="no-headshot">
            {nominatedPlayer.headshotUrl
              ? <img src={nominatedPlayer.headshotUrl} alt={nominatedPlayer.name} />
              : <div className="no-headshot-sil">{nominatedPlayer.position}</div>
            }
          </div>
          <div className="no-player-info">
            <span className={`no-pos-badge pos-${nominatedPlayer.position}`}>
              {nominatedPlayer.position}{nominatedPlayer.positionalRank}
            </span>
            <h1 className="no-player-name">{nominatedPlayer.name}</h1>
            <span className="no-nfl-team">{nominatedPlayer.nflTeam}</span>
            {nomTeam && (
              <span className="no-nominated-by">Nominated by {nomTeam.name}</span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="no-stats">
          {loading
            ? <p className="no-stats-loading">Loading stats…</p>
            : <PlayerStatsBody stats={stats} proj={proj} pos={nominatedPlayer.position} />
          }
        </div>

        {/* Sell controls */}
        <div className="no-sell">
          <p className="no-sell-heading">Winning Bid</p>

          <select
            className="no-sell-select"
            value={winTeamId}
            onChange={e => setWinTeamId(e.target.value)}
          >
            <option value="">Select winning team…</option>
            {nominationOrderIds.map(tid => {
              const t = teams[tid];
              if (!t) return null;
              return (
                <option key={tid} value={tid}>
                  {t.name} (${t.budgetRemaining})
                </option>
              );
            })}
          </select>

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
      </div>

      {/* ── Right: 12-team grid ── */}
      <div className="no-teams-grid">
        {nominationOrderIds.map((teamId, idx) => {
          const team = teams[teamId];
          if (!team) return null;
          const max = maxBid(team);
          const canAfford = priceNum === 0 || team.budgetRemaining >= priceNum;
          const isWinner = teamId === winTeamId;
          const isNominating = teamId === currentNomination?.nominatingTeamId;

          return (
            <div
              key={teamId}
              className={`no-team-card
                ${!canAfford ? 'dimmed' : ''}
                ${isWinner ? 'winner' : ''}
                ${isNominating ? 'nominating' : ''}
              `}
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
                    <span
                      key={`${slot}${i}`}
                      className={`no-slot-pill ${i < filledCount ? 'filled' : 'empty'}`}
                    >
                      {slot}
                    </span>
                  ));
                })}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
