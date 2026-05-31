import { useState, useMemo } from 'react';
import Fuse from 'fuse.js';
import './CenterColumn.css';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];

export default function CenterColumn({
  draft, teams, players, nominatedPlayer, currentNomination,
  nominatingTeamId, onNominate, onSell, onCancelNomination,
}) {
  const [query, setQuery]         = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [showSold, setShowSold]   = useState(false);
  const [winTeamId, setWinTeamId] = useState('');
  const [price, setPrice]         = useState('');
  const [selling, setSelling]     = useState(false);

  const nominatingTeam = teams[nominatingTeamId];

  // Build searchable player list
  const playerList = useMemo(() => {
    return Object.entries(players)
      .map(([id, p]) => ({ id, ...p }))
      .filter(p => showSold || p.status !== 'sold')
      .filter(p => posFilter === 'ALL' || p.position === posFilter)
      .sort((a, b) => a.overallRank - b.overallRank);
  }, [players, showSold, posFilter]);

  const fuse = useMemo(() => new Fuse(playerList, {
    keys: ['name', 'nflTeam'],
    threshold: 0.35,
  }), [playerList]);

  const results = query.trim()
    ? fuse.search(query).map(r => r.item)
    : playerList;

  async function handleSell() {
    if (!winTeamId || !price || parseInt(price) < 1) return;
    setSelling(true);
    try {
      await onSell(currentNomination.playerId, winTeamId, price);
      setWinTeamId('');
      setPrice('');
    } catch (err) {
      console.error('Sell failed:', err);
      alert(`Sell failed: ${err.message}`);
    } finally {
      setSelling(false);
    }
  }

  // ── ON THE BLOCK ──────────────────────────────────────────────────────────
  if (nominatedPlayer && currentNomination) {
    const nomTeam = teams[currentNomination.nominatingTeamId];

    return (
      <div className="center-col">
        <h2 className="col-heading">
          On the Block
          <button className="cancel-nom-btn" onClick={onCancelNomination}>
            ✕ Cancel Nomination
          </button>
        </h2>

        <div className="on-the-block">
          {/* Headshot / silhouette */}
          <div className="player-headshot">
            {nominatedPlayer.headshotUrl
              ? <img src={nominatedPlayer.headshotUrl} alt={nominatedPlayer.name} />
              : <div className="headshot-silhouette">{nominatedPlayer.position}</div>
            }
          </div>

          <div className="player-details">
            <span className={`player-pos-badge pos-${nominatedPlayer.position}`}>
              {nominatedPlayer.position}{nominatedPlayer.positionalRank}
            </span>
            <h1 className="player-name">{nominatedPlayer.name}</h1>
            <span className="player-nfl-team">{nominatedPlayer.nflTeam}</span>
            {nominatedPlayer.projectedValue && (
              <span className="player-proj-value">Proj: ${nominatedPlayer.projectedValue}</span>
            )}
            <span className="nominated-by">
              Nominated by {nomTeam?.name}
            </span>
          </div>
        </div>

        {/* Sell controls */}
        <div className="sell-controls">
          <h3 className="sell-heading">Winning Bid</h3>
          <div className="sell-row">
            <select
              className="sell-select"
              value={winTeamId}
              onChange={e => setWinTeamId(e.target.value)}
            >
              <option value="">Select winning team…</option>
              {Object.entries(teams)
                .sort((a, b) => a[1].nominationOrder - b[1].nominationOrder)
                .map(([tid, t]) => (
                  <option key={tid} value={tid}>{t.name} (${t.budgetRemaining})</option>
                ))}
            </select>

            <div className="price-input-wrap">
              <span className="price-dollar">$</span>
              <input
                className="price-input"
                type="number"
                min="1"
                placeholder="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>

            <button
              className="sold-btn"
              onClick={handleSell}
              disabled={!winTeamId || !price || selling}
            >
              {selling ? 'Saving…' : '✓ SOLD'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SEARCH / NOMINATION ───────────────────────────────────────────────────
  return (
    <div className="center-col">
      <h2 className="col-heading">
        Nominate a Player
        {nominatingTeam && (
          <span className="nom-turn-label"> — {nominatingTeam.name}'s pick</span>
        )}
      </h2>

      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search players…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="search-filters">
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
          <input
            type="checkbox"
            checked={showSold}
            onChange={e => setShowSold(e.target.checked)}
          />
          Show sold
        </label>
      </div>

      <div className="search-results">
        {results.slice(0, 50).map(player => (
          <div
            key={player.id}
            className={`search-result-row ${player.status === 'sold' ? 'sold' : ''}`}
            onClick={() => player.status === 'available' && onNominate(player.id)}
          >
            <span className={`result-pos pos-${player.position}`}>
              {player.position}{player.positionalRank}
            </span>
            <span className="result-name">{player.name}</span>
            <span className="result-team">{player.nflTeam}</span>
            {player.status === 'sold' && (
              <span className="result-sold-info">
                {teams[player.soldTo]?.name} · ${player.soldPrice}
              </span>
            )}
            {player.projectedValue && player.status !== 'sold' && (
              <span className="result-value">${player.projectedValue}</span>
            )}
            {player.status === 'available' && (
              <button className="nominate-btn">Nominate</button>
            )}
          </div>
        ))}
        {results.length === 0 && (
          <p className="no-results">No players found.</p>
        )}
      </div>
    </div>
  );
}
