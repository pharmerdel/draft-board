import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Info, Search, Star } from 'lucide-react';

import PlayerCard from './PlayerCard';
import {
  buildReorderedPersonalRanks,
  effectivePlayerRank,
  sortPlayersByPreference,
} from '../utils/personalRankings';
import './PreseasonPlayerWorkspace.css';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];

function injuryLabel(status) {
  if (!status) return null;
  const normalized = status.toLowerCase();
  if (normalized === 'questionable') return 'Q';
  if (normalized === 'doubtful') return 'D';
  if (normalized === 'out') return 'OUT';
  if (normalized === 'ir') return 'IR';
  if (normalized.startsWith('pup')) return 'PUP';
  return status.slice(0, 3).toUpperCase();
}

function PlayerRow({ player, rank, watched, draggable, onToggleWatch, onOpen, active }) {
  const {
    attributes,
    isSorting,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: player.id, disabled: !draggable });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: active ? 0.3 : 1,
  };

  return (
    <article ref={setNodeRef} style={style} className={`ps-player-row ${isSorting ? 'sorting' : ''}`}>
      {draggable ? (
        <button
          className="ps-drag-handle"
          type="button"
          aria-label={`Move ${player.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} />
        </button>
      ) : <span className="ps-drag-spacer" />}
      <span className="ps-rank">{rank}</span>
      <span className={`ps-position pos-${player.position}`}>{player.position}</span>
      <button className="ps-player-identity" type="button" onClick={() => onOpen(player)}>
        <span>
          {player.name}
          {player.injuryStatus && <small>{injuryLabel(player.injuryStatus)}</small>}
        </span>
        <small>{player.nflTeam || 'FA'} · FantasyPros #{player.overallRank || '—'}</small>
      </button>
      {player.projectedValue != null && <span className="ps-value">${player.projectedValue}</span>}
      <button className="ps-icon-button" type="button" onClick={() => onOpen(player)} aria-label={`Details for ${player.name}`}>
        <Info size={17} />
      </button>
      <button
        className={`ps-icon-button ps-star ${watched ? 'watched' : ''}`}
        type="button"
        onClick={() => onToggleWatch(player.id)}
        aria-label={`${watched ? 'Remove' : 'Add'} ${player.name} ${watched ? 'from' : 'to'} starred players`}
      >
        <Star size={18} />
      </button>
    </article>
  );
}

export default function PreseasonPlayerWorkspace({
  players,
  personalRanks,
  watchlist,
  onSavePersonalRanks,
  onToggleWatch,
  saveState,
  savedAt,
  saveError,
  onRetry,
}) {
  const [view, setView] = useState('rankings');
  const [position, setPosition] = useState('ALL');
  const [search, setSearch] = useState('');
  const [activeDragId, setActiveDragId] = useState(null);
  const [cardPlayer, setCardPlayer] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 175, tolerance: 6 } }),
  );

  const rankedPlayers = useMemo(
    () => sortPlayersByPreference(players, personalRanks).filter(player => player.status !== 'sold'),
    [players, personalRanks],
  );
  const positionPlayers = useMemo(
    () => rankedPlayers.filter(player => position === 'ALL' || player.position === position),
    [position, rankedPlayers],
  );
  const viewPlayers = useMemo(
    () => view === 'starred' ? positionPlayers.filter(player => watchlist[player.id]) : positionPlayers,
    [positionPlayers, view, watchlist],
  );
  const fuse = useMemo(() => new Fuse(viewPlayers, {
    keys: ['name', 'nflTeam'],
    threshold: 0.35,
  }), [viewPlayers]);
  const isSearching = search.trim().length > 0;
  const visiblePlayers = isSearching ? fuse.search(search).map(result => result.item) : viewPlayers;
  const canDrag = view === 'rankings' && !isSearching;

  function handleDragEnd({ active, over }) {
    setActiveDragId(null);
    if (!over) return;
    const updates = buildReorderedPersonalRanks({
      players,
      personalRanks,
      activeId: active.id,
      overId: over.id,
      position,
    });
    if (updates) onSavePersonalRanks(updates);
  }

  const savedLabel = savedAt
    ? `Saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Changes save automatically';

  return (
    <section className="ps-workspace" aria-label="Player ranking workspace">
      <div className="ps-workspace-toolbar">
        <div className="ps-view-tabs" role="tablist" aria-label="Player views">
          <button type="button" className={view === 'rankings' ? 'active' : ''} onClick={() => setView('rankings')}>
            Rankings
          </button>
          <button type="button" className={view === 'starred' ? 'active' : ''} onClick={() => setView('starred')}>
            <Star size={15} /> Starred <span>{Object.keys(watchlist).length}</span>
          </button>
        </div>
        <span className={`ps-save-state ${saveState}`} aria-live="polite">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'error'
              ? 'Save needs attention'
              : <><Check size={14} /> {savedLabel}</>}
        </span>
      </div>

      {saveError && (
        <div className="ps-save-error" role="alert">
          <span>{saveError}</span>
          <button type="button" onClick={onRetry}>Try again</button>
        </div>
      )}

      <div className="ps-controls">
        <label className="ps-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search player or NFL team"
          />
        </label>
        <div className="ps-position-filters" aria-label="Filter by position">
          {POSITIONS.map(item => (
            <button
              key={item}
              type="button"
              className={position === item ? 'active' : ''}
              onClick={() => setPosition(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="ps-list-note">
        <span>{visiblePlayers.length} {view === 'starred' ? 'starred' : position === 'ALL' ? 'players' : position + 's'}</span>
        <span>{canDrag ? 'Drag players into your preferred order.' : isSearching ? 'Clear search to reorder players.' : 'Star players from the Rankings view.'}</span>
      </div>

      {visiblePlayers.length === 0 ? (
        <div className="ps-empty">
          <Star size={24} />
          <h3>{view === 'starred' ? 'No starred players here yet' : 'No players found'}</h3>
          <p>{view === 'starred' ? 'Use the star beside any player to build a private shortlist.' : 'Try another player name or position.'}</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveDragId(active.id)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragId(null)}
        >
          <SortableContext items={visiblePlayers.map(player => player.id)} strategy={verticalListSortingStrategy}>
            <div className="ps-player-list">
              {visiblePlayers.map(player => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  rank={effectivePlayerRank(player.id, players, personalRanks)}
                  watched={Boolean(watchlist[player.id])}
                  draggable={canDrag}
                  onToggleWatch={onToggleWatch}
                  onOpen={setCardPlayer}
                  active={activeDragId === player.id}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeDragId && (() => {
              const player = visiblePlayers.find(item => item.id === activeDragId);
              return player ? <div className="ps-drag-overlay"><GripVertical size={18} /><strong>{player.name}</strong><span>{player.position} · {player.nflTeam}</span></div> : null;
            })()}
          </DragOverlay>
        </DndContext>
      )}

      {cardPlayer && <PlayerCard player={cardPlayer} onClose={() => setCardPlayer(null)} />}
    </section>
  );
}
