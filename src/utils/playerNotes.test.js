import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPlayerNoteUpdate, MAX_PLAYER_NOTE_LENGTH, normalizePlayerNote, playerNoteText } from './playerNotes.js';

test('normalizes and limits player notes', () => {
  assert.equal(normalizePlayerNote('  high variance  '), 'high variance');
  assert.equal(normalizePlayerNote('x'.repeat(400)).length, MAX_PLAYER_NOTE_LENGTH);
});

test('applies and clears private note records', () => {
  const added = applyPlayerNoteUpdate({}, 'p1', ' Tough start ', 123);
  assert.deepEqual(added, { p1: { text: 'Tough start', updatedAt: 123 } });
  assert.equal(playerNoteText(added, 'p1'), 'Tough start');
  assert.deepEqual(applyPlayerNoteUpdate(added, 'p1', ''), {});
});
