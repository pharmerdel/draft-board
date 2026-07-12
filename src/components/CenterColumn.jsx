import { useState, useMemo } from 'react';
import Fuse from 'fuse.js';
import { Check, Info, Plus, X } from 'lucide-react';
import PlayerCard from './PlayerCard';
import './CenterColumn.css';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const ADD_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function injClass(s) {
  if (!s) return null;
  const l = s.toLowerCase();
  if (l === 'questionable') return 'q';
  if (l === 'doubtful')     return 'd';
  if (l === 'out')          return 'out';
  if (l === 'ir')           return 'ir';
  if (l.startsWith('pup'))  return 'pup';
  return 'dnr';
}
function injAbbr(s) {
  if (!s) return '';
  const l = s.toLowerCase();
  if (l === 'questionable') return 'Q';
  if (l === 'doubtful')     return 'D';
  if (l === 'out')          return 'OUT';
  if (l === 'ir')           return 'IR';
  if (l.startsWith('pup'))  return 'PUP';
  return s.slice(0, 3).toUpperCase();
}

export default function CenterColumn({
  draft, teams, players, nominatedPlayer, currentNomination,
  nominatingTeamId, onNominate, onSell, onCancelNomination, onAddPlayer,
  commissionerMode,
}) {
  const [query, setQuery]         = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [showSold, setShowSold]   = useState(false);
  const [winTeamId, setWinTeamId] = useState('');
  const [price, setPrice]         = useState('');
  const [selling, setSelling]     = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [cardPlayer, setCardPlayer] = useState(null);
  const [addName, setAddName]         = useState('');
  const [addPos, setAddPos]           = useState('RB');
  const [addTeam, setAddTeam]         = useState('');
  const [adding, setAdding]           = useState(false);

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

  async function handleAdd() {
    if (!addName.trim() || adding) return;
    setAdding(true);
    try {
      await onAddPlayer({ name: addName, position: addPos, nflTeam: addTeam });
      setAddName('');
      setAddTeam('');
      setAddPos('RB');
      setShowAddForm(false);
    } finally {
      setAdding(false);
    }
  }

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

  // ── ON THE BLOCK (participant view only — commissioner uses NominationOverlay) ──
  if (nominatedPlayer && currentNomination && !commissionerMode) {
    const nomTeam = teams[currentNomination.nominatingTeamId];

    return (
      <div className="center-col">
        <h2 className="col-heading">
          On the Block
          <button className="cancel-nom-btn" onClick={onCancelNomination}>
            <X size={14} strokeWidth={2.2} />
            Cancel Nomination
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
              {selling ? 'Saving...' : <><Check size={17} strokeWidth={2.4} /> Sold</>}
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
            <span className="result-name">
              {player.name}
              {player.injuryStatus && (
                <span className={`inj-badge inj-${injClass(player.injuryStatus)}`}>{injAbbr(player.injuryStatus)}</span>
              )}
            </span>
            <span className="result-team">{player.nflTeam}</span>
            {player.status === 'sold' && (
              <span className="result-sold-info">
                {teams[player.soldTo]?.name} · ${player.soldPrice}
              </span>
            )}
            {player.projectedValue && player.status !== 'sold' && (
              <span className="result-value">${player.projectedValue}</span>
            )}
            <button
              className="info-btn"
              onClick={e => { e.stopPropagation(); setCardPlayer(player); }}
              title="Player stats"
              aria-label={`Open details for ${player.name}`}
            >
              <Info size={16} strokeWidth={2.1} />
            </button>
            {player.status === 'available' && (
              <button className="nominate-btn" aria-label={`Nominate ${player.name}`}>
                <Plus size={18} strokeWidth={2.4} />
              </button>
            )}
          </div>
        ))}
        {results.length === 0 && (
          <p className="no-results">No players found.</p>
        )}
      </div>

      {cardPlayer && <PlayerCard player={cardPlayer} onClose={() => setCardPlayer(null)} />}

      {/* ── Add Player ── */}
      {!showAddForm ? (
        <button className="add-player-btn" onClick={() => setShowAddForm(true)}>
          <Plus size={15} strokeWidth={2.2} />
          Add Player
        </button>
      ) : (
        <div className="add-player-form">
          <input
            className="add-player-input"
            type="text"
            placeholder="Player name"
            value={addName}
            onChange={e => setAddName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <select
            className="add-player-select"
            value={addPos}
            onChange={e => setAddPos(e.target.value)}
          >
            {ADD_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input
            className="add-player-input add-player-team"
            type="text"
            placeholder="Team (e.g. KC)"
            value={addTeam}
            onChange={e => setAddTeam(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            maxLength={4}
          />
          <div className="add-player-actions">
            <button
              className="add-player-submit"
              onClick={handleAdd}
              disabled={!addName.trim() || adding}
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
            <button className="add-player-cancel" onClick={() => { setShowAddForm(false); setAddName(''); setAddTeam(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
