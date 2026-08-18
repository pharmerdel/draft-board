import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { buildDraftPlayers, summarizeDraftPlayers } from '../src/utils/draftPlayers.js';

function parseArgs(argv) {
  const args = {
    databasePath: null,
    outputPath: 'reports/player-catalog/preseason-player-sync.json',
    summaryPath: 'reports/player-catalog/preseason-player-sync-summary.json',
  };

  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--database') args.databasePath = argv[++index];
    else if (argv[index] === '--output') args.outputPath = argv[++index];
    else if (argv[index] === '--summary') args.summaryPath = argv[++index];
    else throw new Error(`Unexpected argument: ${argv[index]}`);
  }

  if (!args.databasePath) throw new Error('--database <firebase-export.json> is required.');
  return args;
}

function assertSafePreseason(database) {
  if (database?.draft?.status !== 'preseason') {
    throw new Error(`Refusing to sync players while draft status is ${database?.draft?.status || 'missing'}.`);
  }

  const unsafePlayers = Object.entries(database.players || {}).filter(([, player]) => (
    player?.status !== 'available' || player?.soldTo || player?.soldPrice
  ));
  if (unsafePlayers.length) {
    throw new Error(`Refusing to sync players because ${unsafePlayers.length} current players are not unsold and available.`);
  }

  if (!database.playerCatalog || !database.catalogMetadata?.importedAt || !database.catalogMetadata?.sourceSha256) {
    throw new Error('Refusing to sync without a complete player catalog and catalog metadata.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const database = JSON.parse(await readFile(resolve(args.databasePath), 'utf8'));
  assertSafePreseason(database);

  const nextPlayers = buildDraftPlayers(database.playerCatalog);
  const before = summarizeDraftPlayers(database.players);
  const after = summarizeDraftPlayers(nextPlayers);
  const rootUpdate = {
    players: nextPlayers,
    'draft/playerCatalogImportedAt': database.catalogMetadata.importedAt,
    'draft/playerCatalogSourceSha256': database.catalogMetadata.sourceSha256,
  };
  const summary = {
    draftStatus: database.draft.status,
    before,
    after,
    catalogImportedAt: database.catalogMetadata.importedAt,
    catalogSourceSha256: database.catalogMetadata.sourceSha256,
    updatePaths: Object.keys(rootUpdate),
  };

  await Promise.all([
    mkdir(dirname(resolve(args.outputPath)), { recursive: true }),
    mkdir(dirname(resolve(args.summaryPath)), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(resolve(args.outputPath), `${JSON.stringify(rootUpdate, null, 2)}\n`),
    writeFile(resolve(args.summaryPath), `${JSON.stringify(summary, null, 2)}\n`),
  ]);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
