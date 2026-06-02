import { useState } from 'react';
import MyTeamPanel from './MyTeamPanel';
import './RightColumn.css';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];

export default function RightColumn({ players, teams, log, onUndo, selectedTeamId }) {
  const [tab, setTab]           = useState('log');
  // Note: no My Team tab — commissioner doesn't have a team
  const [posFilter, setPosFilter] = useState('ALL');
  const [showSold, setShowSold]   = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  // ── LOG TAB ───────────────────────────────────────────────────────────────
  const logEntries = Object.entries(log)
    .filter(([, e]) => e.type === 'sold')
    .sort((a, b) => b[1].timestamp - a[1].timestamp);

  // ── PLAYERS TAB ───────────────────────────────────────────────────────────
  const playerList = Object.entries(players)
    .map(([id, p]) => ({ id, ...p }))
    .filter(p => showSold || p.status !== 'sold')
    .filter(p => posFilter === 'ALL' || p.position === posFilter)
    .sort((a, b) => a.overallRank - b.overallRank);

  return (
    <div className="right-col">
      <div className="right-tabs">
        <button
          className={`right-tab ${tab === 'log' ? 'active' : ''}`}
          onClick={() => setTab('log')}
        >
          Draft Log
        </button>
        <button
          className={`right-tab ${tab === 'players' ? 'active' : ''}`}
          onClick={() => setTab('players')}
        >
          Players
        </button>
      </div>

      {/* ── LOG ── */}
      {tab === 'log' && (
        <div className="right-content">
          <div className="log-undo-row">
            <span className="log-count">{logEntries.length} picks</span>
            {!confirmUndo
              ? <button className="undo-btn" onClick={() => setConfirmUndo(true)} disabled={logEntries.length === 0}>↩ Undo last</button>
              : (
                <span className="undo-confirm-row">
                  <span style={{ color: '#fca5a5', fontSize: '0.85rem' }}>Undo last pick?</span>
                  <button className="undo-confirm-yes" onClick={() => { onUndo(); setConfirmUndo(false); }}>Yes</button>
                  <button className="undo-confirm-no" onClick={() => setConfirmUndo(false)}>No</button>
                </span>
              )
            }
          </div>

          <div className="log-list">
            {logEntries.length === 0 && (
              <p className="log-empty">No picks yet.</p>
            )}
            {logEntries.map(([id, entry]) => {
              const delta = entry.delta;
              return (
                <div key={id} className="log-entry">
                  <div className="log-entry-top">
                    <span className={`log-pos pos-${entry.position}`}>{entry.position}</span>
                    <span className="log-player-name">{entry.playerName}</span>
                    <span className="log-nfl-team">{entry.nflTeam}</span>
                  </div>
                  <div className="log-entry-bottom">
                    <span className="log-team-name">{entry.teamName}</span>
                    <span className="log-price">${entry.pricePaid}</span>
                    {delta != null && (
                      <span className={`log-delta ${delta > 0 ? 'over' : 'under'}`}>
                        {delta > 0 ? `+$${delta} over` : `-$${Math.abs(delta)} under`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PLAYERS ── */}
      {tab === 'players' && (
        <div className="right-content">
          <div className="right-filters">
            {POSITIONS.map(pos => (
              <button
                key={pos}
                className={`pos-filter-btn ${posFilter === pos ? 'active' : ''}`}
                onClick={() => setPosFilter(pos)}
              >
                {pos}
              </button>
            ))}
            <label className="show-sold-toggle">
              <input type="checkbox" checked={showSold} onChange={e => setShowSold(e.target.checked)} />
              Sold
            </label>
          </div>

          <div className="players-list">
            {playerList.map(player => (
              <div key={player.id} className={`player-row ${player.status === 'sold' ? 'sold' : ''}`}>
                <span className={`result-pos pos-${player.position}`}>
                  {player.position}{player.positionalRank}
                </span>
                <span className="player-row-name">{player.name}</span>
                <span className="player-row-team">{player.nflTeam}</span>
                {player.status === 'sold'
                  ? <span className="player-row-sold">{teams[player.soldTo]?.name} · ${player.soldPrice}</span>
                  : player.projectedValue && <span className="player-row-value">${player.projectedValue}</span>
                }
              </div>
            ))}
            {playerList.length === 0 && <p className="log-empty">No players.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
