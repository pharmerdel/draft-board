import { useState, useMemo } from 'react';
import Fuse from 'fuse.js';
import './NominationSearch.css';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];

export default function NominationSearch({ players, onNominate }) {
  const [query, setQuery]         = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [nominating, setNominating] = useState(null); // playerId being nominated

  const availablePlayers = useMemo(() =>
    Object.entries(players)
      .map(([id, p]) => ({ id, ...p }))
      .filter(p => p.status === 'available')
      .filter(p => posFilter === 'ALL' || p.position === posFilter)
      .sort((a, b) => a.overallRank - b.overallRank),
  [players, posFilter]);

  const fuse = useMemo(() => new Fuse(availablePlayers, {
    keys: ['name', 'nflTeam'],
    threshold: 0.35,
  }), [availablePlayers]);

  const results = query.trim()
    ? fuse.search(query).map(r => r.item)
    : availablePlayers;

  async function handleNominate(playerId) {
    setNominating(playerId);
    try {
      await onNominate(playerId);
    } finally {
      setNominating(null);
    }
  }

  return (
    <div className="nom-search">
      <p className="nom-search-prompt">Search for a player to nominate</p>

      <input
        className="nom-search-input"
        type="text"
        placeholder="Player name or NFL team…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        autoFocus
      />

      <div className="nom-search-filters">
        {POSITIONS.map(pos => (
          <button
            key={pos}
            className={`pos-filter-btn ${posFilter === pos ? 'active' : ''}`}
            onClick={() => setPosFilter(pos)}
          >
            {pos}
          </button>
        ))}
      </div>

      <div className="nom-search-results">
        {results.slice(0, 30).map(p => (
          <div key={p.id} className="nom-search-row">
            <span className={`nom-search-pos pos-${p.position}`}>
              {p.position}{p.positionalRank}
            </span>
            <span className="nom-search-name">{p.name}</span>
            <span className="nom-search-nfl">{p.nflTeam}</span>
            <button
              className="nom-search-btn"
              onClick={() => handleNominate(p.id)}
              disabled={nominating !== null}
            >
              {nominating === p.id ? '…' : 'Nominate'}
            </button>
          </div>
        ))}
        {results.length === 0 && (
          <p className="nom-search-empty">No available players found.</p>
        )}
      </div>
    </div>
  );
}
