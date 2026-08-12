const DRAFT_PLAYER_FIELDS = [
  'name', 'position', 'positionalRank', 'overallRank', 'sharedTier', 'nflTeam',
  'projectedValue', 'sleeperPlayerId', 'headshotUrl', 'espnId', 'injuryStatus',
  'injuryBodyPart', 'injuryNotes',
];

export function buildDraftPlayers(playerCatalog) {
  const draftPlayers = {};
  for (const [stablePlayerId, catalogPlayer] of Object.entries(playerCatalog || {})) {
    if (catalogPlayer?.catalogStatus !== 'active') continue;
    draftPlayers[stablePlayerId] = {
      ...Object.fromEntries(DRAFT_PLAYER_FIELDS.map(field => [field, catalogPlayer[field] ?? null])),
      status: 'available',
      soldTo: null,
      soldPrice: null,
    };
  }
  return draftPlayers;
}

export function summarizeDraftPlayers(draftPlayers) {
  const positions = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const player of Object.values(draftPlayers || {})) {
    if (Object.hasOwn(positions, player.position)) positions[player.position]++;
  }
  return { count: Object.keys(draftPlayers || {}).length, positions };
}
