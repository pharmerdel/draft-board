import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';

import { buildDraftWorkbook } from './exportExcel.js';

test('Excel export produces readable Draft Order and By Team worksheets', () => {
  const input = {
    draft: { nominationOrderIds: ['team_1'] },
    teams: {
      team_1: {
        name: 'Test Team',
        ownerName: 'Test Owner',
        roster: {
          player_1: { playerName: 'Player One', nflTeam: 'BUF', position: 'QB', slotType: 'QB', pricePaid: 12 },
        },
      },
    },
    log: {
      sale_1: {
        type: 'sold', timestamp: 100, playerName: 'Player One', position: 'QB', nflTeam: 'BUF',
        teamId: 'team_1', teamName: 'Test Team', pricePaid: 12,
      },
    },
  };

  const workbook = buildDraftWorkbook(input);
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(bytes, { type: 'buffer' });

  assert.deepEqual(parsed.SheetNames, ['Draft Order', 'By Team']);
  assert.equal(parsed.Sheets['Draft Order'].B2.v, 'Player One');
  assert.equal(parsed.Sheets['Draft Order'].G2.v, 12);
  assert.equal(parsed.Sheets['By Team'].B3.v, 'Player One');
  assert.equal(parsed.Sheets['By Team'].E3.v, 12);
});
