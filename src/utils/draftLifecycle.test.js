import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDraftDayLobbyUpdates,
  buildPreseasonDraft,
  hasOfficialNominationOrder,
  sortTeamsForDisplay,
} from './draftLifecycle.js';

test('preseason draft state contains no nomination order', () => {
  const draft = buildPreseasonDraft({
    leagueName: ' Rx Degenerates ',
    catalogMetadata: { importedAt: 'today', sourceSha256: 'abc' },
    now: 123,
  });

  assert.deepEqual(draft, {
    leagueName: 'Rx Degenerates',
    status: 'preseason',
    currentNomination: null,
    playerCatalogImportedAt: 'today',
    playerCatalogSourceSha256: 'abc',
    createdAt: 123,
  });
  assert.equal('nominationOrderIds' in draft, false);
  assert.equal('nominationIndex' in draft, false);
  assert.equal('nominatingTeamId' in draft, false);
});

test('opening the draft-day lobby clears every old nomination-order field', () => {
  const updates = buildDraftDayLobbyUpdates({ team_1: {}, team_2: {} });

  assert.equal(updates['draft/status'], 'lobby');
  assert.equal(updates['draft/nominationOrderIds'], null);
  assert.equal(updates['draft/nominationIndex'], null);
  assert.equal(updates['draft/nominatingTeamId'], null);
  assert.equal(updates['teams/team_1/nominationOrder'], null);
  assert.equal(updates['teams/team_2/nominationOrder'], null);
});

test('an official nomination order requires every team exactly once in matching order', () => {
  const teams = {
    team_1: { nominationOrder: 2 },
    team_2: { nominationOrder: 1 },
  };

  assert.equal(hasOfficialNominationOrder({ nominationOrderIds: ['team_2', 'team_1'] }, teams), true);
  assert.equal(hasOfficialNominationOrder({ nominationOrderIds: ['team_1', 'team_2'] }, teams), false);
  assert.equal(hasOfficialNominationOrder({ nominationOrderIds: ['team_2'] }, teams), false);
});

test('preseason display order follows stable team ids without creating nomination order', () => {
  const entries = sortTeamsForDisplay({
    team_10: { name: 'Ten' },
    team_2: { name: 'Two' },
    team_1: { name: 'One' },
  });

  assert.deepEqual(entries.map(([teamId]) => teamId), ['team_1', 'team_2', 'team_10']);
});
