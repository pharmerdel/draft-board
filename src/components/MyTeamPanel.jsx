import { useState } from 'react';
import './MyTeamPanel.css';

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];
const SLOT_LIMITS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 };
const TOTAL_DRAFT_SLOTS = 13;

function maxBid(team) {
  const filled = Object.values(team.roster || {}).length;
  const empty  = Math.max(0, TOTAL_DRAFT_SLOTS - filled);
  return Math.max(1, (team.budgetRemaining || 0) - (empty - 1));
}

export default function MyTeamPanel({ team, players, watchlist, onToggleWatch, selectedTeamId, nominatingTeamId, currentNomination, onNominate }) {
  if (!team) {
    return (
      <div className="my-team-panel">
        <p className="my-team-empty">No team selected.</p>
      </div>
    );
  }

  const [confirmPlayer, setConfirmPlayer] = useState(null); // { id, name }

  const isMyTurn = nominatingTeamId === selectedTeamId && !currentNomination;

  const roster = team.roster || {};
  const rosterEntries = Object.entries(roster);
  const totalSpent = rosterEntries.reduce((sum, [, p]) => sum + (p.pricePaid || 0), 0);
  const filled = rosterEntries.length;

  // Group by slot
  const playersBySlot = {};
  rosterEntries.forEach(([id, player]) => {
    const slot = player.slotType || 'BN';
    if (!playersBySlot[slot]) playersBySlot[slot] = [];
    playersBySlot[slot].push({ id, ...player });
  });

  return (
    <div className="my-team-panel">

      {/* Stats bar */}
      <div className="my-team-stats">
        <div className="my-stat">
          <span className="my-stat-label">Budget Left</span>
          <span className="my-stat-value green">${team.budgetRemaining ?? 200}</span>
        </div>
        <div className="my-stat">
          <span className="my-stat-label">Spent</span>
          <span className="my-stat-value">${totalSpent}</span>
        </div>
        <div className="my-stat">
          <span className="my-stat-label">Max Bid</span>
          <span className="my-stat-value yellow">${maxBid(team)}</span>
        </div>
        <div className="my-stat">
          <span className="my-stat-label">Roster</span>
          <span className="my-stat-value">{filled}/{TOTAL_DRAFT_SLOTS}</span>
        </div>
      </div>

      {/* Roster */}
      <div className="my-team-roster">
        {SLOT_ORDER.map(slot => {
          const limit = SLOT_LIMITS[slot];
          const slotPlayers = playersBySlot[slot] || [];
          const empties = Math.max(0, limit - slotPlayers.length);
          const rows = [
            ...slotPlayers.map((p, i) => ({ type: 'player', p, i })),
            ...Array.from({ length: empties }, (_, i) => ({ type: 'empty', i: slotPlayers.length + i })),
          ];

          return rows.map(({ type, p, i }) => (
            <div key={`${slot}-${i}`} className="my-slot-row">
              <span className="my-slot-label">{slot}</span>
              {type === 'player'
                ? <div className="my-player-row">
                    <span className={`my-pos-badge pos-${p.position}`}>{p.position}</span>
                    <span className="my-player-name">{p.playerName}</span>
                    <span className="my-player-nfl">{p.nflTeam}</span>
                    <span className="my-player-price">${p.pricePaid}</span>
                  </div>
                : <div className="my-empty-row">
                    <span className="my-empty-label">— Empty —</span>
                  </div>
              }
            </div>
          ));
        })}
      </div>

      {/* Watchlist */}
      <div className="my-watchlist">
        <span className="watchlist-heading">⭐ Watchlist</span>
        {Object.keys(watchlist || {}).length === 0 ? (
          <p className="watchlist-empty">Star players in the Players tab to track them here.</p>
        ) : (
          <div className="watchlist-rows">
            {Object.keys(watchlist).map(playerId => {
              const p = players?.[playerId];
              if (!p) return null;
              const nominatable = isMyTurn && p.status === 'available';
              return (
                <div key={playerId} className={`watchlist-row ${p.status === 'sold' ? 'sold' : ''}`}>
                  <span className={`my-pos-badge pos-${p.position}`}>{p.position}</span>
                  {nominatable
                    ? <button className="watchlist-nominate-link" onClick={() => setConfirmPlayer({ id: playerId, name: p.name })}>{p.name}</button>
                    : <span className="watchlist-player-name">{p.name}</span>
                  }
                  <span className="watchlist-nfl">{p.nflTeam}</span>
                  {p.status === 'sold'
                    ? <span className="watchlist-sold">SOLD ${p.soldPrice}</span>
                    : <button className="watch-btn watched" onClick={() => onToggleWatch(playerId)}>★</button>
                  }
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Nominate confirmation popup */}
      {confirmPlayer && (
        <div className="watchlist-confirm-overlay" onClick={() => setConfirmPlayer(null)}>
          <div className="watchlist-confirm-box" onClick={e => e.stopPropagation()}>
            <p className="watchlist-confirm-text">Nominate <strong>{confirmPlayer.name}</strong>?</p>
            <div className="watchlist-confirm-actions">
              <button
                className="watchlist-confirm-yes"
                onClick={() => { onNominate(confirmPlayer.id); setConfirmPlayer(null); }}
              >
                Nominate
              </button>
              <button className="watchlist-confirm-no" onClick={() => setConfirmPlayer(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
