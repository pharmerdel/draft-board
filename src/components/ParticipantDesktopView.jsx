import { useState, useMemo } from 'react';
import Fuse from 'fuse.js';
import PlayerCard from './PlayerCard';
import MyTeamPanel from './MyTeamPanel';
import RosterModal from './RosterModal';
import NominationQueue from './NominationQueue';
import NominationSearch from './NominationSearch';
import TimerDisplay from './TimerDisplay';
import './ParticipantDesktopView.css';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const TOTAL_DRAFT_SLOTS = 13;

function maxBid(team) {
  const filled = Object.values(team.roster || {}).length;
  const empty  = Math.max(0, TOTAL_DRAFT_SLOTS - filled);
  return Math.max(1, (team.budgetRemaining || 0) - (empty - 1));
}

export default function ParticipantDesktopView({
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
  const nominatedByTeam = currentNomination ? teams[currentNomination.nominatingTeamId] : null;

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
    <div className="pd-view">

      {/* ── Top bar ── */}
      <div className="pd-topbar">
        <span className="pd-league-name">{draft?.leagueName}</span>
        {myTeam && (
          <div className="pd-my-stats">
            <span className="pd-my-team-name">{myTeam.name}</span>
            <span className="pd-stat-pill green">${myTeam.budgetRemaining ?? 200} left</span>
            <span className="pd-stat-pill yellow">Max ${maxBid(myTeam)}</span>
          </div>
        )}
        <span className="pd-status-badge">🔴 Live</span>
      </div>

      <div className="pd-columns">

        {/* ── Left: On the Block ── */}
        <div className="pd-left">
          <h2 className="pd-col-heading">On the Block</h2>

          {nominatedPlayer ? (
            <div className="pd-block-card">
              <div className="pd-block-headshot">
                {nominatedPlayer.headshotUrl
                  ? <img src={nominatedPlayer.headshotUrl} alt={nominatedPlayer.name} />
                  : <div className="pd-headshot-sil">{nominatedPlayer.position}</div>
                }
              </div>
              <div className="pd-block-details">
                <span className={`pd-pos-badge pos-${nominatedPlayer.position}`}>
                  {nominatedPlayer.position}{nominatedPlayer.positionalRank}
                </span>
                <h1 className="pd-player-name">{nominatedPlayer.name}</h1>
                <span className="pd-nfl-team">{nominatedPlayer.nflTeam}</span>
                {nominatedPlayer.projectedValue && (
                  <span className="pd-proj-value">Proj: ${nominatedPlayer.projectedValue}</span>
                )}
                <span className="pd-nominated-by">
                  Nominated by {nominatedByTeam?.name}
                </span>
              </div>
            </div>
          ) : nominatingTeamId === selectedTeamId ? (
            // It's this user's turn — show nomination search
            <div className="pd-nom-search-wrap">
              <NominationSearch players={players} onNominate={onNominate} />
            </div>
          ) : (
            <div className="pd-waiting">
              <p className="pd-waiting-text">⏳ Waiting for nomination</p>
              {nominatingTeam && (
                <p className="pd-waiting-sub">{nominatingTeam.name}'s pick</p>
              )}
              <TimerDisplay draft={draft} />
            </div>
          )}

          {/* Nomination queue */}
          <NominationQueue
            draft={draft}
            teams={teams}
            selectedTeamId={selectedTeamId}
          />
        </div>

        {/* ── Right: Team info + tabs ── */}
        <div className="pd-right">
          <div className="pd-tabs">
            {[
              { id: 'myteam',   label: 'My Team' },
              { id: 'allteams', label: 'All Teams' },
              { id: 'players',  label: 'Players' },
              { id: 'log',      label: 'Draft Log' },
            ].map(t => (
              <button
                key={t.id}
                className={`pd-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="pd-tab-content">

            {tab === 'myteam' && <MyTeamPanel team={myTeam} players={players} watchlist={watchlist} onToggleWatch={onToggleWatch} selectedTeamId={selectedTeamId} nominatingTeamId={nominatingTeamId} currentNomination={currentNomination} onNominate={onNominate} />}

            {tab === 'allteams' && (
              <div className="pd-all-teams">
                {(draft?.nominationOrderIds || []).map((teamId, idx) => {
                  const team = teams[teamId];
                  if (!team) return null;
                  const filled = Object.values(team.roster || {}).length;
                  return (
                    <div
                      key={teamId}
                      className={`pd-team-row ${teamId === selectedTeamId ? 'mine' : ''}`}
                      onClick={() => setModalTeamId(teamId)}
                    >
                      <span className="pd-team-num">{idx + 1}</span>
                      <div className="pd-team-info">
                        <span className="pd-team-name">{team.name}</span>
                        <span className="pd-team-owner">{team.ownerName}</span>
                      </div>
                      <div className="pd-team-stats">
                        <span className="pd-team-budget">${team.budgetRemaining ?? 200}</span>
                        <span className="pd-team-roster">{filled}/{TOTAL_DRAFT_SLOTS}</span>
                        <span className="pd-team-max">Max ${maxBid(team)}</span>
                      </div>
                      <span className="pd-team-arrow">›</span>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'players' && (
              <div className="pd-players">
                <input
                  className="pd-search-input"
                  type="text"
                  placeholder="Search players…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <div className="pd-filters">
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
                <div className="pd-player-list">
                  {filteredPlayers.map(p => (
                    <div key={p.id} className={`pd-player-row ${p.status === 'sold' ? 'sold' : ''}`}>
                      <span className={`result-pos pos-${p.position}`}>{p.position}{p.positionalRank}</span>
                      <span className="pd-player-name">{p.name}</span>
                      <span className="pd-player-nfl">{p.nflTeam}</span>
                      {p.status === 'sold'
                        ? <span className="pd-player-sold">{teams[p.soldTo]?.name} · ${p.soldPrice}</span>
                        : p.projectedValue && <span className="pd-player-value">${p.projectedValue}</span>
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
                </div>
              </div>
            )}

            {tab === 'log' && (
              <div className="pd-log">
                <p className="pd-log-count">{logEntries.length} picks</p>
                {logEntries.length === 0 && <p className="pd-empty">No picks yet.</p>}
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
        </div>
      </div>

      {cardPlayer && <PlayerCard player={cardPlayer} onClose={() => setCardPlayer(null)} />}

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
