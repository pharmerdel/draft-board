// Sleeper unofficial stats + projections API
// Stats endpoint returns season cumulative totals keyed by player_id
// Called lazily on first card open, then cached for the session

const cache = {
  stats2025: null,
  proj2026:  null,
  statsFetching: null,
  projFetching:  null,
};

// ── 2025 season stats ─────────────────────────────────────────────────────────

export async function fetchStats2025() {
  if (cache.stats2025) return cache.stats2025;
  if (cache.statsFetching) return cache.statsFetching;

  cache.statsFetching = (async () => {
    try {
      const res = await fetch('https://api.sleeper.app/v1/stats/nfl/regular/2025');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cache.stats2025 = data;
      return data;
    } catch (err) {
      console.warn('Could not fetch 2025 stats:', err.message);
      cache.stats2025 = {};
      return {};
    }
  })();

  return cache.statsFetching;
}

// ── 2026 projections ──────────────────────────────────────────────────────────
// Try season-total endpoints first. If only per-game data is available,
// detect it by checking pts_ppr magnitude and scale up by 17 games.

const NFL_GAMES = 17;

function isPerGame(data) {
  // Sample a few players — if the max pts_ppr seen is under 60, it's per-game
  const sample = Object.values(data).slice(0, 50);
  const maxPts = Math.max(...sample.map(p => p.pts_ppr || 0));
  return maxPts > 0 && maxPts < 60;
}

function scaleToSeason(data) {
  const scaled = {};
  for (const [id, p] of Object.entries(data)) {
    const s = {};
    for (const [k, v] of Object.entries(p)) {
      s[k] = typeof v === 'number' ? v * NFL_GAMES : v;
    }
    scaled[id] = s;
  }
  return scaled;
}

export async function fetchProj2026() {
  if (cache.proj2026) return cache.proj2026;
  if (cache.projFetching) return cache.projFetching;

  cache.projFetching = (async () => {
    // Try season-total endpoints first, then fall back to per-week
    const urls = [
      'https://api.sleeper.app/v1/projections/nfl/regular/2026',
      'https://api.sleeper.app/v1/projections/nfl/2026?season_type=regular&grouping=season',
      'https://api.sleeper.app/v1/projections/nfl/regular/2026/1',
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (!data || Object.keys(data).length < 10) continue;
        // If values look per-game, scale up to full season
        const result = isPerGame(data) ? scaleToSeason(data) : data;
        cache.proj2026 = result;
        return result;
      } catch {
        continue;
      }
    }
    console.warn('2026 projections not available');
    cache.proj2026 = {};
    return {};
  })();

  return cache.projFetching;
}

// ── Get stats + projections for one player ────────────────────────────────────

export async function getPlayerData(sleeperPlayerId) {
  if (!sleeperPlayerId) return { stats: null, proj: null };
  const [statsMap, projMap] = await Promise.all([fetchStats2025(), fetchProj2026()]);
  return {
    stats: statsMap[sleeperPlayerId] || null,
    proj:  projMap[sleeperPlayerId]  || null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmt(val, decimals = 0) {
  if (val == null || val === 0) return '—';
  return Number(val).toFixed(decimals);
}

export function fmtPts(val) {
  if (val == null || val === 0) return '—';
  return Number(val).toFixed(1);
}
