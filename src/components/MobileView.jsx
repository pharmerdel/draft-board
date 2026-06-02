import { useState, useMemo } from 'react';
import Fuse from 'fuse.js';
import PlayerCard from './PlayerCard';
import MyTeamPanel from './MyTeamPanel';
import RosterModal from './RosterModal';
import NominationQueue from './NominationQueue';
import NominationSearch from './NominationSearch';
import TimerDisplay from './TimerDisplay';
import './MobileView.css';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const TOTAL_DRAFT_SLOTS = 13;

function maxBid(team) {
  const filled = Object.values(team.roster || {}).length;
  const empty  = Math.max(0, TOTAL_DRAFT_SLOTS - filled);
  return Math.max(1, (team.budgetRemaining || 0) - (empty - 1));
}

export default function MobileView({
  draft, teams, players, log,
  nominatedPlayer, currentNomination,
  selectedTeamId, nominatingTeamId,
  onNominate, watchlist, onToggleWatch,
}) {
  const [tab, setTab]             = useState('myteam');
  const [cardPlayer, setCardPlayer] = useState(null);
  const [posFilter, setPosFilter] = useState('ALL');
  const [showSold, setShowSold]   = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalTeamId, setModalTeamId] = useState(null);

  const myTeam = selectedTeamId ? teams[selectedTeamId] : null;
  const nominatingTeam = teams[draft?.nominationOrderIds?.[draft?.nominationIndex % 12]];

  const logEntries = Object.entries(log)
    .filter(([, e]) => e.type === 'sold')
    .sort((a, b) => b[1].timestamp - a[1].timestamp);

  const playerList = useMemo(() => Object.entries(players)
    .map(([id, p]) => ({ id, ...p }))
    .filter(p => showSold || p.status !== 'sold')
    .filter(p => posFilter === 'ALL' || p.position === posFilter)
    .sort((a, b) => a.overallRank - b.overallRank),
  [players, showSold, posFilter]);

  const fuse = useMemo(() => new Fuse(playerList, {
    keys: ['name', 'nflTeam'],
    threshold: 0.35,
  }), [playerList]);

  const filteredPlayers = searchQuery.trim()
    ? fuse.search(searchQuery).map(r => r.item)
    : playerList;

  return (
    <div className="mobile-view">

      {/* ── On the Block strip ── */}
      <div className={`mobile-block-strip ${
        nominatedPlayer ? 'active' :
        nominatingTeamId === selectedTeamId ? 'your-turn' :
        'waiting'
      }`}>
        {nominatedPlayer ? (
          <>
            <div className="mobile-block-left">
              <div className="mobile-block-headshot">
                {nominatedPlayer.headshotUrl
                  ? <img src={nominatedPlayer.headshotUrl} alt={nominatedPlayer.name} />
                  : <div className="mobile-block-headshot-sil">{nominatedPlayer.position}</div>
                }
              </div>
              <span className={`mobile-block-pos pos-${nominatedPlayer.position}`}>
                {nominatedPlayer.position}{nominatedPlayer.positionalRank}
              </span>
              <div className="mobile-block-player">
                <span className="mobile-block-name">{nominatedPlayer.name}</span>
                <span className="mobile-block-team">{nominatedPlayer.nflTeam}</span>
              </div>
            </div>
            <div className="mobile-block-right">
              <span className="mobile-block-label">ON THE BLOCK</span>
              {nominatedPlayer.projectedValue && (
                <span className="mobile-block-value">Proj ${nominatedPlayer.projectedValue}</span>
              )}
            </div>
          </>
        ) : nominatingTeamId === selectedTeamId ? (
          <span className="mobile-block-your-turn">
            🎯 It's your turn — nominate a player below
          </span>
        ) : (
          <>
            <span className="mobile-block-waiting">
              ⏳ Waiting for nomination
              {nominatingTeam && ` — ${nominatingTeam.name}'s pick`}
            </span>
            <TimerDisplay draft={draft} />
          </>
        )}
      </div>

      {/* ── Tab content ── */}
      <div className="mobile-content">

        {/* MY TEAM */}
        {tab === 'myteam' && (
          <div className="mobile-myteam-tab">
            {/* Nomination search — shown when it's this user's turn and nothing is on the block */}
            {nominatingTeamId === selectedTeamId && !nominatedPlayer && (
              <div className="mobile-nom-search-wrap">
                <NominationSearch players={players} onNominate={onNominate} />
              </div>
            )}
            <MyTeamPanel team={myTeam} players={players} watchlist={watchlist} onToggleWatch={onToggleWatch} selectedTeamId={selectedTeamId} nominatingTeamId={nominatingTeamId} currentNomination={currentNomination} onNominate={onNominate} />
            <div className="mobile-queue-section">
              <NominationQueue
                draft={draft}
                teams={teams}
                selectedTeamId={selectedTeamId}
              />
            </div>
          </div>
        )}

        {/* ALL TEAMS */}
        {tab === 'allteams' && (
          <div className="mobile-all-teams">
            {(draft?.nominationOrderIds || []).map((teamId, idx) => {
              const team = teams[teamId];
              if (!team) return null;
              const filled = Object.values(team.roster || {}).length;
              return (
                <div
                  key={teamId}
                  className={`mobile-team-row ${teamId === selectedTeamId ? 'mine' : ''}`}
                  onClick={() => setModalTeamId(teamId)}
                >
                  <span className="mobile-team-num">{idx + 1}</span>
                  <div className="mobile-team-info">
                    <span className="mobile-team-name">{team.name}</span>
                    <span className="mobile-team-owner">{team.ownerName}</span>
                  </div>
                  <div className="mobile-team-stats">
                    <span className="mobile-team-budget">${team.budgetRemaining ?? 200}</span>
                    <span className="mobile-team-roster">{filled}/{TOTAL_DRAFT_SLOTS}</span>
                    <span className="mobile-team-max">Max ${maxBid(team)}</span>
                  </div>
                  <span className="mobile-team-arrow">›</span>
                </div>
              );
            })}
          </div>
        )}

        {/* PLAYERS */}
        {tab === 'players' && (
          <div className="mobile-players">
            <input
              className="mobile-search-input"
              type="text"
              placeholder="Search players…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <div className="mobile-filters">
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
            <div className="mobile-player-list">
              {filteredPlayers.map(p => (
                <div key={p.id} className={`mobile-player-row ${p.status === 'sold' ? 'sold' : ''}`}>
                  <span className={`result-pos pos-${p.position}`}>{p.position}{p.positionalRank}</span>
                  <span className="mobile-player-name">{p.name}</span>
                  <span className="mobile-player-nfl">{p.nflTeam}</span>
                  {p.status === 'sold'
                    ? <span className="mobile-player-sold">{teams[p.soldTo]?.name} · ${p.soldPrice}</span>
                    : p.projectedValue && <span className="mobile-player-value">${p.projectedValue}</span>
                  }
                  <button
                    className="info-btn"
                    onClick={e => { e.stopPropagation(); setCardPlayer(p); }}
                  >ⓘ</button>
                  {p.status !== 'sold' && (
                    <button
                      className={`watch-btn ${watchlist?.[p.id] ? 'watched' : ''}`}
                      onClick={e => { e.stopPropagation(); onToggleWatch(p.id); }}
                    >★</button>
                  )}
                </div>
              ))}
              {filteredPlayers.length === 0 && (
                <p style={{ color: '#555', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                  No players found.
                </p>
              )}
            </div>
          </div>
        )}

        {/* LOG */}
        {tab === 'log' && (
          <div className="mobile-log">
            <p className="mobile-log-count">{logEntries.length} picks</p>
            {logEntries.length === 0 && <p className="log-empty">No picks yet.</p>}
            {logEntries.map(([id, entry]) => (
              <div key={id} className="log-entry">
                <div className="log-entry-top">
                  <span className={`log-pos pos-${entry.position}`}>{entry.position}</span>
                  <span className="log-player-name">{entry.playerName}</span>
                  <span className="log-nfl-team">{entry.nflTeam}</span>
                </div>
                <div className="log-entry-bottom">
                  <span className="log-team-name">{entry.teamName}</span>
                  <span className="log-price">${entry.pricePaid}</span>
                  {entry.delta != null && (
                    <span className={`log-delta ${entry.delta > 0 ? 'over' : 'under'}`}>
                      {entry.delta > 0 ? `+$${entry.delta} over` : `-$${Math.abs(entry.delta)} under`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {cardPlayer && <PlayerCard player={cardPlayer} onClose={() => setCardPlayer(null)} />}

      {/* ── Bottom tab bar ── */}
      <div className="mobile-tabbar">
        {[
          { id: 'myteam',   label: 'My Team',   icon: '👤' },
          { id: 'allteams', label: 'All Teams',  icon: '🏈' },
          { id: 'players',  label: 'Players',    icon: '📋' },
          { id: 'log',      label: 'Log',        icon: '📝' },
        ].map(t => (
          <button
            key={t.id}
            className={`mobile-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="mobile-tab-icon">{t.icon}</span>
            <span className="mobile-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Roster modal for All Teams */}
      {modalTeamId && (
        <RosterModal
          team={teams[modalTeamId]}
          teamId={modalTeamId}
          onClose={() => setModalTeamId(null)}
        />
      )}
    </div>
  );
}
