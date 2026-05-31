import { useEffect } from 'react';
import './RosterModal.css';

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];
const SLOT_LIMITS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 };
const TOTAL_DRAFT_SLOTS = 13;

function maxBid(team) {
  const filled = Object.values(team.roster || {}).length;
  const empty  = Math.max(0, TOTAL_DRAFT_SLOTS - filled);
  return Math.max(1, (team.budgetRemaining || 0) - (empty - 1));
}

export default function RosterModal({ team, teamId, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!team) return null;

  const roster = team.roster || {};
  const rosterEntries = Object.entries(roster);
  const totalSpent = rosterEntries.reduce((sum, [, p]) => sum + (p.pricePaid || 0), 0);

  // Group players by slot type, then build full slot list with empties
  const playersBySlot = {};
  rosterEntries.forEach(([playerId, player]) => {
    const slot = player.slotType || 'BN';
    if (!playersBySlot[slot]) playersBySlot[slot] = [];
    playersBySlot[slot].push({ playerId, ...player });
  });

  return (
    <div className="roster-modal-overlay" onClick={onClose}>
      <div className="roster-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="roster-modal-header">
          <div className="roster-modal-team-info">
            <h2 className="roster-modal-team-name">{team.name}</h2>
            <span className="roster-modal-owner">{team.ownerName}</span>
          </div>
          <div className="roster-modal-stats">
            <div className="roster-stat">
              <span className="roster-stat-label">Budget Left</span>
              <span className="roster-stat-value green">${team.budgetRemaining ?? 200}</span>
            </div>
            <div className="roster-stat">
              <span className="roster-stat-label">Spent</span>
              <span className="roster-stat-value">${totalSpent}</span>
            </div>
            <div className="roster-stat">
              <span className="roster-stat-label">Max Bid</span>
              <span className="roster-stat-value yellow">${maxBid(team)}</span>
            </div>
            <div className="roster-stat">
              <span className="roster-stat-label">Roster</span>
              <span className="roster-stat-value">{rosterEntries.length}/{TOTAL_DRAFT_SLOTS}</span>
            </div>
          </div>
          <button className="roster-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Roster slots */}
        <div className="roster-modal-body">
          {SLOT_ORDER.map(slot => {
            const limit = SLOT_LIMITS[slot];
            const players = playersBySlot[slot] || [];
            const empties = Math.max(0, limit - players.length);

            return (
              <div key={slot} className="roster-slot-group">
                <span className="slot-group-label">{slot}</span>
                <div className="slot-group-players">
                  {players.map(p => (
                    <div key={p.playerId} className="roster-player-row">
                      <span className={`roster-pos-badge pos-${p.position}`}>{p.position}</span>
                      <span className="roster-player-name">{p.playerName}</span>
                      <span className="roster-nfl-team">{p.nflTeam}</span>
                      <span className="roster-price">${p.pricePaid}</span>
                    </div>
                  ))}
                  {Array.from({ length: empties }).map((_, i) => (
                    <div key={`empty-${i}`} className="roster-empty-row">
                      <span className="roster-empty-label">— Empty —</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
