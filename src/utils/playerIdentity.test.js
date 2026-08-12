import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCatalogPreview, fallbackPlayerId, normalizePlayerName, normalizeTeam } from './playerIdentity.js';

test('normalizes punctuation, accents, and suffixes', () => {
  assert.equal(normalizePlayerName("D'Andre Swift Jr."), 'dandreswift');
  assert.equal(normalizePlayerName('José Núñez III'), 'josenunez');
});

test('normalizes legacy NFL team abbreviations', () => {
  assert.equal(normalizeTeam('JAC'), 'JAX');
  assert.equal(normalizeTeam('OAK'), 'LV');
});

test('matches exact names and normalized variants without guessing ambiguous names', () => {
  const sleeper = {
    1: { full_name: 'Exact Player', position: 'RB', team: 'DET' },
    2: { full_name: 'D.J. Example Jr.', position: 'WR', team: 'JAX' },
    3: { full_name: 'Shared Name', position: 'TE', team: 'DAL' },
    4: { full_name: 'Shared Name', position: 'TE', team: 'NYG' },
  };
  const fantasyPros = [
    { name: 'Exact Player', position: 'RB', nflTeam: 'DET' },
    { name: 'DJ Example', position: 'WR', nflTeam: 'JAC' },
    { name: 'Shared Name', position: 'TE', nflTeam: '' },
    { name: 'Missing Player', position: 'QB', nflTeam: 'FA' },
  ];

  const { players, summary } = buildCatalogPreview(fantasyPros, sleeper);
  assert.deepEqual(summary, { total: 4, exact: 1, normalized: 1, override: 0, ambiguous: 1, unmatched: 1 });
  assert.equal(players[0].stablePlayerId, '1');
  assert.equal(players[1].stablePlayerId, '2');
  assert.equal(players[2].catalogMatchCandidates.length, 2);
  assert.equal(players[3].stablePlayerId, 'fp_qb_missingplayer');
});

test('matches a unique same-name player when Sleeper uses a different position', () => {
  const sleeper = { 9: { full_name: 'Hybrid Player', position: 'FB', team: 'DAL' } };
  const fantasyPros = [{ name: 'Hybrid Player', position: 'RB', nflTeam: 'DAL' }];
  const { players, summary } = buildCatalogPreview(fantasyPros, sleeper);
  assert.equal(players[0].sleeperPlayerId, '9');
  assert.equal(summary.normalized, 1);
});

test('fallback IDs are deterministic', () => {
  const player = { name: 'New Prospect IV', position: 'WR' };
  assert.equal(fallbackPlayerId(player), fallbackPlayerId(player));
  assert.equal(fallbackPlayerId(player), 'fp_wr_newprospect');
});
