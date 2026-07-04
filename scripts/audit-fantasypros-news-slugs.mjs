import fs from 'node:fs/promises';
import { parseFantasyProsCsv } from '../src/utils/csvParser.js';
import {
  fantasyProsNewsUrl,
  fetchFantasyProsPlayerNews,
} from '../src/utils/fantasyProsNews.js';

const csvPath = process.argv[2];
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const startArg = process.argv.find(arg => arg.startsWith('--start='));
const delayArg = process.argv.find(arg => arg.startsWith('--delay='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const start = startArg ? Number(startArg.split('=')[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split('=')[1]) : 0;

if (!csvPath) {
  console.error('Usage: node scripts/audit-fantasypros-news-slugs.mjs /path/to/FantasyPros.csv [--limit=50]');
  process.exit(1);
}

const csvText = await fs.readFile(csvPath, 'utf8');
const allPlayers = parseFantasyProsCsv(csvText);
const players = Number.isFinite(limit)
  ? allPlayers.slice(start, start + limit)
  : allPlayers.slice(start);

const results = {
  total: players.length,
  ok: [],
  noItems: [],
  mismatch: [],
  error: [],
};

for (const player of players) {
  const guessedUrl = fantasyProsNewsUrl(player.name);

  try {
    const items = await fetchFantasyProsPlayerNews(player.name);
    const sourcePageUrl = items[0]?.sourcePageUrl || guessedUrl;
    const sourcePageName = items[0]?.sourcePagePlayerName || '';
    const nameMatches = namesRoughlyMatch(player.name, sourcePageName);

    const record = {
      name: player.name,
      position: player.position,
      positionalRank: player.positionalRank,
      nflTeam: player.nflTeam,
      guessedUrl,
      sourcePageUrl,
      sourcePageName,
      itemCount: items.length,
      latestHeadline: items[0]?.headline || '',
      latestTimestamp: items[0]?.timestamp || '',
    };

    if (!items.length) {
      results.noItems.push(record);
    } else if (!nameMatches) {
      results.mismatch.push(record);
    } else {
      results.ok.push(record);
    }
  } catch (error) {
    results.error.push({
      name: player.name,
      position: player.position,
      positionalRank: player.positionalRank,
      nflTeam: player.nflTeam,
      guessedUrl,
      error: error.message,
    });
  }

  if (delayMs > 0) {
    await delay(delayMs);
  }
}

printSummary(results);

function namesRoughlyMatch(expected, actual) {
  if (!actual) return false;
  const a = normalizeName(expected);
  const b = normalizeName(actual);
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeName(value) {
  return (value || '')
    .toLowerCase()
    .replace(/^kenny\b/, 'kenneth')
    .replace(/\bst\.?\s+brown\b/g, 'stbrown')
    .replace(/\bamon-ra\b/g, 'amonra')
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printSummary({ total, ok, noItems, mismatch, error }) {
  console.log(`\nFantasyPros news slug audit`);
  console.log(`Players checked: ${total}`);
  console.log(`OK: ${ok.length}`);
  console.log(`No items / redirect / empty: ${noItems.length}`);
  console.log(`Name mismatches: ${mismatch.length}`);
  console.log(`Errors: ${error.length}`);

  printGroup('NO ITEMS', noItems);
  printGroup('MISMATCHES', mismatch);
  printGroup('ERRORS', error);
}

function printGroup(title, records) {
  if (!records.length) return;
  console.log(`\n${title}`);
  for (const r of records) {
    console.log(`- ${r.name} (${r.position}${r.positionalRank}, ${r.nflTeam})`);
    console.log(`  URL: ${r.sourcePageUrl || r.guessedUrl}`);
    if (r.sourcePageName) console.log(`  Page player: ${r.sourcePageName}`);
    if (r.latestHeadline) console.log(`  Latest: ${r.latestHeadline} (${r.latestTimestamp || 'no timestamp'})`);
    if (r.error) console.log(`  Error: ${r.error}`);
  }
}
