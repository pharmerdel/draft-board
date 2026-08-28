import assert from 'node:assert/strict';
import test from 'node:test';

import { createBackupSnapshot, downloadBackup, parseBackupText, saveBackup } from './backup.js';

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

test('backup download can use the exact snapshot supplied by the paired export action', async () => {
  let downloadedBlob;
  let downloadedFilename;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  globalThis.localStorage = { getItem() { throw new Error('should not read local storage'); } };
  URL.createObjectURL = blob => { downloadedBlob = blob; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = {
    body: { appendChild() {}, removeChild() {} },
    createElement() {
      return {
        click() {},
        set href(value) { this._href = value; },
        set download(value) { downloadedFilename = value; },
      };
    },
  };

  try {
    const snapshot = createBackupSnapshot(state, Date.UTC(2026, 7, 20));
    downloadBackup(snapshot);
    assert.deepEqual(JSON.parse(await downloadedBlob.text()), snapshot);
    assert.match(downloadedFilename, /^draft-backup-2-picks-/);
  } finally {
    globalThis.document = originalDocument;
    globalThis.localStorage = originalLocalStorage;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});
