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

export function buildReorderedPersonalRankResult({
  players,
  personalRanks,
  activeId,
  overId,
  position = 'ALL',
}) {
  const allPlayers = sortPlayersByPreference(players, personalRanks)
    .filter(player => player.status !== 'sold');
  const visiblePlayers = position === 'ALL'
    ? allPlayers
    : allPlayers.filter(player => position === 'FLEX'
      ? ['RB', 'WR', 'TE'].includes(player.position)
      : player.position === position);
  const oldIndex = visiblePlayers.findIndex(player => player.id === activeId);
  const newIndex = visiblePlayers.findIndex(player => player.id === overId);

  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return null;

  const reordered = [...visiblePlayers];
  const [movedPlayer] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, movedPlayer);

  if (position === 'ALL') {
    return {
      ranks: Object.fromEntries(reordered.map((player, index) => [player.id, index + 1])),
      reorderedPlayerIds: reordered.map(player => player.id),
    };
  }

  let positionIndex = 0;
  const completeOrder = allPlayers.map(player => (
    (position === 'FLEX' ? ['RB', 'WR', 'TE'].includes(player.position) : player.position === position)
      ? reordered[positionIndex++]
      : player
  ));
  return {
    ranks: Object.fromEntries(completeOrder.map((player, index) => [player.id, index + 1])),
    reorderedPlayerIds: reordered.map(player => player.id),
  };
}

export function buildReorderedPersonalRanks(options) {
  return buildReorderedPersonalRankResult(options)?.ranks || null;
}
