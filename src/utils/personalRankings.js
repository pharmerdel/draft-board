function fallbackRank(player) {
  return Number.isInteger(player?.overallRank) ? player.overallRank : 10000;
}

export function effectivePlayerRank(playerId, players, personalRanks) {
  const personalRank = personalRanks?.[playerId];
  return Number.isInteger(personalRank) ? personalRank : fallbackRank(players?.[playerId]);
}

export function sortPlayersByPreference(players, personalRanks) {
  return Object.entries(players || {})
    .map(([id, player]) => ({ id, ...player }))
    .sort((left, right) => {
      const rankDifference = effectivePlayerRank(left.id, players, personalRanks)
        - effectivePlayerRank(right.id, players, personalRanks);
      if (rankDifference) return rankDifference;

      const sharedRankDifference = fallbackRank(left) - fallbackRank(right);
      if (sharedRankDifference) return sharedRankDifference;
      return left.name.localeCompare(right.name);
    });
}

export function buildReorderedPersonalRanks({
  players,
  personalRanks,
  activeId,
  overId,
  position = 'ALL',
}) {
  const allPlayers = sortPlayersByPreference(players, personalRanks);
  const visiblePlayers = position === 'ALL'
    ? allPlayers
    : allPlayers.filter(player => player.position === position);
  const oldIndex = visiblePlayers.findIndex(player => player.id === activeId);
  const newIndex = visiblePlayers.findIndex(player => player.id === overId);

  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return null;

  const reordered = [...visiblePlayers];
  const [movedPlayer] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, movedPlayer);

  if (position === 'ALL') {
    return Object.fromEntries(reordered.map((player, index) => [player.id, index + 1]));
  }

  let positionIndex = 0;
  const completeOrder = allPlayers.map(player => (
    player.position === position ? reordered[positionIndex++] : player
  ));
  return Object.fromEntries(completeOrder.map((player, index) => [player.id, index + 1]));
}
