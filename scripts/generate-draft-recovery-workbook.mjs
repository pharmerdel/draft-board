import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseBackupText } from '../src/utils/backup.js';
import { recoveryWorkbookBytes, recoveryWorkbookFilename } from '../src/utils/recoveryWorkbook.js';

const inputPath = process.argv[2];
if (!inputPath || ['-h', '--help'].includes(inputPath)) {
  console.log('Usage: npm run backup:spreadsheet -- /absolute/path/draft-backup.json [output.xlsx]');
  process.exit(inputPath ? 0 : 1);
}

const snapshot = parseBackupText(fs.readFileSync(inputPath, 'utf8'));
const outputPath = path.resolve(process.argv[3] || recoveryWorkbookFilename(snapshot));
fs.writeFileSync(outputPath, recoveryWorkbookBytes(snapshot));
console.log(`Created operational recovery workbook: ${outputPath}`);
console.log('Use Nomination List as the local source of truth if the live draft app is unavailable.');
console.log('Private owner rankings, tiers, notes, watchlists, and access records were not read or exported.');
