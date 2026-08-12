import test from 'node:test';
import assert from 'node:assert/strict';

import { planCatalogRefresh } from './catalogRefresh.js';

const importedAt = '2026-08-12T12:00:00.000Z';
const player = {
  stablePlayerId: '123',
  name: 'Player One',
  position: 'RB',
  positionalRank: 1,
  overallRank: 1,
  sharedTier: 1,
  nflTeam: 'DET',
  projectedValue: null,
  sleeperPlayerId: '123',
  headshotUrl: 'https://example.test/123.jpg',
  espnId: null,
  injuryStatus: null,
  injuryBodyPart: null,
  injuryNotes: null,
  catalogMatchStatus: 'exact',
};
const report = {
  schemaVersion: 1,
  source: { fileName: 'rankings.csv', sha256: 'abc' },
  sleeper: { url: 'https://api.sleeper.app/v1/players/nfl' },
  summary: { ambiguous: 0, unmatched: 0 },
  players: [player],
};

test('plans additions without touching unrelated root paths', () => {
  const plan = planCatalogRefresh(report, {}, importedAt);
  assert.equal(plan.summary.additions, 1);
  assert.deepEqual(Object.keys(plan.rootUpdate).sort(), ['catalogMetadata', 'playerCatalog/123']);
  assert.equal(plan.rootUpdate['playerCatalog/123'].catalogStatus, 'active');
});

test('is idempotent and marks missing catalog players inactive', () => {
  const first = planCatalogRefresh(report, {}, importedAt);
  const current = {
    123: first.rootUpdate['playerCatalog/123'],
    999: { name: 'Old Player', catalogStatus: 'active', catalogCreatedAt: importedAt },
  };
  const second = planCatalogRefresh(report, current, importedAt);
  assert.equal(second.summary.unchanged, 1);
  assert.equal(second.summary.deactivations, 1);
  assert.equal(second.rootUpdate['playerCatalog/999/catalogStatus'], 'inactive');
  assert.equal(second.rootUpdate['playerCatalog/123'], undefined);
});
