import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOwnerPreferencesBackup,
  parseOwnerPreferencesBackupText,
} from './ownerPreferencesBackup.js';

const players = {
  qb: { name: 'Quarterback', position: 'QB' },
  rb: { name: 'Running Back', position: 'RB' },
  old: null,
};

test('creates a versioned team-scoped backup and omits stale player references', () => {
  const backup = createOwnerPreferencesBackup({
    teamId: 'team_1',
    teamName: 'Test Team',
    leagueName: 'Test League',
    players,
    personalRanks: { qb: 2, rb: 1, old: 3 },
    personalTiers: { QB: { qb: 1, old: 2 } },
    playerNotes: { rb: { text: 'Target', updatedAt: 123 }, old: { text: 'Old', updatedAt: 122 } },
    watchlists: { qb: { watched: true }, old: { watched: true } },
  }, 456);

  assert.equal(backup.schemaVersion, 1);
  assert.equal(backup.createdAt, 456);
  assert.deepEqual(backup.preferences.personalRanks, { qb: 2, rb: 1 });
  assert.deepEqual(backup.preferences.personalTiers, { QB: { qb: 1 } });
  assert.deepEqual(backup.counts, { ranks: 2, tiers: 1, tierScopes: 1, notes: 1, starred: 1 });
  assert.equal(backup.ignoredPlayerReferences, 4);
});

test('parses a valid backup only for its original team', () => {
  const backup = createOwnerPreferencesBackup({
    teamId: 'team_1', players,
    personalRanks: { rb: 1 }, personalTiers: {}, playerNotes: {}, watchlists: {},
  }, 456);
  const parsed = parseOwnerPreferencesBackupText(JSON.stringify(backup), { teamId: 'team_1', players });
  assert.deepEqual(parsed.preferences.personalRanks, { rb: 1 });
  assert.throws(
    () => parseOwnerPreferencesBackupText(JSON.stringify(backup), { teamId: 'team_2', players }),
    /different league team/,
  );
});

test('rejects malformed values before any restore can be attempted', () => {
  const base = {
    type: 'draft-board-owner-preseason-backup',
    schemaVersion: 1,
    createdAt: 456,
    teamId: 'team_1',
    preferences: { personalRanks: { rb: 0 }, personalTiers: {}, playerNotes: {}, watchlists: {} },
  };
  assert.throws(
    () => parseOwnerPreferencesBackupText(JSON.stringify(base), { teamId: 'team_1', players }),
    /Personal rank/,
  );
  base.preferences = { personalRanks: {}, personalTiers: { QB: { rb: 1 } }, playerNotes: {}, watchlists: {} };
  assert.throws(
    () => parseOwnerPreferencesBackupText(JSON.stringify(base), { teamId: 'team_1', players }),
    /not eligible/,
  );
});
