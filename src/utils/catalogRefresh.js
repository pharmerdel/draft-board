const SHARED_FIELDS = [
  'name',
  'position',
  'positionalRank',
  'overallRank',
  'sharedTier',
  'nflTeam',
  'projectedValue',
  'sleeperPlayerId',
  'headshotUrl',
  'espnId',
  'injuryStatus',
  'injuryBodyPart',
  'injuryNotes',
  'catalogMatchStatus',
  'catalogStatus',
];

function sharedRecord(player) {
  return {
    name: player.name,
    position: player.position,
    positionalRank: player.positionalRank,
    overallRank: player.overallRank,
    sharedTier: player.sharedTier,
    nflTeam: player.nflTeam,
    projectedValue: player.projectedValue,
    sleeperPlayerId: player.sleeperPlayerId,
    headshotUrl: player.headshotUrl,
    espnId: player.espnId,
    injuryStatus: player.injuryStatus,
    injuryBodyPart: player.injuryBodyPart,
    injuryNotes: player.injuryNotes,
    catalogMatchStatus: player.catalogMatchStatus,
    catalogStatus: 'active',
  };
}

function comparable(record) {
  return Object.fromEntries(SHARED_FIELDS.map(field => [field, record?.[field] ?? null]));
}

function recordsEqual(left, right) {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export function planCatalogRefresh(previewReport, currentCatalog = {}, importedAt = new Date().toISOString()) {
  const additions = [];
  const changes = [];
  const unchanged = [];
  const deactivations = [];
  const rootUpdate = {};
  const incomingIds = new Set();

  for (const player of previewReport.players) {
    const stablePlayerId = player.stablePlayerId;
    incomingIds.add(stablePlayerId);
    const existing = currentCatalog?.[stablePlayerId] || null;
    const next = sharedRecord(player);

    if (!existing) additions.push(stablePlayerId);
    else if (recordsEqual(existing, next)) unchanged.push(stablePlayerId);
    else changes.push(stablePlayerId);

    if (!existing || !recordsEqual(existing, next)) {
      rootUpdate[`playerCatalog/${stablePlayerId}`] = {
        ...next,
        catalogCreatedAt: existing?.catalogCreatedAt || importedAt,
        catalogUpdatedAt: importedAt,
      };
    }
  }

  for (const [stablePlayerId, existing] of Object.entries(currentCatalog || {})) {
    if (incomingIds.has(stablePlayerId) || existing?.catalogStatus === 'inactive') continue;
    deactivations.push(stablePlayerId);
    rootUpdate[`playerCatalog/${stablePlayerId}/catalogStatus`] = 'inactive';
    rootUpdate[`playerCatalog/${stablePlayerId}/catalogUpdatedAt`] = importedAt;
  }

  const summary = {
    totalIncoming: previewReport.players.length,
    additions: additions.length,
    changes: changes.length,
    unchanged: unchanged.length,
    deactivations: deactivations.length,
    ambiguous: previewReport.summary.ambiguous,
    unmatched: previewReport.summary.unmatched,
  };

  rootUpdate.catalogMetadata = {
    schemaVersion: previewReport.schemaVersion,
    sourceFileName: previewReport.source.fileName,
    sourceSha256: previewReport.source.sha256,
    sleeperSourceUrl: previewReport.sleeper.url,
    importedAt,
    summary,
  };

  return { rootUpdate, summary, additions, changes, unchanged, deactivations };
}
