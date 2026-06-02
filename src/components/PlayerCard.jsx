import { usePlayerStats, PlayerStatsBody } from './PlayerStats';
import './PlayerCard.css';

export default function PlayerCard({ player, onClose }) {
  const { stats, proj, loading } = usePlayerStats(player.sleeperPlayerId);
  const pos = player.position;

  return (
    <div className="pc-overlay" onClick={onClose}>
      <div className="pc-card" onClick={e => e.stopPropagation()}>

        <div className="pc-header">
          <div className="pc-headshot">
            {player.headshotUrl
              ? <img src={player.headshotUrl} alt={player.name} />
              : <div className="pc-headshot-sil">{pos}</div>
            }
          </div>
          <div className="pc-header-info">
            <div className="pc-header-top">
              <span className={`pc-pos-badge pos-${pos}`}>{pos}{player.positionalRank}</span>
              <span className="pc-rank">Overall #{player.overallRank}</span>
            </div>
            <h2 className="pc-name">{player.name}</h2>
            <span className="pc-team">{player.nflTeam}</span>
            {player.status === 'sold' && (
              <span className="pc-sold-badge">Sold ${player.soldPrice}</span>
            )}
          </div>
          <button className="pc-close" onClick={onClose}>✕</button>
        </div>

        <div className="pc-body">
          {loading
            ? <p className="pc-loading">Loading stats…</p>
            : <PlayerStatsBody stats={stats} proj={proj} pos={pos} />
          }
        </div>
      </div>
    </div>
  );
}
