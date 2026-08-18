import { isPersonalTier, isPersonalTierScope, playerMatchesTierScope } from './personalTiers.js';
import { MAX_PLAYER_NOTE_LENGTH } from './playerNotes.js';

export const OWNER_PREFERENCES_BACKUP_TYPE = 'draft-board-owner-preseason-backup';
export const OWNER_PREFERENCES_BACKUP_VERSION = 1;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} is missing or invalid.`);
  return value;
}

function sanitizePreferences(preferences, players) {
  const playerMap = requireRecord(players, 'The current player pool');
  const source = requireRecord(preferences, 'Backup preferences');
  const personalRanks = {};
  const personalTiers = {};
  const playerNotes = {};
  const watchlists = {};
  let ignoredPlayerReferences = 0;

  for (const [playerId, rank] of Object.entries(requireRecord(source.personalRanks ?? {}, 'Personal ranks'))) {
    if (!Number.isInteger(rank) || rank < 1 || rank > 10000) {
      throw new Error(`Personal rank for ${playerId} is invalid.`);
    }
    if (!playerMap[playerId]) ignoredPlayerReferences += 1;
    else personalRanks[playerId] = rank;
  }

  for (const [scope, assignments] of Object.entries(requireRecord(source.personalTiers ?? {}, 'Personal tiers'))) {
    if (!isPersonalTierScope(scope)) throw new Error(`Tier scope ${scope} is invalid.`);
    const sanitizedAssignments = {};
    for (const [playerId, tier] of Object.entries(requireRecord(assignments, `${scope} tiers`))) {
      if (!isPersonalTier(tier)) throw new Error(`Tier for ${playerId} is invalid.`);
      const player = playerMap[playerId];
      if (!player) ignoredPlayerReferences += 1;
      else if (!playerMatchesTierScope(player, scope)) {
        throw new Error(`${player.name || playerId} is not eligible for the ${scope} tier list.`);
      } else sanitizedAssignments[playerId] = tier;
    }
    if (Object.keys(sanitizedAssignments).length) personalTiers[scope] = sanitizedAssignments;
  }

  for (const [playerId, note] of Object.entries(requireRecord(source.playerNotes ?? {}, 'Player notes'))) {
    if (!isRecord(note) || typeof note.text !== 'string' || !note.text.trim()
        || note.text.length > MAX_PLAYER_NOTE_LENGTH || !Number.isFinite(note.updatedAt)) {
      throw new Error(`Private note for ${playerId} is invalid.`);
    }
    if (!playerMap[playerId]) ignoredPlayerReferences += 1;
    else playerNotes[playerId] = { text: note.text, updatedAt: note.updatedAt };
  }

  for (const [playerId, watch] of Object.entries(requireRecord(source.watchlists ?? {}, 'Starred players'))) {
    if (!isRecord(watch) || watch.watched !== true || Object.keys(watch).some(key => key !== 'watched')) {
      throw new Error(`Starred-player record for ${playerId} is invalid.`);
    }
    if (!playerMap[playerId]) ignoredPlayerReferences += 1;
    else watchlists[playerId] = { watched: true };
  }

  return {
    preferences: { personalRanks, personalTiers, playerNotes, watchlists },
    ignoredPlayerReferences,
  };
}

export function ownerPreferenceCounts(preferences) {
  const tierAssignments = Object.values(preferences?.personalTiers || {})
    .reduce((total, assignments) => total + Object.keys(assignments || {}).length, 0);
  return {
    ranks: Object.keys(preferences?.personalRanks || {}).length,
    tiers: tierAssignments,
    tierScopes: Object.keys(preferences?.personalTiers || {}).length,
    notes: Object.keys(preferences?.playerNotes || {}).length,
    starred: Object.keys(preferences?.watchlists || {}).length,
  };
}

export function createOwnerPreferencesBackup({
  teamId,
  teamName,
  leagueName,
  players,
  personalRanks,
  personalTiers,
  playerNotes,
  watchlists,
}, createdAt = Date.now()) {
  if (typeof teamId !== 'string' || !teamId) throw new Error('A team is required to create a backup.');
  const { preferences, ignoredPlayerReferences } = sanitizePreferences({
    personalRanks,
    personalTiers,
    playerNotes,
    watchlists,
  }, players);
  return {
    type: OWNER_PREFERENCES_BACKUP_TYPE,
    schemaVersion: OWNER_PREFERENCES_BACKUP_VERSION,
    createdAt,
    teamId,
    teamName: typeof teamName === 'string' ? teamName : '',
    leagueName: typeof leagueName === 'string' ? leagueName : '',
    preferences,
    counts: ownerPreferenceCounts(preferences),
    ignoredPlayerReferences,
  };
}

export function parseOwnerPreferencesBackupText(text, { teamId, players }) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error('Could not read this file. Choose a valid owner preseason backup.');
  }
  if (!isRecord(backup)
      || backup.type !== OWNER_PREFERENCES_BACKUP_TYPE
      || backup.schemaVersion !== OWNER_PREFERENCES_BACKUP_VERSION
      || !Number.isFinite(backup.createdAt)) {
    throw new Error('This is not a supported owner preseason backup.');
  }
  if (backup.teamId !== teamId) {
    throw new Error('This backup belongs to a different league team.');
  }
  const sanitized = sanitizePreferences(backup.preferences, players);
  return {
    ...backup,
    preferences: sanitized.preferences,
    counts: ownerPreferenceCounts(sanitized.preferences),
    ignoredPlayerReferences: sanitized.ignoredPlayerReferences,
  };
}

export function parseOwnerPreferencesBackupFile(file, options) {
  if (!file || file.size > 2_000_000) {
    return Promise.reject(new Error('Choose an owner backup smaller than 2 MB.'));
  }
  return file.text().then(text => parseOwnerPreferencesBackupText(text, options));
}

export function downloadOwnerPreferencesBackup(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date(backup.createdAt).toISOString().slice(0, 10);
  link.href = url;
  link.download = `${backup.teamId}-preseason-backup-${date}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
