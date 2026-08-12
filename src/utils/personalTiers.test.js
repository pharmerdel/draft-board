import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPersonalTierUpdates,
  buildAvoidCutoffUpdates,
  buildInsertTierBoundaryUpdates,
  buildMoveTierBoundaryUpdates,
  buildPersonalTierUpdates,
  buildRemoveTierBoundaryUpdates,
  buildTierUpdateForMovedPlayer,
  isPersonalTier,
  isPersonalTierScope,
  personalTierForPlayer,
  playerMatchesTierScope,
} from './personalTiers.js';

test('accepts the supported tier values and scopes', () => {
  [1, 2, 5, 8, 12, 'avoid'].forEach(tier => assert.equal(isPersonalTier(tier), true));
  ['QB', 'RB', 'WR', 'TE', 'FLEX'].forEach(scope => assert.equal(isPersonalTierScope(scope), true));
  assert.equal(isPersonalTier(13), false);
  assert.equal(isPersonalTierScope('ALL'), false);
});

test('FLEX includes RB, WR, and TE but not QB', () => {
  ['RB', 'WR', 'TE'].forEach(position => (
    assert.equal(playerMatchesTierScope({ position }, 'FLEX'), true)
  ));
  assert.equal(playerMatchesTierScope({ position: 'QB' }, 'FLEX'), false);
});

test('builds one deduplicated scoped bulk update', () => {
  assert.deepEqual(
    buildPersonalTierUpdates('RB', ['rb-1', 'rb-2', 'rb-1'], 2),
    { 'RB/rb-1': 2, 'RB/rb-2': 2 },
  );
});

test('the same player can have independent TE and FLEX tiers', () => {
  const tiers = applyPersonalTierUpdates({}, {
    'TE/bowers': 1,
    'FLEX/bowers': 3,
  });
  assert.equal(personalTierForPlayer(tiers, 'TE', 'bowers'), 1);
  assert.equal(personalTierForPlayer(tiers, 'FLEX', 'bowers'), 3);
});

test('inserts and removes a contiguous numeric boundary', () => {
  const playerIds = ['a', 'b', 'c', 'd'];
  const inserted = buildInsertTierBoundaryUpdates({ personalTiers: {}, scope: 'RB', playerIds, beforeIndex: 2 });
  assert.deepEqual(inserted, { 'RB/a': 1, 'RB/b': 1, 'RB/c': 2, 'RB/d': 2 });

  const tiers = applyPersonalTierUpdates({}, inserted);
  assert.deepEqual(
    buildRemoveTierBoundaryUpdates({ personalTiers: tiers, scope: 'RB', playerIds, beforeIndex: 2 }),
    { 'RB/a': 1, 'RB/b': 1, 'RB/c': 1, 'RB/d': 1 },
  );
});

test('an avoid cutoff assigns every player below the selected boundary', () => {
  assert.deepEqual(
    buildAvoidCutoffUpdates({ scope: 'FLEX', playerIds: ['a', 'b', 'c'], beforeIndex: 1 }),
    { 'FLEX/b': 'avoid', 'FLEX/c': 'avoid' },
  );
});

test('moves an established boundary without changing player order', () => {
  const playerIds = ['a', 'b', 'c', 'd', 'e'];
  const personalTiers = { RB: { a: 1, b: 1, c: 2, d: 2, e: 2 } };

  assert.deepEqual(
    buildMoveTierBoundaryUpdates({ personalTiers, scope: 'RB', playerIds, fromBeforeIndex: 2, toBeforeIndex: 3 }),
    { 'RB/c': 1 },
  );
  assert.deepEqual(
    buildMoveTierBoundaryUpdates({ personalTiers, scope: 'RB', playerIds, fromBeforeIndex: 2, toBeforeIndex: 1 }),
    { 'RB/b': 2 },
  );
});

test('a tier boundary cannot cross an adjacent boundary or empty a tier', () => {
  const playerIds = ['a', 'b', 'c', 'd', 'e', 'f'];
  const personalTiers = { WR: { a: 1, b: 1, c: 2, d: 2, e: 3, f: 3 } };

  assert.equal(
    buildMoveTierBoundaryUpdates({ personalTiers, scope: 'WR', playerIds, fromBeforeIndex: 2, toBeforeIndex: 4 }),
    null,
  );
  assert.equal(
    buildMoveTierBoundaryUpdates({ personalTiers, scope: 'WR', playerIds, fromBeforeIndex: 4, toBeforeIndex: 2 }),
    null,
  );
});

test('reordering across a tier line changes only the moved player', () => {
  const personalTiers = { RB: { a: 1, b: 1, c: 2, d: 2 } };
  assert.deepEqual(
    buildTierUpdateForMovedPlayer({
      personalTiers,
      scope: 'RB',
      activePlayerId: 'a',
      overPlayerId: 'c',
    }),
    { 'RB/a': 2 },
  );
});

test('same-tier reordering needs no tier update and a player can move into Avoid', () => {
  const personalTiers = { FLEX: { a: 1, b: 1, c: 'avoid', d: 'avoid' } };
  assert.equal(
    buildTierUpdateForMovedPlayer({
      personalTiers,
      scope: 'FLEX',
      activePlayerId: 'a',
      overPlayerId: 'b',
    }),
    null,
  );
  assert.deepEqual(
    buildTierUpdateForMovedPlayer({
      personalTiers,
      scope: 'FLEX',
      activePlayerId: 'b',
      overPlayerId: 'c',
    }),
    { 'FLEX/b': 'avoid' },
  );
});

test('clearing scoped tiers cannot mutate or reorder personal rankings', () => {
  const personalRanks = { 'rb-1': 2, 'rb-2': 1, 'wr-1': 3 };
  const originalRanks = structuredClone(personalRanks);
  const current = { RB: { 'rb-1': 1, 'rb-2': 2 }, FLEX: { 'rb-1': 3 } };
  const updates = buildPersonalTierUpdates('RB', ['rb-1', 'rb-2'], null);

  assert.deepEqual(applyPersonalTierUpdates(current, updates), { FLEX: { 'rb-1': 3 } });
  assert.deepEqual(personalRanks, originalRanks);
});

test('rejects unknown scopes and invalid tier values before writing', () => {
  assert.throws(() => buildPersonalTierUpdates('ALL', ['rb-1'], 1), /Unknown personal tier scope/);
  assert.throws(() => buildPersonalTierUpdates('RB', ['rb-1'], 13), /Personal tier must/);
});
