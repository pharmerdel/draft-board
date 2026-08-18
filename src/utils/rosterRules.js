export const SLOT_ORDER = Object.freeze(['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN']);
export const SLOT_LIMITS = Object.freeze({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 });
export const TOTAL_DRAFT_SLOTS = Object.values(SLOT_LIMITS).reduce((total, count) => total + count, 0);
export const FLEX_ELIGIBLE = Object.freeze(['RB', 'WR', 'TE']);

export function rosterSize(team) {
  return Object.keys(team?.roster || {}).length;
}

export function openRosterSlots(team) {
  return Math.max(0, TOTAL_DRAFT_SLOTS - rosterSize(team));
}

export function isRosterFull(team) {
  return openRosterSlots(team) === 0;
}

export function maxBid(team) {
  const openSlots = openRosterSlots(team);
  if (openSlots === 0) return 0;

  const budgetRemaining = Math.max(0, Number(team?.budgetRemaining ?? 0));
  return Math.max(0, budgetRemaining - (openSlots - 1));
}

export function maxBidDisplay(team) {
  return isRosterFull(team) ? 'Roster Full' : `$${maxBid(team)}`;
}

export function autoAssignSlot(position, roster = {}) {
  const filled = Object.values(roster);
  const count = slot => filled.filter(player => player.slotType === slot).length;

  if (SLOT_LIMITS[position] && count(position) < SLOT_LIMITS[position]) return position;
  if (FLEX_ELIGIBLE.includes(position) && count('FLEX') < SLOT_LIMITS.FLEX) return 'FLEX';
  if (count('BN') < SLOT_LIMITS.BN) return 'BN';
  return null;
}

export function findNominatingTeamId(teams, nominationOrderIds, startIndex, pendingRosterTeamId = null) {
  const teamCount = nominationOrderIds.length;
  if (teamCount === 0) return null;

  for (let offset = 0; offset < teamCount; offset += 1) {
    const teamId = nominationOrderIds[(startIndex + offset) % teamCount];
    const pendingPlayerCount = teamId === pendingRosterTeamId ? 1 : 0;
    if (rosterSize(teams[teamId]) + pendingPlayerCount < TOTAL_DRAFT_SLOTS) return teamId;
  }
  return null;
}
