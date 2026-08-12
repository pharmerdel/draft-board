import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { parseFantasyProsCsv } from '../src/utils/csvParser.js';
import { buildCatalogPreview, normalizePlayerName, normalizePosition, normalizeTeam } from '../src/utils/playerIdentity.js';

const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const DEFAULT_OUTPUT_DIR = 'reports/player-catalog';
const DEFAULT_OVERRIDES_FILE = 'data/player-id-overrides.json';

function parseArgs(argv) {
  const args = { csvPath: null, outputDir: DEFAULT_OUTPUT_DIR, overridesPath: DEFAULT_OVERRIDES_FILE };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out-dir') args.outputDir = argv[++i];
    else if (argv[i] === '--overrides') args.overridesPath = argv[++i];
    else if (!args.csvPath) args.csvPath = argv[i];
    else throw new Error(`Unexpected argument: ${argv[i]}`);
  }
  if (!args.csvPath) {
    throw new Error('Usage: npm run catalog:dry-run -- <fantasypros.csv> [--out-dir <directory>]');
  }
  return args;
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function lastName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return normalizePlayerName(parts.at(-1));
}

function buildSuggestions(fpPlayer, sleeperPlayers) {
  const fpLastName = lastName(fpPlayer.name);
  const fpTeam = normalizeTeam(fpPlayer.nflTeam);
  return Object.entries(sleeperPlayers)
    .map(([playerId, player]) => {
      if (!player.full_name) return null;
      const sameLastName = fpLastName && lastName(player.full_name) === fpLastName;
      const sameTeam = fpTeam && normalizeTeam(player.team) === fpTeam;
      const samePosition = normalizePosition(player.position) === normalizePosition(fpPlayer.position);
      const score = (sameLastName ? 50 : 0) + (sameTeam ? 20 : 0) + (samePosition ? 10 : 0);
      return score >= 50 ? { playerId, player, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.player.full_name.localeCompare(b.player.full_name))
    .slice(0, 5)
    .map(({ playerId, player }) => `${player.full_name} (${player.position || '?'}, ${player.team || 'FA'}, ${playerId})`);
}

function reviewCsv(players, sleeperPlayers) {
  const headers = ['overallRank', 'sharedTier', 'name', 'position', 'fantasyProsTeam', 'status', 'stablePlayerId', 'candidates', 'suggestions'];
  const rows = players
    .filter(player => ['ambiguous', 'unmatched'].includes(player.catalogMatchStatus))
    .map(player => [
      player.overallRank,
      player.sharedTier,
      player.name,
      player.position,
      player.nflTeam,
      player.catalogMatchStatus,
      player.stablePlayerId,
      player.catalogMatchCandidates
        .map(candidate => `${candidate.fullName} (${candidate.position}, ${candidate.nflTeam || 'FA'}, ${candidate.sleeperPlayerId})`)
        .join(' | '),
      buildSuggestions(player, sleeperPlayers).join(' | '),
    ]);
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

function summaryMarkdown(report) {
  const { summary } = report;
  const matched = summary.exact + summary.normalized + summary.override;
  const matchRate = summary.total ? ((matched / summary.total) * 100).toFixed(1) : '0.0';
  return `# Player Catalog Dry Run\n\n` +
    `Generated: ${report.generatedAt}\n\n` +
    `Source: \`${report.source.fileName}\` (${report.source.sha256})\n\n` +
    `Sleeper source: ${report.sleeper.url}\n\n` +
    `No Firebase writes were performed.\n\n` +
    `| Result | Players |\n| --- | ---: |\n` +
    `| Total eligible FantasyPros players | ${summary.total} |\n` +
    `| Exact matches | ${summary.exact} |\n` +
    `| Normalized-name matches | ${summary.normalized} |\n` +
    `| Manual overrides | ${summary.override} |\n` +
    `| Ambiguous matches | ${summary.ambiguous} |\n` +
    `| Unmatched | ${summary.unmatched} |\n` +
    `| Match rate | ${matchRate}% |\n\n` +
    `Review \`match-review.csv\` for every ambiguous or unmatched player. ` +
    `The full proposed catalog is in \`catalog-preview.json\`.\n`;
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = resolve(args.csvPath);
  const outputDir = resolve(args.outputDir);
  const overridesPath = resolve(args.overridesPath);
  const csvText = await readFile(csvPath, 'utf8');
  const overrides = await loadJson(overridesPath);

  const response = await fetch(SLEEPER_PLAYERS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`);
  const sleeperPlayers = await response.json();

  const fantasyProsPlayers = parseFantasyProsCsv(csvText);
  const preview = buildCatalogPreview(fantasyProsPlayers, sleeperPlayers, { overrides });
  const stableIds = preview.players.map(player => player.stablePlayerId);
  if (new Set(stableIds).size !== stableIds.length) {
    throw new Error('Catalog contains duplicate stable player IDs; resolve the collision before importing.');
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    source: {
      fileName: basename(csvPath),
      sha256: createHash('sha256').update(csvText).digest('hex'),
      eligiblePositions: ['QB', 'RB', 'WR', 'TE'],
    },
    sleeper: { url: SLEEPER_PLAYERS_URL, eligiblePlayerCount: preview.sleeperEligibleCount },
    summary: preview.summary,
    players: preview.players,
  };

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDir, 'catalog-preview.json'), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(resolve(outputDir, 'match-review.csv'), reviewCsv(preview.players, sleeperPlayers)),
    writeFile(resolve(outputDir, 'summary.md'), summaryMarkdown(report)),
  ]);

  process.stdout.write(`${summaryMarkdown(report)}\nOutput: ${outputDir}\n`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
