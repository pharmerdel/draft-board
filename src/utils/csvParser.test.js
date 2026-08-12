import test from 'node:test';
import assert from 'node:assert/strict';

import { parseFantasyProsCsv } from './csvParser.js';

test('parses shared tiers and filters non-skill positions', () => {
  const csv = 'RK,TIERS,PLAYER NAME,TEAM,POS\r\n1,2,"Receiver, Jr.",DAL,WR7\r\n2,3,Kicker,DAL,K1\r\n';
  const players = parseFantasyProsCsv(csv);
  assert.equal(players.length, 1);
  assert.deepEqual(players[0], {
    name: 'Receiver, Jr.',
    position: 'WR',
    positionalRank: 7,
    overallRank: 1,
    sharedTier: 2,
    nflTeam: 'DAL',
    projectedValue: null,
    sleeperPlayerId: null,
    headshotUrl: null,
  });
});
