import assert from 'node:assert/strict';
import test from 'node:test';

import { generateDraftCsv } from './exportCsv.js';

test('CSV export preserves nomination order, sorts positions, and quotes commas', () => {
  const csv = generateDraftCsv({
    team_1: {
      name: 'First Team',
      ownerName: 'Owner One',
      roster: {
        wr: { playerName: 'Receiver, Jr.', nflTeam: 'MIN', position: 'WR', pricePaid: 4 },
        qb: { playerName: 'Quarterback', nflTeam: 'BUF', position: 'QB', pricePaid: 8 },
      },
    },
    team_2: {
      name: 'Second Team',
      ownerName: 'Owner Two',
      roster: {
        rb: { playerName: 'Runner', nflTeam: 'DET', position: 'RB', pricePaid: 6 },
      },
    },
  }, ['team_2', 'team_1']);

  assert.match(csv, /^Second Team — Owner Two/);
  assert.ok(csv.indexOf('Quarterback,BUF,QB,$8') < csv.indexOf('"Receiver, Jr.",MIN,WR,$4'));
});
