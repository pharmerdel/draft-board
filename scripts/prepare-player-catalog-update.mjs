import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { planCatalogRefresh } from '../src/utils/catalogRefresh.js';

function parseArgs(argv) {
  const args = {
    previewPath: 'reports/player-catalog/catalog-preview.json',
    currentPath: null,
    outputPath: 'reports/player-catalog/firebase-update.json',
    summaryPath: 'reports/player-catalog/firebase-update-summary.json',
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--preview') args.previewPath = argv[++i];
    else if (argv[i] === '--current') args.currentPath = argv[++i];
    else if (argv[i] === '--output') args.outputPath = argv[++i];
    else if (argv[i] === '--summary') args.summaryPath = argv[++i];
    else throw new Error(`Unexpected argument: ${argv[i]}`);
  }
  if (!args.currentPath) throw new Error('--current <firebase-player-catalog.json> is required.');
  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const preview = await readJson(args.previewPath);
  const current = (await readJson(args.currentPath)) || {};
  const importedAt = new Date().toISOString();
  const plan = planCatalogRefresh(preview, current, importedAt);

  if (plan.summary.ambiguous > 0) {
    throw new Error(`Refusing to prepare an update with ${plan.summary.ambiguous} ambiguous player matches.`);
  }
  if (Object.keys(plan.rootUpdate).some(path => !path.startsWith('playerCatalog/') && path !== 'catalogMetadata')) {
    throw new Error('Refusing to write an update containing an unexpected Firebase path.');
  }

  await Promise.all([
    mkdir(dirname(resolve(args.outputPath)), { recursive: true }),
    mkdir(dirname(resolve(args.summaryPath)), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(resolve(args.outputPath), `${JSON.stringify(plan.rootUpdate, null, 2)}\n`),
    writeFile(resolve(args.summaryPath), `${JSON.stringify({ importedAt, ...plan.summary }, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ importedAt, ...plan.summary }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
