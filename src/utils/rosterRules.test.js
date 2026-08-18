import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SLOT_LIMITS,
  TOTAL_DRAFT_SLOTS,
  autoAssignSlot,
  findNominatingTeamId,
  isRosterFull,
  maxBid,
  maxBidDisplay,
} from './rosterRules.js';

function teamWithPlayers(filled, budgetRemaining = 200) {
  return {
    budgetRemaining,
    roster: Object.fromEntries(
      Array.from({ length: filled }, (_, index) => [`player_${index}`, { slotType: 'BN' }]),
    ),
  };
}

test('roster constants describe thirteen draft slots', () => {
  assert.equal(TOTAL_DRAFT_SLOTS, 13);
  assert.equal(Object.values(SLOT_LIMITS).reduce((sum, count) => sum + count, 0), 13);
});

test('max bid reserves one dollar for each later open slot', () => {
  assert.equal(maxBid(teamWithPlayers(0, 200)), 188);
  assert.equal(maxBid(teamWithPlayers(1, 200)), 189);
  assert.equal(maxBid(teamWithPlayers(11, 12)), 11);
  assert.equal(maxBid(teamWithPlayers(12, 12)), 12);
});

test('a full roster has no legal bid even when budget remains', () => {
  const team = teamWithPlayers(13, 130);
  assert.equal(isRosterFull(team), true);
  assert.equal(maxBid(team), 0);
  assert.equal(maxBidDisplay(team), 'Roster Full');
});

test('max bid never becomes negative or treats a zero budget as the default', () => {
  assert.equal(maxBid(teamWithPlayers(12, 0)), 0);
  assert.equal(maxBid(teamWithPlayers(0, 1)), 0);
});

test('slot assignment fills primary, flex, then bench and rejects a full roster', () => {
  assert.equal(autoAssignSlot('RB', {}), 'RB');
  assert.equal(autoAssignSlot('RB', {
    rb1: { slotType: 'RB' }, rb2: { slotType: 'RB' },
  }), 'FLEX');
  assert.equal(autoAssignSlot('QB', { qb: { slotType: 'QB' } }), 'BN');

  const fullRoster = {};
  Object.entries(SLOT_LIMITS).forEach(([slot, limit]) => {
    for (let index = 0; index < limit; index += 1) fullRoster[`${slot}_${index}`] = { slotType: slot };
  });
  assert.equal(autoAssignSlot('WR', fullRoster), null);
});

test('nominator selection skips full teams and accounts for a pending sale', () => {
  const teams = {
    team_1: teamWithPlayers(13),
    team_2: teamWithPlayers(12),
    team_3: teamWithPlayers(10),
  };
  const order = ['team_1', 'team_2', 'team_3'];
  assert.equal(findNominatingTeamId(teams, order, 0), 'team_2');
  assert.equal(findNominatingTeamId(teams, order, 1, 'team_2'), 'team_3');
});
