import { readFileSync } from 'node:fs';
import { after, beforeEach, test } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, set, update } from 'firebase/database';

const projectId = 'demo-draft-board-rules';
const rules = readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
const testEnvironment = await initializeTestEnvironment({
  projectId,
  database: { rules },
});

const ownerOne = () => testEnvironment.authenticatedContext('team:team_1', {
  role: 'owner',
  teamId: 'team_1',
  accessVersion: 1,
}).database();

const ownerTwo = () => testEnvironment.authenticatedContext('team:team_2', {
  role: 'owner',
  teamId: 'team_2',
  accessVersion: 1,
}).database();

const commissioner = (accessVersion = 1) => testEnvironment.authenticatedContext('commissioner:primary', {
  role: 'commissioner',
  accessVersion,
}).database();

async function seedDatabase() {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await set(ref(context.database()), {
      draft: {
        leagueName: 'Rx Degenerates',
        status: 'active',
        nominationOrderIds: ['team_1', 'team_2'],
        nominationIndex: 0,
        nominatingTeamId: 'team_1',
      },
      teams: {
        team_1: { name: 'One', connected: false, budgetRemaining: 200 },
        team_2: { name: 'Two', connected: false, budgetRemaining: 200 },
      },
      players: {
        player_1: { name: 'Player One', position: 'RB', status: 'available' },
        player_2: { name: 'Player Two', position: 'WR', status: 'available' },
      },
      playerCatalog: {
        player_1: { name: 'Player One', position: 'RB', catalogStatus: 'active' },
      },
      teamAuthPrivate: {
        team_1: { accessVersion: 1 },
        team_2: { accessVersion: 1 },
      },
      commissionerAuthPrivate: { accessVersion: 1 },
      teamAccess: {
        team_1: { state: 'claimed' },
        team_2: { state: 'claimed' },
      },
      commissionerAccess: { state: 'claimed' },
    });
  });
}

beforeEach(seedDatabase);
after(() => testEnvironment.cleanup());

test('public clients can read league entry data but cannot write or read private preferences', async () => {
  const publicDatabase = testEnvironment.unauthenticatedContext().database();

  await assertSucceeds(get(ref(publicDatabase, 'draft/status')));
  await assertSucceeds(get(ref(publicDatabase, 'teams')));
  await assertSucceeds(get(ref(publicDatabase, 'playerCatalog')));
  await assertSucceeds(get(ref(publicDatabase, 'teamAccess')));
  await assertFails(get(ref(publicDatabase, 'personalRanks/team_1')));
  await assertFails(get(ref(publicDatabase, 'teamAuthPrivate/team_1')));
  await assertFails(set(ref(publicDatabase, 'draft/status'), 'complete'));
});

test('an owner can manage only their own valid rankings, tiers, and watchlist', async () => {
  const database = ownerOne();

  await assertSucceeds(update(ref(database, 'personalRanks/team_1'), { player_1: 1, player_2: 2 }));
  await assertSucceeds(update(ref(database, 'personalTiers/team_1'), { player_1: 2, player_2: 'avoid' }));
  await assertSucceeds(set(ref(database, 'personalTiers/team_1/player_1'), 2));
  await assertSucceeds(set(ref(database, 'watchlists/team_1/player_1'), { watched: true }));
  await assertSucceeds(get(ref(database, 'personalRanks/team_1')));

  await assertFails(set(ref(database, 'personalRanks/team_2/player_1'), 1));
  await assertFails(get(ref(database, 'personalRanks/team_2')));
  await assertFails(set(ref(database, 'personalRanks/team_1/player_1'), 1.5));
  await assertFails(set(ref(database, 'personalTiers/team_1/player_1'), 6));
  await assertFails(set(ref(database, 'watchlists/team_1/player_1'), { watched: true, shared: true }));
});

test('an owner can update only their own presence fields', async () => {
  const database = ownerOne();

  await assertSucceeds(update(ref(database, 'teams/team_1'), { connected: true, lastSeen: Date.now() }));
  await assertFails(update(ref(database, 'teams/team_2'), { connected: true, lastSeen: Date.now() }));
  await assertFails(update(ref(database, 'teams/team_1'), { budgetRemaining: 999 }));
  await assertFails(update(ref(database, 'teams/team_1'), { connected: true, budgetRemaining: 999 }));
});

test('only the current nominating owner can create a valid nomination', async () => {
  const teamOneDatabase = ownerOne();
  const teamTwoDatabase = ownerTwo();
  const nomination = { playerId: 'player_1', nominatingTeamId: 'team_1', startedAt: Date.now() };

  await assertFails(set(ref(teamTwoDatabase, 'draft/currentNomination'), nomination));
  await assertFails(update(ref(teamOneDatabase, 'draft'), {
    currentNomination: nomination,
    nominationIndex: 10,
  }));
  await assertSucceeds(update(ref(teamOneDatabase, 'draft'), {
    currentNomination: nomination,
    timerStartedAt: null,
  }));
  await assertSucceeds(update(ref(teamOneDatabase, 'players/player_1'), { status: 'nominated' }));
  await assertFails(update(ref(teamOneDatabase, 'players/player_1'), { soldTo: 'team_1' }));
});

test('a PIN reset accessVersion change immediately blocks a stale owner session without deleting preferences', async () => {
  const staleDatabase = ownerOne();
  await assertSucceeds(set(ref(staleDatabase, 'personalRanks/team_1/player_1'), 4));

  await testEnvironment.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), 'teamAuthPrivate/team_1/accessVersion'), 2);
  });

  await assertFails(set(ref(staleDatabase, 'personalRanks/team_1/player_2'), 5));
  await assertFails(get(ref(staleDatabase, 'personalRanks/team_1')));
  const reactivatedDatabase = testEnvironment.authenticatedContext('team:team_1', {
    role: 'owner',
    teamId: 'team_1',
    accessVersion: 2,
  }).database();
  await assertSucceeds(get(ref(reactivatedDatabase, 'personalRanks/team_1')));
  const preservedRank = await assertSucceeds(get(ref(reactivatedDatabase, 'personalRanks/team_1/player_1')));
  if (preservedRank.val() !== 4) throw new Error('PIN reset changed the owner preference data.');
});

test('the current commissioner can administer league data but not private owner preferences or auth records', async () => {
  const database = commissioner();

  await assertSucceeds(update(ref(database), {
    'draft/status': 'lobby',
    'teams/team_1/connected': false,
    'players/player_1/status': 'available',
    log: null,
  }));
  await assertSucceeds(set(ref(database, 'draft/status'), 'paused'));
  await assertSucceeds(set(ref(database, 'teams/team_1/budgetRemaining'), 175));
  await assertSucceeds(set(ref(database, 'players/player_1/status'), 'sold'));
  await assertSucceeds(set(ref(database, 'log/event_1'), { type: 'sold', timestamp: Date.now() }));
  await assertFails(get(ref(database, 'personalRanks/team_1')));
  await assertFails(set(ref(database, 'personalRanks/team_1/player_1'), 1));
  await assertFails(get(ref(database, 'teamAuthPrivate/team_1')));
  await assertFails(set(ref(database, 'playerCatalog/player_2'), { name: 'Admin SDK only' }));
});

test('a stale commissioner session cannot mutate league state', async () => {
  await assertFails(set(ref(commissioner(0), 'draft/status'), 'paused'));
  await assertSucceeds(set(ref(commissioner(1), 'draft/status'), 'paused'));
});
