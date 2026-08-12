import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReorderedPersonalRanks,
  buildReorderedPersonalRankResult,
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

test('FLEX reordering moves RB, WR, and TE together while leaving QB slots intact', () => {
  const flexPlayers = {
    ...players,
    e: { name: 'Echo', position: 'TE', overallRank: 5 },
  };
  const ranks = buildReorderedPersonalRanks({
    players: flexPlayers,
    personalRanks: {},
    activeId: 'e',
    overId: 'a',
    position: 'FLEX',
  });
  assert.deepEqual(ranks, { e: 1, a: 2, b: 3, d: 4, c: 5 });
});

test('reorder result exposes the exact scoped order used for tier slot reassignment', () => {
  const result = buildReorderedPersonalRankResult({
    players,
    personalRanks: {},
    activeId: 'a',
    overId: 'c',
    position: 'RB',
  });
  assert.deepEqual(result.reorderedPlayerIds, ['c', 'a']);
  assert.deepEqual(result.ranks, { c: 1, b: 2, a: 3, d: 4 });
});

test('sold players are excluded from the reordered preference sequence', () => {
  const result = buildReorderedPersonalRankResult({
    players: { ...players, b: { ...players.b, status: 'sold' } },
    personalRanks: {},
    activeId: 'd',
    overId: 'a',
    position: 'ALL',
  });
  assert.deepEqual(result.reorderedPlayerIds, ['d', 'a', 'c']);
  assert.deepEqual(result.ranks, { d: 1, a: 2, c: 3 });
});
