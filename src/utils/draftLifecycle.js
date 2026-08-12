export function buildPreseasonDraft({ leagueName, catalogMetadata, now = Date.now() }) {
  return {
    leagueName: leagueName.trim(),
    status: 'preseason',
    currentNomination: null,
    playerCatalogImportedAt: catalogMetadata?.importedAt || null,
    playerCatalogSourceSha256: catalogMetadata?.sourceSha256 || null,
    createdAt: now,
  };
}

export function buildDraftDayLobbyUpdates(teams) {
  const updates = {
    'draft/status': 'lobby',
    'draft/nominationOrderIds': null,
    'draft/nominationIndex': null,
    'draft/nominatingTeamId': null,
    'draft/nominationOrderRandomizedAt': null,
    'draft/currentNomination': null,
  };

  Object.keys(teams || {}).forEach(teamId => {
    updates[`teams/${teamId}/nominationOrder`] = null;
  });

  return updates;
}

export function hasOfficialNominationOrder(draft, teams) {
  const teamIds = Object.keys(teams || {});
  const orderIds = Array.isArray(draft?.nominationOrderIds) ? draft.nominationOrderIds : [];
  if (!teamIds.length || orderIds.length !== teamIds.length || new Set(orderIds).size !== teamIds.length) return false;
  if (!orderIds.every(teamId => teamIds.includes(teamId))) return false;
  return orderIds.every((teamId, index) => Number(teams[teamId]?.nominationOrder) === index + 1);
}

export function sortTeamsForDisplay(teams, useNominationOrder = false) {
  return Object.entries(teams || {})
    .filter(([, team]) => team?.name || team?.ownerName)
    .sort((left, right) => {
      if (useNominationOrder) {
        const orderDifference = Number(left[1].nominationOrder || 999) - Number(right[1].nominationOrder || 999);
        if (orderDifference !== 0) return orderDifference;
      }
      return numericTeamId(left[0]) - numericTeamId(right[0]) || left[0].localeCompare(right[0]);
    });
}

function numericTeamId(teamId) {
  const match = String(teamId).match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}
