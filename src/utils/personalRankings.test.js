import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReorderedPersonalRanks,
  effectivePlayerRank,
  sortPlayersByPreference,
} from './personalRankings.js';

const players = {
  a: { name: 'Alpha', position: 'RB', overallRank: 1 },
  b: { name: 'Bravo', position: 'WR', overallRank: 2 },
  c: { name: 'Charlie', position: 'RB', overallRank: 3 },
  d: { name: 'Delta', position: 'QB', overallRank: 4 },
};

test('uses a personal rank when present and the shared rank otherwise', () => {
  assert.equal(effectivePlayerRank('a', players, { a: 7 }), 7);
  assert.equal(effectivePlayerRank('b', players, { a: 7 }), 2);
});

test('sorts deterministically when personal and shared ranks tie', () => {
  const sorted = sortPlayersByPreference(players, { a: 3, c: 3 });
  assert.deepEqual(sorted.map(player => player.id), ['b', 'a', 'c', 'd']);
});

test('reordering the full list creates one contiguous personal order', () => {
  const ranks = buildReorderedPersonalRanks({
    players,
    personalRanks: {},
    activeId: 'd',
    overId: 'a',
  });
  assert.deepEqual(ranks, { d: 1, a: 2, b: 3, c: 4 });
});

test('position-only reordering preserves global slots and initializes a complete order', () => {
  const ranks = buildReorderedPersonalRanks({
    players,
    personalRanks: {},
    activeId: 'c',
    overId: 'a',
    position: 'RB',
  });
  assert.deepEqual(ranks, { c: 1, b: 2, a: 3, d: 4 });
});
