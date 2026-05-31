import './MyTeamPanel.css';

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];
const SLOT_LIMITS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 };
const TOTAL_DRAFT_SLOTS = 13;

function maxBid(team) {
  const filled = Object.values(team.roster || {}).length;
  const empty  = Math.max(0, TOTAL_DRAFT_SLOTS - filled);
  return Math.max(1, (team.budgetRemaining || 0) - (empty - 1));
}

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
          const players = playersBySlot[slot] || [];
          const empties = Math.max(0, limit - players.length);

          return (
            <div key={slot} className="my-slot-group">
              <span className="my-slot-label">{slot}</span>
              <div className="my-slot-players">
                {players.map(p => (
                  <div key={p.id} className="my-player-row">
                    <span className={`my-pos-badge pos-${p.position}`}>{p.position}</span>
                    <span className="my-player-name">{p.playerName}</span>
                    <span className="my-player-nfl">{p.nflTeam}</span>
                    <span className="my-player-price">${p.pricePaid}</span>
                  </div>
                ))}
                {Array.from({ length: empties }).map((_, i) => (
                  <div key={`e${i}`} className="my-empty-row">
                    <span className="my-empty-label">— Empty —</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Watchlist placeholder */}
      <div className="my-watchlist-placeholder">
        <span className="watchlist-label">⭐ Watchlist</span>
        <span className="watchlist-hint">Coming in Phase 5</span>
      </div>

    </div>
  );
}
