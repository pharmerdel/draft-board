import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_TEAM_NAME_LENGTH, normalizeTeamName, validateTeamName } from './teamName.js';

test('normalizeTeamName trims and collapses whitespace', () => {
  assert.equal(normalizeTeamName('  Fourth   and\nLong  '), 'Fourth and Long');
});

test('validateTeamName requires a non-empty name within the limit', () => {
  assert.equal(validateTeamName('   '), 'Enter a team name.');
  assert.equal(validateTeamName('A'.repeat(MAX_TEAM_NAME_LENGTH)), '');
  assert.match(validateTeamName('A'.repeat(MAX_TEAM_NAME_LENGTH + 1)), /40 characters or fewer/);
});
