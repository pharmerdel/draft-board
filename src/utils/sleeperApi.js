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
    const data = {
      sleeperPlayerId: playerId,
      espnId: p.espn_id ? String(p.espn_id) : null,
      injuryStatus:   p.injury_status    || null,
      injuryBodyPart: p.injury_body_part || null,
      injuryNotes:    p.injury_notes     || null,
    };
    byName.set(norm, data);
    byNameTeam.set(`${norm}|${p.team}`, data);
  });

  return { byName, byNameTeam };
}

// ── Match a single FantasyPros player to a Sleeper ID ────────────────────────

// Returns a data object { sleeperPlayerId, espnId, injuryStatus, ... } or null
export function matchPlayer(fpPlayer, lookupMaps) {
  const { byName, byNameTeam } = lookupMaps;
  const norm = normalizeName(fpPlayer.name);
  const teamNorm = (fpPlayer.nflTeam || '').toUpperCase();

  return byNameTeam.get(`${norm}|${teamNorm}`) || byName.get(norm) || null;
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
    const match = matchPlayer(player, lookupMaps);
    if (match) {
      matchCount++;
      return {
        ...player,
        sleeperPlayerId: match.sleeperPlayerId,
        headshotUrl:     headshotUrl(match.sleeperPlayerId),
        espnId:          match.espnId,
        injuryStatus:    match.injuryStatus,
        injuryBodyPart:  match.injuryBodyPart,
        injuryNotes:     match.injuryNotes,
      };
    }
    return player; // no match — headshotUrl stays null, silhouette shows
  });

  return { players: enriched, matchCount, total: players.length };
}

// ── Fetch recent player news via Google News RSS (nbcsports + rotowire) ───────
// Proxied through rss2json to handle CORS — no signup required for our volume.
// Only called on-demand when a user opens the PlayerCard.
// Returns up to 3 blurbs, or [] on any failure.

function stripHtml(str) {
  return (str || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function decodeXmlEntities(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

const NEWS_WORKER = 'https://draft-board-news.zachdelaney2012.workers.dev';

// ── DOM-based extraction (fast, accurate) ─────────────────────────────────────
function extractItemsDom(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return null; // signal: try regex fallback
  return Array.from(doc.getElementsByTagName('item')).slice(0, 3).map(item => ({
    headline:    stripHtml(item.getElementsByTagName('title')[0]?.textContent)       || '',
    description: stripHtml(item.getElementsByTagName('description')[0]?.textContent) || '',
    published:   item.getElementsByTagName('pubDate')[0]?.textContent?.trim()        || '',
    url:         item.getElementsByTagName('link')[0]?.textContent?.trim()           || '',
  }));
}

// ── Regex-based extraction (fallback for malformed XML) ───────────────────────
// Google News RSS occasionally has unquoted attributes or other XML violations.
// This bypasses DOMParser and pulls fields directly from the raw string.
function extractItemsRegex(xml) {
  const results = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null && results.length < 3) {
    const block = m[1];
    const get = (tag) => {
      const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return match?.[1] || '';
    };
    results.push({
      headline:    stripHtml(decodeXmlEntities(get('title'))),
      description: stripHtml(decodeXmlEntities(get('description'))),
      published:   get('pubDate').trim(),
      url:         decodeXmlEntities(get('link')).trim(),
    });
  }
  return results;
}

export async function fetchPlayerNews(playerName) {
  if (!playerName) return [];
  try {
    const url = `${NEWS_WORKER}/?player=${encodeURIComponent(playerName)}`;
    console.log('[news] fetching:', url);
    const res = await fetch(url);
    console.log('[news] status:', res.status);
    if (!res.ok) return [];

    const xml = await res.text();
    console.log('[news] xml length:', xml?.length);

    // Try DOM parser first; fall back to regex if XML isn't well-formed
    let items = extractItemsDom(xml);
    if (items === null) {
      console.warn('[news] XML not well-formed — using regex fallback');
      items = extractItemsRegex(xml);
    }
    console.log('[news] items found:', items.length);
    return items;
  } catch (err) {
    console.error('[news] fetch error:', err);
    return [];
  }
}
