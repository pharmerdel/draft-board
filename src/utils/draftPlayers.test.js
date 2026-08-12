import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDraftPlayers, summarizeDraftPlayers } from './draftPlayers.js';

test('copies only active catalog players into stable draft-player keys', () => {
  const result = buildDraftPlayers({
    123: { name: 'Active Player', position: 'RB', overallRank: 1, positionalRank: 1, sharedTier: 1, nflTeam: 'DET', sleeperPlayerId: '123', catalogStatus: 'active', catalogCreatedAt: 'not-copied' },
    999: { name: 'Inactive Player', position: 'WR', catalogStatus: 'inactive' },
  });
  assert.deepEqual(Object.keys(result), ['123']);
  assert.equal(result[123].status, 'available');
  assert.equal(result[123].soldTo, null);
  assert.equal(result[123].catalogCreatedAt, undefined);
});

test('summarizes draft players by supported position', () => {
  const summary = summarizeDraftPlayers({ 1: { position: 'QB' }, 2: { position: 'RB' }, 3: { position: 'RB' }, 4: { position: 'WR' } });
  assert.deepEqual(summary, { count: 4, positions: { QB: 1, RB: 2, WR: 1, TE: 0 } });
});
