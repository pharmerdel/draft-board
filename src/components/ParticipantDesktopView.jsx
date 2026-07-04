import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Fuse from 'fuse.js';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PlayerCard from './PlayerCard';
import MyTeamPanel from './MyTeamPanel';
import TeamDetailModal from './TeamDetailModal';
import NominationQueue from './NominationQueue';
import NominationSearch from './NominationSearch';
import TimerDisplay from './TimerDisplay';
import './ParticipantDesktopView.css';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const TOTAL_DRAFT_SLOTS = 13;

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

function maxBid(team) {
  const filled = Object.values(team.roster || {}).length;
  const empty  = Math.max(0, TOTAL_DRAFT_SLOTS - filled);
  return Math.max(1, (team.budgetRemaining || 0) - (empty - 1));
}

// ── Sortable row used inside the draggable player list ────────────────────────
function SortablePlayerRow({ p, rank, teams, watchlist, onToggleWatch, onCardOpen, isDragging }) {
  const { attributes, listeners, setNodeRef, transform, transition, isSorting } = useSortable({ id: p.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pd-player-row ${p.status === 'sold' ? 'sold' : ''} ${isSorting ? 'sorting' : ''}`}
    >
      <span className="pd-drag-handle" {...attributes} {...listeners} title="Drag to reorder">⠿</span>
      <span className="pd-rank-num">{rank}</span>
      <span className={`result-pos pos-${p.position}`}>{p.position}{p.positionalRank}</span>
      <span className="pd-player-name">
        {p.name}
        {p.injuryStatus && (
          <span className={`inj-badge inj-${injClass(p.injuryStatus)}`}>{injAbbr(p.injuryStatus)}</span>
        )}
      </span>
      <span className="pd-player-nfl">{p.nflTeam}</span>
      {p.status === 'sold'
        ? <span className="pd-player-sold">{teams[p.soldTo]?.name} · ${p.soldPrice}</span>
        : p.projectedValue && <span className="pd-player-value">${p.projectedValue}</span>
      }
      <button className="info-btn" onClick={e => { e.stopPropagation(); onCardOpen(p); }}>ⓘ</button>
      {p.status !== 'sold' && (
        <button
          className={`watch-btn ${watchlist?.[p.id] ? 'watched' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleWatch(p.id); }}
        >★</button>
      )}
    </div>
  );
}

export default function ParticipantDesktopView({
  draft, teams, players, log,
  nominatedPlayer, currentNomination,
  selectedTeamId, nominatingTeamId,
  onNominate, watchlist, onToggleWatch,
  personalRanks, onSavePersonalRanks,
}) {
  const [tab, setTab]               = useState('myteam');
  const [cardPlayer, setCardPlayer]   = useState(null);
  const [posFilter, setPosFilter]     = useState('ALL');
  const [showSold, setShowSold]       = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalTeamId, setModalTeamId] = useState(null);
  const [soldNotif, setSoldNotif]     = useState(null);
  const [activeDragId, setActiveDragId] = useState(null);
  const prevSoldCount = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  // Compute effective rank for a player: personal override, else global
  const effectiveRank = useCallback((playerId) => {
    return personalRanks?.[playerId] ?? players[playerId]?.overallRank ?? 9999;
  }, [personalRanks, players]);

  // Full sorted player list by effective rank (used for ALL view)
  const rankedPlayerList = useMemo(() => Object.entries(players)
    .map(([id, p]) => ({ id, ...p }))
    .filter(p => showSold || p.status !== 'sold')
    .sort((a, b) => effectiveRank(a.id) - effectiveRank(b.id)),
  [players, showSold, effectiveRank]);

  // Position-filtered list (used when posFilter !== 'ALL')
  const posFilteredList = useMemo(() => rankedPlayerList.filter(p =>
    posFilter === 'ALL' || p.position === posFilter
  ), [rankedPlayerList, posFilter]);

  // What's shown (search overrides drag — disable drag when searching)
  const isSearching = searchQuery.trim().length > 0;

  const fuse = useMemo(() => new Fuse(posFilteredList, {
    keys: ['name', 'nflTeam'],
    threshold: 0.35,
  }), [posFilteredList]);

  const filteredPlayers = isSearching
    ? fuse.search(searchQuery).map(r => r.item)
    : posFilteredList;

  // ── Drag handlers ─────────────────────────────────────────────────────────

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const list = posFilter === 'ALL' ? rankedPlayerList : posFilteredList;
    const oldIndex = list.findIndex(p => p.id === active.id);
    const newIndex = list.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(list, oldIndex, newIndex);

    if (posFilter === 'ALL') {
      // Direct reassignment: each item takes rank = its position in the new array
      const updates = {};
      reordered.forEach((p, i) => { updates[p.id] = i + 1; });
      onSavePersonalRanks(updates);
    } else {
      // Slot preservation: this position's players keep the same rank slots,
      // just redistributed in the new order.
      const allSorted = [...rankedPlayerList].sort((a, b) => effectiveRank(a.id) - effectiveRank(b.id));
      // Collect the rank slots owned by this position (index-based 1..N)
      const slots = allSorted
        .map((p, i) => ({ id: p.id, rank: i + 1, pos: p.position }))
        .filter(x => x.pos === posFilter)
        .map(x => x.rank);

      // Assign slots in new order
      const updates = {};
      reordered.forEach((p, i) => { updates[p.id] = slots[i]; });
      onSavePersonalRanks(updates);
    }
  }

  const myTeam = selectedTeamId ? teams[selectedTeamId] : null;
  const nominatingTeam = teams[draft?.nominationOrderIds?.[draft?.nominationIndex % 12]];
  const nominatedByTeam = currentNomination ? teams[currentNomination.nominatingTeamId] : null;

  const logEntries = Object.entries(log)
    .filter(([, e]) => e.type === 'sold')
    .sort((a, b) => b[1].timestamp - a[1].timestamp);

  // Detect new sale and show sold card for 5 seconds
  useEffect(() => {
    const soldEntries = Object.values(log)
      .filter(e => e.type === 'sold')
      .sort((a, b) => b.timestamp - a.timestamp);
    if (soldEntries.length > prevSoldCount.current) {
      prevSoldCount.current = soldEntries.length;
      setSoldNotif(soldEntries[0]);
      const t = setTimeout(() => setSoldNotif(null), 5000);
      return () => clearTimeout(t);
    }
  }, [log]);

  // Clear sold notification immediately when next nomination fires
  useEffect(() => {
    if (nominatedPlayer) setSoldNotif(null);
  }, [nominatedPlayer]);

  // (player list, fuse, and filteredPlayers are computed above with drag logic)

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

          {soldNotif ? (
            <div className="pd-block-card pd-sold-card">
              <div className="pd-block-headshot">
                {players[soldNotif.playerId]?.headshotUrl
                  ? <img src={players[soldNotif.playerId].headshotUrl} alt={soldNotif.playerName} />
                  : <div className="pd-headshot-sil pd-sold-sil">{soldNotif.position}</div>
                }
              </div>
              <div className="pd-block-details">
                <span className="pd-sold-badge">SOLD</span>
                <h1 className="pd-sold-player-name">{soldNotif.playerName}</h1>
                <span className="pd-sold-arrow">→ {soldNotif.teamName}</span>
                <span className="pd-sold-price">${soldNotif.pricePaid}</span>
              </div>
            </div>
          ) : nominatedPlayer ? (
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
              <div className="pd-teams-grid">
                {(draft?.nominationOrderIds || []).map((teamId, idx) => {
                  const team = teams[teamId];
                  if (!team) return null;
                  const SLOT_LIMITS_INNER = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 };
                  return (
                    <div
                      key={teamId}
                      className={`pd-team-grid-card ${teamId === selectedTeamId ? 'mine' : ''}`}
                      onClick={() => setModalTeamId(teamId)}
                    >
                      <div className="pd-tgc-header">
                        <span className="pd-tgc-idx">{idx + 1}</span>
                        <div className="pd-tgc-names">
                          <span className="pd-tgc-name">{team.name}</span>
                          <span className="pd-tgc-owner">{team.ownerName}</span>
                        </div>
                      </div>
                      <div className="pd-tgc-stats">
                        <div className="pd-tgc-stat">
                          <span className={`pd-tgc-val ${(team.budgetRemaining ?? 200) < 25 ? 'red' : 'green'}`}>${team.budgetRemaining ?? 200}</span>
                          <span className="pd-tgc-label">Budget</span>
                        </div>
                        <div className="pd-tgc-stat">
                          <span className="pd-tgc-val amber">${maxBid(team)}</span>
                          <span className="pd-tgc-label">Max</span>
                        </div>
                      </div>
                      <div className="pd-tgc-pills">
                        {Object.entries(SLOT_LIMITS_INNER).map(([slot, limit]) => {
                          const filledCount = Object.values(team.roster || {})
                            .filter(p => p.slotType === slot).length;
                          return Array.from({ length: limit }, (_, i) => (
                            <span key={`${slot}${i}`} className={`pd-tgc-pill ${i < filledCount ? 'filled' : 'empty'}`}>
                              {slot === 'FLEX' ? 'FLX' : slot}
                            </span>
                          ));
                        })}
                      </div>
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
                  placeholder="Search players… (drag disabled while searching)"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
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

                {isSearching ? (
                  // Search results — static, no drag
                  <div className="pd-player-list">
                    {filteredPlayers.map((p, i) => (
                      <div key={p.id} className={`pd-player-row ${p.status === 'sold' ? 'sold' : ''}`}>
                        <span className="pd-drag-spacer" aria-hidden="true" />
                        <span className="pd-rank-num">{effectiveRank(p.id)}</span>
                        <span className={`result-pos pos-${p.position}`}>{p.position}{p.positionalRank}</span>
                        <span className="pd-player-name">
                          {p.name}
                          {p.injuryStatus && (
                            <span className={`inj-badge inj-${injClass(p.injuryStatus)}`}>{injAbbr(p.injuryStatus)}</span>
                          )}
                        </span>
                        <span className="pd-player-nfl">{p.nflTeam}</span>
                        {p.status === 'sold'
                          ? <span className="pd-player-sold">{teams[p.soldTo]?.name} · ${p.soldPrice}</span>
                          : p.projectedValue && <span className="pd-player-value">${p.projectedValue}</span>
                        }
                        <button className="info-btn" onClick={e => { e.stopPropagation(); setCardPlayer(p); }}>ⓘ</button>
                        {p.status !== 'sold' && (
                          <button
                            className={`watch-btn ${watchlist?.[p.id] ? 'watched' : ''}`}
                            onClick={e => { e.stopPropagation(); onToggleWatch(p.id); }}
                          >★</button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  // Draggable list
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={({ active }) => setActiveDragId(active.id)}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setActiveDragId(null)}
                  >
                    <SortableContext
                      items={filteredPlayers.map(p => p.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="pd-player-list">
                        {filteredPlayers.map((p, i) => (
                          <SortablePlayerRow
                            key={p.id}
                            p={p}
                            rank={posFilter === 'ALL' ? i + 1 : effectiveRank(p.id)}
                            teams={teams}
                            watchlist={watchlist}
                            onToggleWatch={onToggleWatch}
                            onCardOpen={setCardPlayer}
                            isDragging={activeDragId === p.id}
                          />
                        ))}
                      </div>
                    </SortableContext>
                    <DragOverlay>
                      {activeDragId && (() => {
                        const p = filteredPlayers.find(x => x.id === activeDragId);
                        if (!p) return null;
                        return (
                          <div className="pd-player-row drag-overlay-row">
                            <span className="pd-drag-handle">⠿</span>
                            <span className={`result-pos pos-${p.position}`}>{p.position}{p.positionalRank}</span>
                            <span className="pd-player-name">{p.name}</span>
                            <span className="pd-player-nfl">{p.nflTeam}</span>
                          </div>
                        );
                      })()}
                    </DragOverlay>
                  </DndContext>
                )}
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

      {modalTeamId && teams[modalTeamId] && (
        <TeamDetailModal
          team={teams[modalTeamId]}
          onClose={() => setModalTeamId(null)}
        />
      )}
    </div>
  );
}
