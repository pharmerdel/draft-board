import { X } from 'lucide-react';
import './TeamDetailModal.css';

const SLOT_ORDER  = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];
const SLOT_LIMITS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 };
const TOTAL_DRAFT_SLOTS = 13;

function maxBid(team) {
  const filled = Object.values(team.roster || {}).length;
  const empty  = Math.max(0, TOTAL_DRAFT_SLOTS - filled);
  return Math.max(1, (team.budgetRemaining || 0) - (empty - 1));
}

export default function TeamDetailModal({ team, onClose }) {
  const playersBySlot = {};
  Object.entries(team.roster || {}).forEach(([id, p]) => {
    const slot = p.slotType || 'BN';
    if (!playersBySlot[slot]) playersBySlot[slot] = [];
    playersBySlot[slot].push({ id, ...p });
  });

  const spent = Object.values(team.roster || {}).reduce((s, p) => s + (p.pricePaid || 0), 0);
  const filled = Object.values(team.roster || {}).length;

  const slotInstances = SLOT_ORDER.flatMap(slot =>
    Array.from({ length: SLOT_LIMITS[slot] }, (_, i) => ({
      slot,
      key: `${slot}-${i}`,
      player: (playersBySlot[slot] || [])[i] || null,
    }))
  );

  return (
    <div className="tdm-overlay" onClick={onClose}>
      <div className="tdm-panel" onClick={e => e.stopPropagation()}>

        <div className="tdm-header">
          <div className="tdm-names">
            <span className="tdm-team-name">{team.name}</span>
            <span className="tdm-owner">{team.ownerName}</span>
          </div>
          <div className="tdm-budget">
            <div className="tdm-stat">
              <span className="tdm-stat-val green">${team.budgetRemaining ?? 200}</span>
              <span className="tdm-stat-label">Budget</span>
            </div>
            <div className="tdm-stat">
              <span className="tdm-stat-val">${spent}</span>
              <span className="tdm-stat-label">Spent</span>
            </div>
            <div className="tdm-stat">
              <span className="tdm-stat-val amber">${maxBid(team)}</span>
              <span className="tdm-stat-label">Max</span>
            </div>
            <div className="tdm-stat">
              <span className="tdm-stat-val">{filled}/{TOTAL_DRAFT_SLOTS}</span>
              <span className="tdm-stat-label">Roster</span>
            </div>
          </div>
          <button className="tdm-close" onClick={onClose} aria-label="Close team details">
            <X size={20} strokeWidth={2.2} />
          </button>
        </div>

        <div className="tdm-tiles">
          {slotInstances.map(({ slot, key, player }) => (
            <div key={key} className={`tdm-tile ${player ? 'filled' : 'empty'}`}>
              <div className="tdm-tile-top">
                <span className="tdm-tile-slot">{slot}</span>
              </div>
              <span className="tdm-tile-name">
                {player ? player.playerName : '—'}
              </span>
              <span className="tdm-tile-price">
                {player ? `$${player.pricePaid}` : ''}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
