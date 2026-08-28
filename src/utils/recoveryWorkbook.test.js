import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx';

import { buildRecoveryWorkbook, recoveryWorkbookBytes, recoveryWorkbookData } from './recoveryWorkbook.js';

function formulaParenthesesAreBalanced(formula) {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < formula.length; index += 1) {
    const character = formula[index];
    if (character === '"') {
      if (inString && formula[index + 1] === '"') index += 1;
      else inString = !inString;
    } else if (!inString && character === '(') depth += 1;
    else if (!inString && character === ')') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && !inString;
}

const snapshot = {
  savedAt: Date.UTC(2026, 7, 20, 18, 30),
  draft: {
    leagueName: 'Test League',
    status: 'active',
    nominationOrderIds: ['team_2', 'team_1'],
    currentNomination: { playerId: 'player_3' },
  },
  teams: {
    team_1: { name: 'One', ownerName: 'Owner One', budgetRemaining: 188, roster: {
      player_1: { playerName: 'Alpha', position: 'RB', nflTeam: 'BUF', slotType: 'RB', pricePaid: 12 },
    } },
    team_2: { name: 'Two', ownerName: 'Owner Two', budgetRemaining: 200, roster: {} },
    commissioner: { ownerName: 'Do not export' },
  },
  players: {
    player_1: { name: 'Alpha', position: 'RB', nflTeam: 'BUF', overallRank: 1, status: 'sold' },
    player_2: { name: 'Beta', position: 'WR', nflTeam: 'KC', overallRank: 3, status: 'available' },
    player_3: { name: 'Gamma', position: 'QB', nflTeam: 'BAL', overallRank: 2, status: 'nominated' },
  },
  log: {
    sale_1: { type: 'sold', timestamp: 10, playerId: 'player_1', playerName: 'Alpha', teamId: 'team_1', pricePaid: 12 },
    undone: { type: 'undo', timestamp: 5, playerId: 'player_2', teamId: 'team_2', pricePaid: 20 },
  },
  personalRanks: { team_1: { player_2: 1 } },
  personalTiers: { team_1: { WR: { player_2: 1 } } },
  playerNotes: { team_1: { player_2: { text: 'secret' } } },
  watchlists: { team_1: { player_2: { watched: true } } },
};

test('recovery data reports current teams, active sales, rosters, and remaining pool', () => {
  const data = recoveryWorkbookData(snapshot);
  assert.deepEqual(data.teamIds, ['team_2', 'team_1']);
  assert.equal(data.sales.length, 1);
  assert.equal(data.summaryRows[1][4], 188);
  assert.equal(data.summaryRows[1][5], 12);
  assert.equal(data.summaryRows[1][4] + data.summaryRows[1][5], 200);
  assert.deepEqual(data.remainingRows.map(row => row[1]), ['Gamma', 'Beta']);
  assert.equal(data.remainingRows[0][9], 'YES');
});

test('recovery workbook excludes private owner preference data', () => {
  const workbook = buildRecoveryWorkbook(snapshot);
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(bytes, { type: 'buffer' });
  const workbookText = parsed.SheetNames
    .map(name => XLSX.utils.sheet_to_csv(parsed.Sheets[name]))
    .join('\n');

  assert.deepEqual(parsed.SheetNames, [
    'Instructions', 'Use during Auction ->', 'Nomination List', 'Best Player Avail.', 'Teams',
    'Draft Log', 'Recovery Summary', 'Draft Prep Section->', 'Target & DND List',
    'Player Tiers & Rankings', 'Player Auction Values', 'Historical Bid by Position Rank',
    'Calc Sheets. DO NOT TOUCH ->', 'Draft Ledger', 'Player Data', 'Team Data',
  ]);
  assert.match(workbookText, /Owner One/);
  assert.match(workbookText, /Gamma/);
  assert.doesNotMatch(workbookText, /secret/);
  assert.doesNotMatch(workbookText, /Do not export/);
});

test('operational workbook queues the active nomination and wires every live view to Nomination List', () => {
  const workbook = buildRecoveryWorkbook(snapshot);
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(bytes, { type: 'buffer', cellFormula: true });

  assert.equal(parsed.Sheets['Draft Ledger'].B9.v, 'YES');
  assert.equal(parsed.Sheets['Draft Ledger'].C9.v, 'player_1');
  assert.equal(parsed.Sheets['Nomination List'].B9.v.includes('Gamma'), true);
  assert.equal(parsed.Sheets['Nomination List'].K9.v, 'ON BLOCK');
  assert.match(parsed.Sheets['Draft Ledger'].J10.f, /COUNTIFS/);
  assert.match(parsed.Sheets['Draft Ledger'].K10.f, /\$I10<=/);
  assert.match(parsed.Sheets['Draft Ledger'].M10.f, /OVER MAX BID/);
  assert.match(parsed.Sheets['Draft Ledger'].P9.f, /SUMIFS/);
  assert.equal(parsed.Sheets.Teams.B2.v, 13);
  assert.match(parsed.Sheets.Teams.H25.f, /MATCH\("team_1\|RB\|1"/);
  assert.match(parsed.Sheets['Best Player Avail.'].H6.f, /COUNTIFS\('Draft Ledger'/);
  assert.match(parsed.Sheets['Draft Log'].A5.f, /'Draft Ledger'!/);
  assert.match(parsed.Sheets['Recovery Summary'].E9.f, /INDEX\('Draft Ledger'!\$P/);

  const invalidFormulas = parsed.SheetNames.flatMap(sheetName => Object.entries(parsed.Sheets[sheetName])
    .filter(([address, cell]) => !address.startsWith('!') && cell.f && !formulaParenthesesAreBalanced(cell.f))
    .map(([address]) => `${sheetName}!${address}`));
  assert.deepEqual(invalidFormulas, []);
});

test('downloadable workbook embeds searchable player/team and submit validations', () => {
  const files = unzipSync(recoveryWorkbookBytes(snapshot));
  const workbookXml = strFromU8(files['xl/workbook.xml']);
  assert.match(workbookXml, /<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"\/>/);
  const sheetTag = workbookXml.match(/<sheet\b(?=[^>]*name="Nomination List")[^>]*>/)?.[0];
  const relationshipId = sheetTag.match(/r:id="([^"]+)"/)[1];
  const relationships = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const relationshipTag = relationships.match(new RegExp(`<Relationship\\b(?=[^>]*Id="${relationshipId}")[^>]*>`))[0];
  const target = relationshipTag.match(/Target="([^"]+)"/)[1];
  const worksheetXml = strFromU8(files[`xl/${target.replace(/^\.\//, '')}`]);

  assert.match(worksheetXml, /<dataValidations count="4">/);
  assert.ok(worksheetXml.indexOf('<dataValidations') < worksheetXml.indexOf('<ignoredErrors'));
  assert.match(worksheetXml, /sqref="B9:B163"/);
  assert.match(worksheetXml, /<formula1>\$X\$2:\$X\$4<\/formula1>/);
  assert.match(worksheetXml, /sqref="G9:G163"/);
  assert.match(worksheetXml, /sqref="J9:J163"/);
});
