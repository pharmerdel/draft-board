export const MAX_PERSONAL_TIER = 12;
export const PERSONAL_TIER_VALUES = Object.freeze([
  ...Array.from({ length: MAX_PERSONAL_TIER }, (_, index) => index + 1),
  'avoid',
]);
export const PERSONAL_TIER_SCOPES = Object.freeze(['QB', 'RB', 'WR', 'TE', 'FLEX']);

export function isPersonalTier(value) {
  return PERSONAL_TIER_VALUES.includes(value);
}

export function isPersonalTierScope(value) {
  return PERSONAL_TIER_SCOPES.includes(value);
}

export function playerMatchesTierScope(player, scope) {
  if (!player || !isPersonalTierScope(scope)) return false;
  return scope === 'FLEX'
    ? ['RB', 'WR', 'TE'].includes(player.position)
    : player.position === scope;
}

export function personalTierForPlayer(personalTiers, scope, playerId) {
  const tier = personalTiers?.[scope]?.[playerId];
  return isPersonalTier(tier) ? tier : null;
}

export function buildPersonalTierUpdates(scope, playerIds, tier) {
  if (!isPersonalTierScope(scope)) throw new TypeError('Unknown personal tier scope.');
  if (!Array.isArray(playerIds) || playerIds.length === 0) return null;
  if (tier !== null && !isPersonalTier(tier)) {
    throw new TypeError(`Personal tier must be 1 through ${MAX_PERSONAL_TIER}, avoid, or null.`);
  }

  const uniquePlayerIds = [...new Set(playerIds.filter(playerId => (
    typeof playerId === 'string' && playerId.trim().length > 0
  )))];
  if (uniquePlayerIds.length === 0) return null;

  return Object.fromEntries(uniquePlayerIds.map(playerId => [`${scope}/${playerId}`, tier]));
}

export function applyPersonalTierUpdates(personalTiers, updates) {
  const next = Object.fromEntries(Object.entries(personalTiers || {}).map(
    ([scope, assignments]) => [scope, { ...assignments }],
  ));

  Object.entries(updates || {}).forEach(([path, tier]) => {
    const [scope, playerId, ...rest] = path.split('/');
    if (!isPersonalTierScope(scope) || !playerId || rest.length) return;
    if (!next[scope]) next[scope] = {};
    if (tier === null) delete next[scope][playerId];
    else if (isPersonalTier(tier)) next[scope][playerId] = tier;
    if (Object.keys(next[scope]).length === 0) delete next[scope];
  });
  return next;
}

function tiersForOrderedPlayers(personalTiers, scope, playerIds) {
  return playerIds.map(playerId => personalTierForPlayer(personalTiers, scope, playerId) || 1);
}

export function buildInsertTierBoundaryUpdates({ personalTiers, scope, playerIds, beforeIndex }) {
  if (!Number.isInteger(beforeIndex) || beforeIndex <= 0 || beforeIndex >= playerIds.length) return null;
  const tiers = tiersForOrderedPlayers(personalTiers, scope, playerIds);
  const leftTier = tiers[beforeIndex - 1];
  const rightTier = tiers[beforeIndex];
  if (leftTier === 'avoid' || rightTier === 'avoid' || leftTier !== rightTier || leftTier >= MAX_PERSONAL_TIER) return null;

  const nextTiers = tiers.map((tier, index) => (
    index >= beforeIndex && tier !== 'avoid' ? Math.min(MAX_PERSONAL_TIER, tier + 1) : tier
  ));
  return Object.fromEntries(playerIds.map((playerId, index) => [
    `${scope}/${playerId}`,
    nextTiers[index],
  ]));
}

export function buildRemoveTierBoundaryUpdates({ personalTiers, scope, playerIds, beforeIndex }) {
  if (!Number.isInteger(beforeIndex) || beforeIndex <= 0 || beforeIndex >= playerIds.length) return null;
  const tiers = tiersForOrderedPlayers(personalTiers, scope, playerIds);
  const leftTier = tiers[beforeIndex - 1];
  const rightTier = tiers[beforeIndex];
  if (leftTier === rightTier) return null;

  if (rightTier === 'avoid') {
    return buildPersonalTierUpdates(scope, playerIds.slice(beforeIndex), leftTier);
  }
  if (leftTier === 'avoid' || typeof rightTier !== 'number') return null;

  const nextTiers = tiers.map((tier, index) => (
    index >= beforeIndex && typeof tier === 'number' ? Math.max(1, tier - 1) : tier
  ));
  return Object.fromEntries(playerIds.map((playerId, index) => [
    `${scope}/${playerId}`,
    nextTiers[index],
  ]));
}

export function buildMoveTierBoundaryUpdates({ personalTiers, scope, playerIds, fromBeforeIndex, toBeforeIndex }) {
  if (!Number.isInteger(fromBeforeIndex) || !Number.isInteger(toBeforeIndex)) return null;
  if (fromBeforeIndex <= 0 || fromBeforeIndex >= playerIds.length) return null;
  if (toBeforeIndex <= 0 || toBeforeIndex >= playerIds.length || toBeforeIndex === fromBeforeIndex) return null;

  const tiers = tiersForOrderedPlayers(personalTiers, scope, playerIds);
  const leftTier = tiers[fromBeforeIndex - 1];
  const rightTier = tiers[fromBeforeIndex];
  if (leftTier === rightTier) return null;

  let previousBoundary = 0;
  for (let index = fromBeforeIndex - 1; index > 0; index -= 1) {
    if (tiers[index] !== tiers[index - 1]) {
      previousBoundary = index;
      break;
    }
  }

  let nextBoundary = playerIds.length;
  for (let index = fromBeforeIndex + 1; index < playerIds.length; index += 1) {
    if (tiers[index] !== tiers[index - 1]) {
      nextBoundary = index;
      break;
    }
  }

  if (toBeforeIndex <= previousBoundary || toBeforeIndex >= nextBoundary) return null;

  const updates = {};
  if (toBeforeIndex < fromBeforeIndex) {
    playerIds.slice(toBeforeIndex, fromBeforeIndex).forEach(playerId => {
      updates[`${scope}/${playerId}`] = rightTier;
    });
  } else {
    playerIds.slice(fromBeforeIndex, toBeforeIndex).forEach(playerId => {
      updates[`${scope}/${playerId}`] = leftTier;
    });
  }
  return Object.keys(updates).length ? updates : null;
}

export function buildTierUpdateForMovedPlayer({ personalTiers, scope, activePlayerId, overPlayerId }) {
  if (!isPersonalTierScope(scope)) return null;
  if (!activePlayerId || !overPlayerId || activePlayerId === overPlayerId) return null;
  if (Object.keys(personalTiers?.[scope] || {}).length === 0) return null;

  const currentTier = personalTierForPlayer(personalTiers, scope, activePlayerId) || 1;
  const destinationTier = personalTierForPlayer(personalTiers, scope, overPlayerId) || 1;
  return currentTier === destinationTier
    ? null
    : { [`${scope}/${activePlayerId}`]: destinationTier };
}

export function buildAvoidCutoffUpdates({ scope, playerIds, beforeIndex }) {
  if (!Number.isInteger(beforeIndex) || beforeIndex <= 0 || beforeIndex >= playerIds.length) return null;
  return buildPersonalTierUpdates(scope, playerIds.slice(beforeIndex), 'avoid');
}
