export const MAX_PLAYER_NOTE_LENGTH = 300;

export function normalizePlayerNote(value) {
  return String(value ?? '').trim().slice(0, MAX_PLAYER_NOTE_LENGTH);
}

export function playerNoteText(playerNotes, playerId) {
  const text = playerNotes?.[playerId]?.text;
  return typeof text === 'string' ? text : '';
}

export function applyPlayerNoteUpdate(playerNotes, playerId, text, updatedAt = Date.now()) {
  const next = { ...(playerNotes || {}) };
  const normalized = normalizePlayerNote(text);
  if (!normalized) delete next[playerId];
  else next[playerId] = { text: normalized, updatedAt };
  return next;
}
