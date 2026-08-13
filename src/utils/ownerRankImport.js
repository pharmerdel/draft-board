import { parseCsvLine } from './csvParser.js';
import { normalizePlayerName, normalizePosition, normalizeTeam } from './playerIdentity.js';
import { sortPlayersByPreference } from './personalRankings.js';
import { MAX_PLAYER_NOTE_LENGTH, normalizePlayerNote } from './playerNotes.js';

const SUPPORTED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const REQUIRED_HEADERS = ['RANK', 'PLAYER'];

function clean(value) {
  return String(value ?? '').trim();
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function playerCandidates(players, rawName, rawPosition, rawTeam) {
  const name = normalizePlayerName(rawName);
  const position = normalizePosition(rawPosition);
  const team = normalizeTeam(rawTeam);
  let candidates = Object.entries(players || {})
    .filter(([, player]) => normalizePlayerName(player.name) === name)
    .map(([id, player]) => ({ id, ...player }));

  if (position) candidates = candidates.filter(player => normalizePosition(player.position) === position);
  if (team && candidates.length > 1) {
    const sameTeam = candidates.filter(player => normalizeTeam(player.nflTeam) === team);
    if (sameTeam.length) candidates = sameTeam;
  }
  return candidates;
}

export function analyzeOwnerRankCsv(csvText, players, personalRanks = {}) {
  const lines = String(csvText || '').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('The CSV has headers but no player rows.');

  const headers = parseCsvLine(lines[0]).map(header => clean(header).toUpperCase());
  const columns = Object.fromEntries(headers.map((header, index) => [header, index]));
  const missingHeaders = REQUIRED_HEADERS.filter(header => columns[header] == null);
  if (missingHeaders.length) {
    const labels = missingHeaders.map(header => header[0] + header.slice(1).toLowerCase());
    throw new Error(`Missing required ${labels.join(' and ')} header${labels.length > 1 ? 's' : ''}. Use: Rank,Player,Position,Team`);
  }

  const matched = [];
  const issues = [];
  const notes = {};
  const hasNotesColumn = columns.NOTES != null;
  const usedRanks = new Set();
  const usedPlayerIds = new Set();

  for (let index = 1; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    const values = parseCsvLine(lines[index]);
    const row = index + 1;
    const rankText = clean(values[columns.RANK]);
    const playerName = clean(values[columns.PLAYER]);
    const position = columns.POSITION == null ? '' : normalizePosition(values[columns.POSITION]);
    const team = columns.TEAM == null ? '' : normalizeTeam(values[columns.TEAM]);
    const rank = Number(rankText);
    const rawNote = hasNotesColumn ? clean(values[columns.NOTES]) : '';

    if (!Number.isInteger(rank) || rank < 1) {
      issues.push({ row, playerName, reason: 'Rank must be a positive whole number.' });
      continue;
    }
    if (!playerName) {
      issues.push({ row, playerName: 'Blank player', reason: 'Player name is required.' });
      continue;
    }
    if (position && !SUPPORTED_POSITIONS.has(position)) {
      issues.push({ row, playerName, reason: `${position} is not used in this league.` });
      continue;
    }
    if (usedRanks.has(rank)) {
      issues.push({ row, playerName, reason: `Rank ${rank} is duplicated.` });
      continue;
    }
    if (rawNote.length > MAX_PLAYER_NOTE_LENGTH) {
      issues.push({ row, playerName, reason: `Notes must be ${MAX_PLAYER_NOTE_LENGTH} characters or fewer.` });
      continue;
    }

    const candidates = playerCandidates(players, playerName, position, team);
    if (candidates.length === 0) {
      issues.push({ row, playerName, reason: 'No player-database match.' });
      continue;
    }
    if (candidates.length > 1) {
      issues.push({ row, playerName, reason: 'Multiple matches; add Position and Team.' });
      continue;
    }

    const [player] = candidates;
    if (usedPlayerIds.has(player.id)) {
      issues.push({ row, playerName, reason: 'Player appears more than once.' });
      continue;
    }

    usedRanks.add(rank);
    usedPlayerIds.add(player.id);
    const note = normalizePlayerNote(rawNote);
    if (note) notes[player.id] = note;
    matched.push({ row, rank, playerId: player.id, player, note });
  }

  matched.sort((left, right) => left.rank - right.rank || left.row - right.row);
  const importedIds = new Set(matched.map(entry => entry.playerId));
  const remainingPlayers = sortPlayersByPreference(players, personalRanks)
    .filter(player => !importedIds.has(player.id));
  const completeOrder = [
    ...matched.map(entry => entry.player),
    ...remainingPlayers,
  ];
  const ranks = Object.fromEntries(completeOrder.map((player, index) => [player.id, index + 1]));

  return {
    matched,
    issues,
    ranks,
    appendedCount: remainingPlayers.length,
    totalRows: matched.length + issues.length,
    hasNotesColumn,
    notes,
    notesCount: Object.keys(notes).length,
  };
}

export function generateOwnerRankTemplateCsv() {
  return 'Rank,Player,Position,Team,Notes\n';
}

export function generateOwnerPlayerCatalogCsv(players) {
  const rows = sortPlayersByPreference(players, {});
  return [
    'Rank,Player,Position,Team,Notes',
    ...rows.map(player => [
      player.overallRank || '',
      player.name,
      player.position,
      player.nflTeam || '',
      '',
    ].map(csvValue).join(',')),
  ].join('\n');
}
