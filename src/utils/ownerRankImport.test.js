import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeOwnerRankCsv,
  generateOwnerPlayerCatalogCsv,
  generateOwnerRankTemplateCsv,
} from './ownerRankImport.js';

const players = {
  chase: { name: "Ja'Marr Chase", position: 'WR', nflTeam: 'CIN', overallRank: 1 },
  allen: { name: 'Josh Allen', position: 'QB', nflTeam: 'BUF', overallRank: 2 },
  robinson: { name: 'Bijan Robinson', position: 'RB', nflTeam: 'ATL', overallRank: 3 },
};

test('matches normalized player names and builds a complete imported order', () => {
  const result = analyzeOwnerRankCsv([
    'Rank,Player,Position,Team',
    '1,Josh Allen,QB,BUF',
    '2,JAMARR CHASE,WR,CIN',
  ].join('\n'), players);

  assert.equal(result.matched.length, 2);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.ranks, { allen: 1, chase: 2, robinson: 3 });
  assert.equal(result.appendedCount, 1);
});

test('preserves the current relative order for omitted players', () => {
  const result = analyzeOwnerRankCsv('Rank,Player\n1,Bijan Robinson', players, {
    allen: 1,
    chase: 2,
    robinson: 3,
  });
  assert.deepEqual(result.ranks, { robinson: 1, allen: 2, chase: 3 });
});

test('reports unsupported positions, duplicate ranks, and unmatched players', () => {
  const result = analyzeOwnerRankCsv([
    'Rank,Player,Position,Team',
    '1,Some Kicker,K,DAL',
    '2,Josh Allen,QB,BUF',
    '2,Unknown Player,RB,ATL',
  ].join('\n'), players);
  assert.equal(result.matched.length, 1);
  assert.equal(result.issues.length, 2);
  assert.match(result.issues[0].reason, /not used/);
  assert.match(result.issues[1].reason, /duplicated/);
});

test('requires the established Rank and Player headers', () => {
  assert.throws(
    () => analyzeOwnerRankCsv('RK,Name\n1,Josh Allen', players),
    /Missing required Rank and Player headers/,
  );
});

test('generates the blank template and safely quoted player catalog', () => {
  const catalog = generateOwnerPlayerCatalogCsv({
    one: { name: 'Doe, John', position: 'QB', nflTeam: 'BUF', overallRank: 1 },
  });
  assert.equal(generateOwnerRankTemplateCsv(), 'Rank,Player,Position,Team,Notes\n');
  assert.match(catalog, /1,"Doe, John",QB,BUF,$/m);
});

test('imports optional notes without treating blank note cells as deletions', () => {
  const result = analyzeOwnerRankCsv([
    'Rank,Player,Position,Team,Notes',
    '1,Josh Allen,QB,BUF,Elite rushing floor',
    "2,Ja'Marr Chase,WR,CIN,",
  ].join('\n'), players);

  assert.equal(result.hasNotesColumn, true);
  assert.equal(result.notesCount, 1);
  assert.deepEqual(result.notes, { allen: 'Elite rushing floor' });
  assert.equal(result.matched[1].note, '');
});

test('rejects an overlong note row before importing it', () => {
  const result = analyzeOwnerRankCsv(
    `Rank,Player,Notes\n1,Josh Allen,${'x'.repeat(301)}`,
    players,
  );
  assert.equal(result.matched.length, 0);
  assert.match(result.issues[0].reason, /300 characters or fewer/);
});
