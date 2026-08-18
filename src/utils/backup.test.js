import assert from 'node:assert/strict';
import test from 'node:test';

import { createBackupSnapshot, parseBackupText, saveBackup } from './backup.js';

const state = {
  draft: { status: 'active', nominationIndex: 2 },
  teams: { team_1: { budgetRemaining: 198 } },
  players: { player_1: { status: 'sold' } },
  log: {
    sale_1: { type: 'sold' },
    sale_2: { type: 'sold' },
    undo_1: { type: 'undo' },
  },
};

test('backup snapshot contains the complete recoverable state and active sale count', () => {
  const snapshot = createBackupSnapshot(state, 12345);
  assert.deepEqual(snapshot, { savedAt: 12345, pickCount: 2, ...state });
  assert.deepEqual(parseBackupText(JSON.stringify(snapshot)), snapshot);
});

test('saveBackup serializes a restorable snapshot to local storage', () => {
  let stored;
  globalThis.localStorage = {
    setItem(key, value) { stored = { key, value }; },
  };
  try {
    const snapshot = saveBackup(state);
    assert.equal(stored.key, 'ff_draft_backup');
    assert.deepEqual(JSON.parse(stored.value), snapshot);
    assert.equal(snapshot.pickCount, 2);
  } finally {
    delete globalThis.localStorage;
  }
});

test('backup parsing rejects malformed and incomplete files', () => {
  assert.throws(() => parseBackupText('{'), /valid backup JSON/);
  assert.throws(() => parseBackupText('{"draft":{}}'), /missing required fields/);
});
