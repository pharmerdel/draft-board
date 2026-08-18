export const MAX_TEAM_NAME_LENGTH = 40;

export function normalizeTeamName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function validateTeamName(value) {
  const normalized = normalizeTeamName(value);
  if (!normalized) return 'Enter a team name.';
  if (normalized.length > MAX_TEAM_NAME_LENGTH) {
    return `Team names must be ${MAX_TEAM_NAME_LENGTH} characters or fewer.`;
  }
  return '';
}
