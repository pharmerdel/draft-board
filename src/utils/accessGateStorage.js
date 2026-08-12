const ACCESS_STORAGE_KEY = 'ff_league_access_granted_v1';

export function hasLeagueAccess() {
  return localStorage.getItem(ACCESS_STORAGE_KEY) === 'true';
}

export function grantLeagueAccess() {
  localStorage.setItem(ACCESS_STORAGE_KEY, 'true');
}

export function clearLeagueAccess() {
  localStorage.removeItem(ACCESS_STORAGE_KEY);
}
