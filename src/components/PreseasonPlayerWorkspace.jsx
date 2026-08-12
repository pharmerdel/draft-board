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
import { Check, ChevronDown, ChevronUp, FileUp, GripVertical, Info, Layers3, Search, Star, X } from 'lucide-react';

import OwnerRankImportModal from './OwnerRankImportModal';
import PlayerCard from './PlayerCard';
import {
  buildReorderedPersonalRankResult,
  effectivePlayerRank,
  sortPlayersByPreference,
} from '../utils/personalRankings';
import {
  buildAvoidCutoffUpdates,
  buildInsertTierBoundaryUpdates,
  buildMoveTierBoundaryUpdates,
  buildPersonalTierUpdates,
  buildRemoveTierBoundaryUpdates,
  buildTierUpdateForMovedPlayer,
  MAX_PERSONAL_TIER,
  personalTierForPlayer,
  playerMatchesTierScope,
} from '../utils/personalTiers';
import './PreseasonPlayerWorkspace.css';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX'];

function TierBoundary({ tier, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onRemove }) {
  return (
    <div className={`ps-tier-heading ps-tier-boundary ${tier === 'avoid' ? 'avoid' : ''}`}>
      <div className="ps-tier-boundary-label">
        <span>{tier === 'avoid' ? 'Avoid cutoff' : `Tier ${tier} cutoff`}</span>
        <small>Use arrows to adjust</small>
      </div>
      <div className="ps-tier-boundary-actions">
        <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={`Move ${tier === 'avoid' ? 'Avoid' : `Tier ${tier}`} boundary up one player`}>
          <ChevronUp size={16} />
        </button>
        <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={`Move ${tier === 'avoid' ? 'Avoid' : `Tier ${tier}`} boundary down one player`}>
          <ChevronDown size={16} />
        </button>
        <button type="button" className="ps-tier-remove" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

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

function PlayerRow({ player, rank, watched, draggable, onToggleWatch, onOpen, active, tierSelectable, onSelectTier }) {
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
    <article ref={setNodeRef} style={style} className={`ps-player-row ${isSorting ? 'sorting' : ''} ${tierSelectable ? 'tier-selectable' : ''}`}>
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
      <button
        className="ps-player-identity"
        type="button"
        onClick={() => tierSelectable ? onSelectTier() : onOpen(player)}
        aria-label={tierSelectable ? `Choose ${player.name} as the tier boundary` : undefined}
      >
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
  personalTiers,
  watchlist,
  onSavePersonalRanks,
  onSavePersonalTiers,
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
  const [showImport, setShowImport] = useState(false);
  const [tierMode, setTierMode] = useState(false);
  const [placingAvoid, setPlacingAvoid] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 175, tolerance: 6 } }),
  );

  const rankedPlayers = useMemo(
    () => sortPlayersByPreference(players, personalRanks).filter(player => player.status !== 'sold'),
    [players, personalRanks],
  );
  const positionPlayers = useMemo(
    () => rankedPlayers.filter(player => (
      position === 'ALL' || playerMatchesTierScope(player, position)
    )),
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
  const canDrag = view === 'rankings' && !isSearching && !tierMode;
  const tierPlayerIds = positionPlayers.map(player => player.id);
  const tierAssignments = personalTiers?.[position] || {};
  const hasTierAssignments = Object.keys(tierAssignments).length > 0;
  const hasAvoidCutoff = tierPlayerIds.some(playerId => personalTierForPlayer(personalTiers, position, playerId) === 'avoid');
  const highestNumberedTier = tierPlayerIds.reduce((highest, playerId) => {
    const tier = personalTierForPlayer(personalTiers, position, playerId);
    return typeof tier === 'number' ? Math.max(highest, tier) : highest;
  }, 1);
  const showTierHeadings = position !== 'ALL' && view === 'rankings' && !isSearching
    && (tierMode || hasTierAssignments);

  function handleDragEnd({ active, over }) {
    setActiveDragId(null);
    if (!over) return;
    const reorderResult = buildReorderedPersonalRankResult({
      players,
      personalRanks,
      activeId: active.id,
      overId: over.id,
      position,
    });
    if (!reorderResult) return;

    const tierUpdates = position !== 'ALL'
      ? buildTierUpdateForMovedPlayer({
          personalTiers,
          scope: position,
          activePlayerId: active.id,
          overPlayerId: over.id,
        })
      : null;
    onSavePersonalRanks(reorderResult.ranks, tierUpdates);
  }

  function enterTierMode() {
    setView('rankings');
    setSearch('');
    setPlacingAvoid(false);
    setTierMode(true);
  }

  function leaveTierMode() {
    setTierMode(false);
    setPlacingAvoid(false);
  }

  function insertTierBoundary(beforeIndex) {
    const updates = buildInsertTierBoundaryUpdates({ personalTiers, scope: position, playerIds: tierPlayerIds, beforeIndex });
    if (updates) onSavePersonalTiers(updates);
  }

  function removeTierBoundary(beforeIndex) {
    const updates = buildRemoveTierBoundaryUpdates({ personalTiers, scope: position, playerIds: tierPlayerIds, beforeIndex });
    if (updates) onSavePersonalTiers(updates);
  }

  function moveTierBoundary(fromBeforeIndex, toBeforeIndex) {
    const updates = buildMoveTierBoundaryUpdates({
      personalTiers,
      scope: position,
      playerIds: tierPlayerIds,
      fromBeforeIndex,
      toBeforeIndex,
    });
    if (updates) onSavePersonalTiers(updates);
  }

  function placeAvoidCutoff(firstAvoidIndex) {
    const updates = buildAvoidCutoffUpdates({ scope: position, playerIds: tierPlayerIds, beforeIndex: firstAvoidIndex });
    if (updates) onSavePersonalTiers(updates);
    setPlacingAvoid(false);
  }

  function clearPositionTiers() {
    const assignedIds = Object.keys(tierAssignments);
    if (!assignedIds.length) return;
    if (!window.confirm(`Clear all ${position} tiers? Your player order will not change.`)) return;
    onSavePersonalTiers(buildPersonalTierUpdates(position, assignedIds, null));
    setPlacingAvoid(false);
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
          <button type="button" className={view === 'starred' ? 'active' : ''} onClick={() => { setView('starred'); leaveTierMode(); }}>
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
        <button className="ps-import-button" type="button" onClick={() => setShowImport(true)}>
          <FileUp size={16} /> Import CSV
        </button>
        {position !== 'ALL' && view === 'rankings' && !tierMode && hasTierAssignments && (
          <button className="ps-tier-mode-button" type="button" onClick={enterTierMode}>
            <Layers3 size={16} /> Edit tiers
          </button>
        )}
        {tierMode && (
          <button className="ps-tier-mode-button active" type="button" onClick={leaveTierMode}>
            <X size={16} /> Done tiering
          </button>
        )}
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
              onClick={() => {
                setPosition(item);
                leaveTierMode();
              }}
            >
              {item === 'FLEX' ? <><span>FLEX</span><small>RB/WR/TE</small></> : item}
            </button>
          ))}
        </div>
      </div>

      {tierMode && (
        <div className="ps-tier-tools">
          <div>
            <strong>{position} tier builder</strong>
            <span>
              {placingAvoid
                ? 'Tap the first player you want placed in Avoid.'
                : highestNumberedTier >= MAX_PERSONAL_TIER
                  ? `All ${MAX_PERSONAL_TIER} numbered tiers are available. Set an Avoid cutoff or finish editing.`
                  : hasTierAssignments
                    ? `Use a divider's arrows to adjust its cutoff, or tap the last Tier ${highestNumberedTier} player to create the next tier.`
                  : 'Start at the top: tap the last player you want in Tier 1. We will place the first divider beneath that player.'}
            </span>
          </div>
          <button
            type="button"
            className={placingAvoid ? 'active avoid' : ''}
            onClick={() => setPlacingAvoid(current => !current)}
            disabled={hasAvoidCutoff}
          >
            {hasAvoidCutoff ? 'Avoid cutoff set' : placingAvoid ? 'Cancel Avoid' : 'Set Avoid cutoff'}
          </button>
          <button type="button" onClick={clearPositionTiers} disabled={!Object.keys(tierAssignments).length}>
            Clear {position} tiers
          </button>
        </div>
      )}

      {!tierMode && position !== 'ALL' && view === 'rankings' && !isSearching && !hasTierAssignments && (
        <div className="ps-tier-intro">
          <Layers3 size={19} />
          <div>
            <strong>Tiers are optional</strong>
            <span>They group this list without changing your player order. Select the last player in each tier to create a divider, then use its arrow buttons to fine-tune the cutoff.</span>
          </div>
          <button type="button" onClick={enterTierMode}>Create {position} tiers</button>
        </div>
      )}

      <div className="ps-list-note">
        <span>{visiblePlayers.length} {view === 'starred' ? 'starred' : position === 'ALL' ? 'players' : position + 's'}</span>
        <span>{tierMode ? 'Tap a player name to add the next boundary, or use a divider’s arrows to adjust it. Player order will not change.' : canDrag ? 'Drag players into your preferred order.' : isSearching ? 'Clear search to reorder players.' : 'Star players from the Rankings view.'}</span>
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
              {visiblePlayers.map((player, index) => {
                const tier = showTierHeadings ? (personalTierForPlayer(personalTiers, position, player.id) || 1) : null;
                const previousTier = index > 0
                  ? (personalTierForPlayer(personalTiers, position, visiblePlayers[index - 1].id) || 1)
                  : null;
                const nextTier = index < visiblePlayers.length - 1
                  ? (personalTierForPlayer(personalTiers, position, visiblePlayers[index + 1].id) || 1)
                  : null;
                const startsTier = showTierHeadings && (index === 0 || tier !== previousTier);
                const canStartNextTier = tierMode && !placingAvoid && highestNumberedTier < MAX_PERSONAL_TIER
                  && index < visiblePlayers.length - 1
                  && tier === highestNumberedTier && nextTier === highestNumberedTier;
                const canPlaceAvoid = tierMode && placingAvoid && index > 0 && tier !== 'avoid';
                const tierSelectable = canStartNextTier || canPlaceAvoid;

                return (
                  <div className="ps-tier-row-group" key={player.id}>
                    {startsTier && (
                      tierMode && index > 0
                        ? <TierBoundary
                            tier={tier}
                            canMoveUp={index > 1 && personalTierForPlayer(personalTiers, position, visiblePlayers[index - 2].id) === previousTier}
                            canMoveDown={index < visiblePlayers.length - 1 && nextTier === tier}
                            onMoveUp={() => moveTierBoundary(index, index - 1)}
                            onMoveDown={() => moveTierBoundary(index, index + 1)}
                            onRemove={() => removeTierBoundary(index)}
                          />
                        : <div className={`ps-tier-heading ${tier === 'avoid' ? 'avoid' : ''}`}><span>{tier === 'avoid' ? 'Avoid' : `Tier ${tier}`}</span></div>
                    )}
                    <PlayerRow
                      player={player}
                      rank={effectivePlayerRank(player.id, players, personalRanks)}
                      watched={Boolean(watchlist[player.id])}
                      draggable={canDrag}
                      onToggleWatch={onToggleWatch}
                      onOpen={setCardPlayer}
                      active={activeDragId === player.id}
                      tierSelectable={tierSelectable}
                      onSelectTier={() => canPlaceAvoid ? placeAvoidCutoff(index) : insertTierBoundary(index + 1)}
                    />
                  </div>
                );
              })}
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
      {showImport && (
        <OwnerRankImportModal
          players={players}
          personalRanks={personalRanks}
          onClose={() => setShowImport(false)}
          onImport={onSavePersonalRanks}
        />
      )}
    </section>
  );
}
