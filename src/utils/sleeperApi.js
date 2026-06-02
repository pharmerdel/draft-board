// Sleeper API integration
// Docs: https://docs.sleeper.com/#players
//
// How it works:
//   1. We fetch the full NFL player list from Sleeper's public API (no key needed)
//   2. We normalize player names from both sources to a common format
//   3. We fuzzy-match FantasyPros names against Sleeper names to find player IDs
//   4. We build headshot URLs using those IDs
//
// Headshot URL format:
//   Full:  https://sleepercdn.com/content/nfl/players/{player_id}.jpg
//   Thumb: https://sleepercdn.com/content/nfl/players/thumb/{player_id}.jpg

const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const HEADSHOT_BASE       = 'https://sleepercdn.com/content/nfl/players';
const SKILL_POSITIONS     = new Set(['QB', 'RB', 'WR', 'TE']);

// ── Name normalization ────────────────────────────────────────────────────────
// Both sources get the same treatment so they're comparable.
// "D.K. Metcalf" → "dkmetcalf"
// "Marcelus Jones Jr." → "marcelusjones"

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\./g, '')          // remove periods (D.K. → DK)
    .replace(/'/g, '')           // remove apostrophes (D'Andre → DAndre)
    .replace(/\s+jr\.?$/i, '')   // strip Jr suffix
    .replace(/\s+sr\.?$/i, '')   // strip Sr suffix
    .replace(/\s+ii$/i, '')      // strip II
    .replace(/\s+iii$/i, '')     // strip III
    .replace(/\s+iv$/i, '')      // strip IV
    .replace(/\s+/g, '');        // remove all spaces
}

// ── Fetch and build lookup map ────────────────────────────────────────────────

export async function fetchSleeperPlayers() {
  // This is the API call — fetch() is the browser's built-in tool for requesting URLs
  const response = await fetch(SLEEPER_PLAYERS_URL);

  // Check the response was successful (status 200)
  if (!response.ok) {
    throw new Error(`Sleeper API error: ${response.status}`);
  }

  // Parse the JSON response — turns the text into a JavaScript object
  const allPlayers = await response.json();

  // Filter to active skill position players only (drops DST, K, coaches, etc.)
  // This reduces ~3000+ entries down to ~500 relevant players
  const skillPlayers = Object.entries(allPlayers).filter(([, p]) =>
    SKILL_POSITIONS.has(p.position) &&
    p.full_name &&
    p.team // must have an active team
  );

  // Build two lookup maps for matching:
  //   1. By normalized full name alone (most matches happen here)
  //   2. By normalized full name + team (for disambiguation)
  const byName     = new Map(); // normalized_name → player_id
  const byNameTeam = new Map(); // normalized_name|TEAM → player_id

  skillPlayers.forEach(([playerId, p]) => {
    const norm = normalizeName(p.full_name);
    byName.set(norm, playerId);
    byNameTeam.set(`${norm}|${p.team}`, playerId);
  });

  return { byName, byNameTeam };
}

// ── Match a single FantasyPros player to a Sleeper ID ────────────────────────

export function matchPlayer(fpPlayer, lookupMaps) {
  const { byName, byNameTeam } = lookupMaps;
  const norm = normalizeName(fpPlayer.name);
  const teamNorm = (fpPlayer.nflTeam || '').toUpperCase();

  // Try name + team first (most precise)
  const idByNameTeam = byNameTeam.get(`${norm}|${teamNorm}`);
  if (idByNameTeam) return idByNameTeam;

  // Fall back to name only
  const idByName = byName.get(norm);
  if (idByName) return idByName;

  // No match — player will use silhouette fallback
  return null;
}

// ── Build headshot URL from player ID ─────────────────────────────────────────

export function headshotUrl(playerId) {
  return `${HEADSHOT_BASE}/${playerId}.jpg`;
}

// ── Enrich a player list with Sleeper IDs and headshot URLs ──────────────────
// Call this after parsing the FantasyPros CSV.
// Returns the same players array with sleeperPlayerId and headshotUrl filled in.

export async function enrichPlayersWithHeadshots(players) {
  let lookupMaps;
  let matchCount = 0;

  try {
    lookupMaps = await fetchSleeperPlayers();
  } catch (err) {
    // If the API is down, just proceed without headshots
    console.warn('Sleeper API unavailable — skipping headshots:', err.message);
    return { players, matchCount: 0, total: players.length };
  }

  const enriched = players.map(player => {
    const sleeperPlayerId = matchPlayer(player, lookupMaps);
    if (sleeperPlayerId) {
      matchCount++;
      return {
        ...player,
        sleeperPlayerId,
        headshotUrl: headshotUrl(sleeperPlayerId),
      };
    }
    return player; // no match — headshotUrl stays null, silhouette shows
  });

  return { players: enriched, matchCount, total: players.length };
}
