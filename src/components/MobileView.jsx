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
import {
  ArrowRight,
  ClipboardList,
  GripVertical,
  History,
  Hourglass,
  Info,
  Shield,
  Star,
  Target,
  UserRound,
} from 'lucide-react';
import PlayerCard from './PlayerCard';
import MyTeamPanel from './MyTeamPanel';
import RosterModal from './RosterModal';
import NominationQueue from './NominationQueue';
import NominationSearch from './NominationSearch';
import TimerDisplay from './TimerDisplay';
import './MobileView.css';

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
function SortableMobilePlayerRow({ p, rank, teams, watchlist, onToggleWatch, onCardOpen, isDragging }) {
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
      className={`mobile-player-row ${p.status === 'sold' ? 'sold' : ''} ${isSorting ? 'sorting' : ''}`}
    >
      <span className="mobile-drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        <GripVertical size={18} strokeWidth={2.1} />
      </span>
      <span className="mobile-rank-num">{rank}</span>
      <span className={`result-pos pos-${p.position}`}>{p.position}{p.positionalRank}</span>
      <span className="mobile-player-name">
        {p.name}
        {p.injuryStatus && (
          <span className={`inj-badge inj-${injClass(p.injuryStatus)}`}>{injAbbr(p.injuryStatus)}</span>
        )}
      </span>
      <span className="mobile-player-nfl">{p.nflTeam}</span>
      {p.status === 'sold'
        ? <span className="mobile-player-sold">{teams[p.soldTo]?.name} · ${p.soldPrice}</span>
        : p.projectedValue && <span className="mobile-player-value">${p.projectedValue}</span>
      }
      <button className="info-btn" onClick={e => { e.stopPropagation(); onCardOpen(p); }} aria-label={`Open details for ${p.name}`}>
        <Info size={16} strokeWidth={2.1} />
      </button>
      {p.status !== 'sold' && (
        <button
          className={`watch-btn ${watchlist?.[p.id] ? 'watched' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleWatch(p.id); }}
        >
          <Star size={16} strokeWidth={2.1} />
        </button>
      )}
    </div>
  );
}

export default function MobileView({
  draft, teams, players, log,
  nominatedPlayer, currentNomination,
  selectedTeamId, nominatingTeamId,
  onNominate, watchlist, onToggleWatch,
  personalRanks, onSavePersonalRanks,
  themeToggle,
}) {
  const [tab, setTab]               = useState('myteam');
  const [confirmPlayer, setConfirmPlayer]     = useState(null);
  const [showDraftedWatch, setShowDraftedWatch] = useState(false);
  const [cardPlayer, setCardPlayer]   = useState(null);
  const [posFilter, setPosFilter]     = useState('ALL');
  const [showSold, setShowSold]       = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalTeamId, setModalTeamId] = useState(null);
  const [soldNotif, setSoldNotif]     = useState(null); // { playerName, teamName, pricePaid }
  const [activeDragId, setActiveDragId] = useState(null);
  const prevSoldCount = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const effectiveRank = useCallback((playerId) => {
    return personalRanks?.[playerId] ?? players[playerId]?.overallRank ?? 9999;
  }, [personalRanks, players]);

  const myTeam = selectedTeamId ? teams[selectedTeamId] : null;
  const nominatingTeam = teams[draft?.nominationOrderIds?.[draft?.nominationIndex % 12]];

  const logEntries = Object.entries(log)
    .filter(([, e]) => e.type === 'sold')
    .sort((a, b) => b[1].timestamp - a[1].timestamp);

  // Detect new sale and show sold strip for 4 seconds
  useEffect(() => {
    const soldEntries = Object.values(log)
      .filter(e => e.type === 'sold')
      .sort((a, b) => b.timestamp - a.timestamp);
    if (soldEntries.length > prevSoldCount.current) {
      prevSoldCount.current = soldEntries.length;
      setSoldNotif(soldEntries[0]);
      const t = setTimeout(() => setSoldNotif(null), 4000);
      return () => clearTimeout(t);
    }
  }, [log]);

  // Clear sold notification immediately when a new player is nominated
  useEffect(() => {
    if (nominatedPlayer) setSoldNotif(null);
  }, [nominatedPlayer]);

  const rankedPlayerList = useMemo(() => Object.entries(players)
    .map(([id, p]) => ({ id, ...p }))
    .filter(p => showSold || p.status !== 'sold')
    .sort((a, b) => effectiveRank(a.id) - effectiveRank(b.id)),
  [players, showSold, effectiveRank]);

  const posFilteredList = useMemo(() => rankedPlayerList.filter(p =>
    posFilter === 'ALL' || p.position === posFilter
  ), [rankedPlayerList, posFilter]);

  const isSearching = searchQuery.trim().length > 0;

  const fuse = useMemo(() => new Fuse(posFilteredList, {
    keys: ['name', 'nflTeam'],
    threshold: 0.35,
  }), [posFilteredList]);

  const filteredPlayers = isSearching
    ? fuse.search(searchQuery).map(r => r.item)
    : posFilteredList;

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
      const updates = {};
      reordered.forEach((p, i) => { updates[p.id] = i + 1; });
      onSavePersonalRanks(updates);
    } else {
      const allSorted = [...rankedPlayerList].sort((a, b) => effectiveRank(a.id) - effectiveRank(b.id));
      const slots = allSorted
        .map((p, i) => ({ id: p.id, rank: i + 1, pos: p.position }))
        .filter(x => x.pos === posFilter)
        .map(x => x.rank);
      const updates = {};
      reordered.forEach((p, i) => { updates[p.id] = slots[i]; });
      onSavePersonalRanks(updates);
    }
  }

  return (
    <div className="mobile-view">

      {/* ── On the Block strip ── */}
      <div className={`mobile-block-strip ${
        soldNotif ? 'sold' :
        nominatedPlayer ? 'active' :
        nominatingTeamId === selectedTeamId ? 'your-turn' :
        'waiting'
      }`}>
        {soldNotif ? (
          <>
            <div className="mobile-block-left">
              <div className="mobile-block-sold-info">
                <span className="mobile-block-sold-player">{soldNotif.playerName}</span>
                <span className="mobile-block-sold-arrow"><ArrowRight size={13} strokeWidth={2.2} /> {soldNotif.teamName}</span>
              </div>
            </div>
            <div className="mobile-block-right">
              <span className="mobile-block-sold-label">SOLD</span>
              <span className="mobile-block-sold-price">${soldNotif.pricePaid}</span>
              {themeToggle && <span className="mobile-theme-slot">{themeToggle}</span>}
            </div>
          </>
        ) : nominatedPlayer ? (
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
              {themeToggle && <span className="mobile-theme-slot">{themeToggle}</span>}
            </div>
          </>
        ) : nominatingTeamId === selectedTeamId ? (
          <>
            <span className="mobile-block-your-turn">
              <Target size={16} strokeWidth={2.2} />
              It's your turn - nominate a player below
            </span>
            {themeToggle && <span className="mobile-theme-slot">{themeToggle}</span>}
          </>
        ) : (
          <>
            <span className="mobile-block-waiting">
              <Hourglass size={15} strokeWidth={2.1} />
              Waiting for nomination
              {nominatingTeam && ` — ${nominatingTeam.name}'s pick`}
            </span>
            <span className="mobile-block-actions">
              <TimerDisplay draft={draft} />
              {themeToggle && <span className="mobile-theme-slot">{themeToggle}</span>}
            </span>
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
            <MyTeamPanel team={myTeam} players={players} watchlist={watchlist} onToggleWatch={onToggleWatch} selectedTeamId={selectedTeamId} nominatingTeamId={nominatingTeamId} currentNomination={currentNomination} onNominate={onNominate} showWatchlist={false} />
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

            {isSearching ? (
              <div className="mobile-player-list">
                {filteredPlayers.map(p => (
                  <div key={p.id} className={`mobile-player-row ${p.status === 'sold' ? 'sold' : ''}`}>
                    <span className="mobile-drag-spacer" aria-hidden="true" />
                    <span className="mobile-rank-num">{effectiveRank(p.id)}</span>
                    <span className={`result-pos pos-${p.position}`}>{p.position}{p.positionalRank}</span>
                    <span className="mobile-player-name">
                      {p.name}
                      {p.injuryStatus && (
                        <span className={`inj-badge inj-${injClass(p.injuryStatus)}`}>{injAbbr(p.injuryStatus)}</span>
                      )}
                    </span>
                    <span className="mobile-player-nfl">{p.nflTeam}</span>
                    {p.status === 'sold'
                      ? <span className="mobile-player-sold">{teams[p.soldTo]?.name} · ${p.soldPrice}</span>
                      : p.projectedValue && <span className="mobile-player-value">${p.projectedValue}</span>
                    }
                    <button className="info-btn" onClick={e => { e.stopPropagation(); setCardPlayer(p); }} aria-label={`Open details for ${p.name}`}>
                      <Info size={16} strokeWidth={2.1} />
                    </button>
                    {p.status !== 'sold' && (
                      <button
                        className={`watch-btn ${watchlist?.[p.id] ? 'watched' : ''}`}
                        onClick={e => { e.stopPropagation(); onToggleWatch(p.id); }}
                      >
                        <Star size={16} strokeWidth={2.1} />
                      </button>
                    )}
                  </div>
                ))}
                {filteredPlayers.length === 0 && (
                  <p style={{ color: '#555', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No players found.</p>
                )}
              </div>
            ) : (
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
                  <div className="mobile-player-list">
                    {filteredPlayers.map((p, i) => (
                      <SortableMobilePlayerRow
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
                    {filteredPlayers.length === 0 && (
                      <p style={{ color: '#555', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No players found.</p>
                    )}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeDragId && (() => {
                    const p = filteredPlayers.find(x => x.id === activeDragId);
                    if (!p) return null;
                    return (
                      <div className="mobile-player-row mobile-drag-overlay-row">
                        <span className="mobile-drag-handle"><GripVertical size={18} strokeWidth={2.1} /></span>
                        <span className={`result-pos pos-${p.position}`}>{p.position}{p.positionalRank}</span>
                        <span className="mobile-player-name">{p.name}</span>
                        <span className="mobile-player-nfl">{p.nflTeam}</span>
                      </div>
                    );
                  })()}
                </DragOverlay>
              </DndContext>
            )}
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
        {/* WATCHLIST */}
        {tab === 'watchlist' && (
          <div className="mobile-watchlist-tab">
            {(() => {
              const allIds = Object.keys(watchlist || {});
              const draftedCount = allIds.filter(id => players?.[id]?.status === 'sold').length;
              const visibleIds = showDraftedWatch ? allIds : allIds.filter(id => players?.[id]?.status !== 'sold');
              const isMyTurn = nominatingTeamId === selectedTeamId && !currentNomination;
              return (
                <>
                  <div className="mobile-watchlist-header">
                    <p className="mobile-watchlist-heading"><Star size={15} strokeWidth={2.2} /> Watchlist</p>
                    {draftedCount > 0 && (
                      <button className="watchlist-toggle-btn" onClick={() => setShowDraftedWatch(s => !s)}>
                        {showDraftedWatch ? 'Hide drafted' : `Show drafted (${draftedCount})`}
                      </button>
                    )}
                  </div>
                  {allIds.length === 0 ? (
                    <p className="mobile-watchlist-empty">Star players in the Players tab to add them here.</p>
                  ) : visibleIds.length === 0 ? (
                    <p className="mobile-watchlist-empty">All watchlisted players have been drafted.</p>
                  ) : (
                    <div className="mobile-watchlist-list">
                      {visibleIds.map(playerId => {
                        const p = players?.[playerId];
                        if (!p) return null;
                        const nominatable = isMyTurn && p.status === 'available';
                        return (
                          <div key={playerId} className={`mobile-watchlist-row ${p.status === 'sold' ? 'sold' : ''}`}>
                            <span className={`result-pos pos-${p.position}`}>{p.position}</span>
                            {nominatable
                              ? <button className="watchlist-nominate-link" onClick={() => setConfirmPlayer({ id: playerId, name: p.name })}>{p.name}</button>
                              : <span className="mobile-watchlist-name">{p.name}</span>
                            }
                            <span className="mobile-watchlist-nfl">{p.nflTeam}</span>
                            {p.status === 'sold'
                              ? <span className="mobile-watchlist-sold">SOLD ${p.soldPrice}</span>
                              : (
                                <button className="watch-btn watched" onClick={() => onToggleWatch(playerId)} aria-label={`Remove ${p.name} from watchlist`}>
                                  <Star size={16} strokeWidth={2.1} />
                                </button>
                              )
                            }
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Nomination confirmation */}
            {confirmPlayer && (
              <div className="watchlist-confirm-overlay" onClick={() => setConfirmPlayer(null)}>
                <div className="watchlist-confirm-box" onClick={e => e.stopPropagation()}>
                  <p className="watchlist-confirm-text">Nominate <strong>{confirmPlayer.name}</strong>?</p>
                  <div className="watchlist-confirm-actions">
                    <button className="watchlist-confirm-yes" onClick={() => { onNominate(confirmPlayer.id); setConfirmPlayer(null); }}>Nominate</button>
                    <button className="watchlist-confirm-no" onClick={() => setConfirmPlayer(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>{/* end mobile-content */}

      {cardPlayer && <PlayerCard player={cardPlayer} onClose={() => setCardPlayer(null)} />}

      {/* ── Bottom tab bar ── */}
      <div className="mobile-tabbar">
        {[
          { id: 'myteam',   label: 'My Team',   icon: UserRound },
          { id: 'allteams', label: 'All Teams',  icon: Shield },
          { id: 'players',  label: 'Players',    icon: ClipboardList },
          { id: 'watchlist',label: 'Watchlist',  icon: Star },
          { id: 'log',      label: 'Log',        icon: History },
        ].map(t => (
          <button
            key={t.id}
            className={`mobile-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="mobile-tab-icon">
              <t.icon size={19} strokeWidth={tab === t.id ? 2.5 : 2.1} />
            </span>
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
