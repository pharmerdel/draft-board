import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_PROJECT_ID = 'demo-draft-board-stress';
const DEFAULT_CATALOG_PATH = 'backups/post-player-catalog-2026-08-12-1554Z.json';
const DEFAULT_METADATA_PATH = 'backups/post-catalog-metadata-2026-08-12-1554Z.json';

function parseArgs(argv) {
  const args = {
    projectId: DEFAULT_PROJECT_ID,
    catalogPath: DEFAULT_CATALOG_PATH,
    metadataPath: DEFAULT_METADATA_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') args.projectId = argv[++index];
    else if (argv[index] === '--catalog') args.catalogPath = argv[++index];
    else if (argv[index] === '--metadata') args.metadataPath = argv[++index];
    else throw new Error(`Unexpected argument: ${argv[index]}`);
  }

  if (!args.projectId.startsWith('demo-')) {
    throw new Error('Refusing to seed a non-demo Firebase project. Use a project ID beginning with "demo-".');
  }
  return args;
}

async function readJson(path, label) {
  const absolutePath = resolve(path);
  try {
    await access(absolutePath);
  } catch {
    throw new Error(`${label} file not found: ${absolutePath}`);
  }
  return JSON.parse(await readFile(absolutePath, 'utf8'));
}

async function putEmulatorPath(projectId, path, value) {
  const url = new URL(`http://127.0.0.1:9000/${path}.json`);
  url.searchParams.set('ns', projectId);
  url.searchParams.set('auth', 'owner');

  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!response.ok) {
    throw new Error(`Emulator seed failed for /${path}: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [catalog, metadata] = await Promise.all([
    readJson(args.catalogPath, 'Catalog'),
    readJson(args.metadataPath, 'Metadata'),
  ]);

  const playerCount = Object.keys(catalog || {}).length;
  if (playerCount === 0) throw new Error('Refusing to seed an empty player catalog.');

  await Promise.all([
    putEmulatorPath(args.projectId, 'playerCatalog', catalog),
    putEmulatorPath(args.projectId, 'catalogMetadata', metadata),
  ]);

  console.log(`Seeded ${playerCount} catalog players into the local ${args.projectId} database emulator.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
