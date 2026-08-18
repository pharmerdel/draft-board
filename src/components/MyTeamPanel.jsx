import { SLOT_LIMITS, SLOT_ORDER, TOTAL_DRAFT_SLOTS, maxBidDisplay } from '../utils/rosterRules';
import './MyTeamPanel.css';

export default function MyTeamPanel({ team }) {
  if (!team) {
    return (
      <div className="my-team-panel">
        <p className="my-team-empty">No team selected.</p>
      </div>
    );
  }

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
          <span className="my-stat-value yellow">{maxBidDisplay(team)}</span>
        </div>
        <div className="my-stat">
          <span className="my-stat-label">Roster</span>
          <span className="my-stat-value">{filled}/{TOTAL_DRAFT_SLOTS}</span>
        </div>
      </div>

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
      </div>{/* end my-team-roster */}
    </div>
  );
}
