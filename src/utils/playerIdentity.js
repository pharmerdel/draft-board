const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

const TEAM_ALIASES = new Map([
  ['ARZ', 'ARI'],
  ['JAC', 'JAX'],
  ['LA', 'LAR'],
  ['OAK', 'LV'],
  ['SD', 'LAC'],
  ['STL', 'LAR'],
]);

export function normalizePosition(position) {
  return String(position || '').toUpperCase().replace(/[^A-Z]/g, '');
}

export function normalizeTeam(team) {
  const normalized = String(team || '').trim().toUpperCase();
  return TEAM_ALIASES.get(normalized) || normalized;
}

export function normalizePlayerName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

export function playerOverrideKey(player) {
  return `${normalizePosition(player.position)}|${normalizePlayerName(player.name)}`;
}

function exactPlayerName(name) {
  return String(name || '').trim().toLocaleLowerCase('en-US');
}

function addToIndex(index, key, player) {
  if (!key) return;
  const entries = index.get(key) || [];
  if (!entries.some(candidate => candidate.sleeperPlayerId === player.sleeperPlayerId)) {
    entries.push(player);
    index.set(key, entries);
  }
}

function sleeperAliases(player) {
  return [
    player.full_name,
    player.search_full_name,
    [player.first_name, player.last_name].filter(Boolean).join(' '),
  ].filter(Boolean);
}

export function buildSleeperPlayerIndex(allPlayers) {
  const exact = new Map();
  const normalized = new Map();
  const exactAnyPosition = new Map();
  const normalizedAnyPosition = new Map();
  const allById = new Map();
  let eligibleCount = 0;

  for (const [playerId, rawPlayer] of Object.entries(allPlayers || {})) {
    const position = normalizePosition(rawPlayer.position);
    if (!rawPlayer.full_name) continue;
    const player = {
      sleeperPlayerId: String(playerId),
      fullName: rawPlayer.full_name,
      position,
      nflTeam: normalizeTeam(rawPlayer.team),
      status: rawPlayer.status || null,
      espnId: rawPlayer.espn_id ? String(rawPlayer.espn_id) : null,
      injuryStatus: rawPlayer.injury_status || null,
      injuryBodyPart: rawPlayer.injury_body_part || null,
      injuryNotes: rawPlayer.injury_notes || null,
    };
    allById.set(player.sleeperPlayerId, player);

    addToIndex(exactAnyPosition, exactPlayerName(rawPlayer.full_name), player);
    for (const alias of sleeperAliases(rawPlayer)) {
      addToIndex(normalizedAnyPosition, normalizePlayerName(alias), player);
    }

    if (!SKILL_POSITIONS.has(position)) continue;
    eligibleCount++;

    addToIndex(exact, `${exactPlayerName(rawPlayer.full_name)}|${position}`, player);
    for (const alias of sleeperAliases(rawPlayer)) {
      addToIndex(normalized, `${normalizePlayerName(alias)}|${position}`, player);
    }
  }

  return { exact, normalized, exactAnyPosition, normalizedAnyPosition, allById, eligibleCount };
}

function resolveCandidates(candidates, fpTeam) {
  if (candidates.length <= 1) return candidates;
  if (!fpTeam) return candidates;
  const sameTeam = candidates.filter(candidate => candidate.nflTeam === fpTeam);
  return sameTeam.length === 1 ? sameTeam : candidates;
}

export function matchCatalogPlayer(fpPlayer, index) {
  const position = normalizePosition(fpPlayer.position);
  const team = normalizeTeam(fpPlayer.nflTeam);
  const exactKey = `${exactPlayerName(fpPlayer.name)}|${position}`;
  const normalizedKey = `${normalizePlayerName(fpPlayer.name)}|${position}`;

  const exactCandidates = resolveCandidates(index.exact.get(exactKey) || [], team);
  if (exactCandidates.length === 1) {
    return { status: 'exact', player: exactCandidates[0], candidates: exactCandidates };
  }
  if (exactCandidates.length > 1) {
    return { status: 'ambiguous', player: null, candidates: exactCandidates };
  }

  const normalizedCandidates = resolveCandidates(index.normalized.get(normalizedKey) || [], team);
  if (normalizedCandidates.length === 1) {
    return { status: 'normalized', player: normalizedCandidates[0], candidates: normalizedCandidates };
  }
  if (normalizedCandidates.length > 1) {
    return { status: 'ambiguous', player: null, candidates: normalizedCandidates };
  }

  // FantasyPros may classify fullbacks and hybrid players as RB/TE/WR while
  // Sleeper uses another position. A unique same-name match remains safe.
  const anyPositionExact = resolveCandidates(index.exactAnyPosition.get(exactPlayerName(fpPlayer.name)) || [], team);
  if (anyPositionExact.length === 1) {
    return { status: 'normalized', player: anyPositionExact[0], candidates: anyPositionExact };
  }
  if (anyPositionExact.length > 1) {
    return { status: 'ambiguous', player: null, candidates: anyPositionExact };
  }

  const anyPositionNormalized = resolveCandidates(index.normalizedAnyPosition.get(normalizePlayerName(fpPlayer.name)) || [], team);
  if (anyPositionNormalized.length === 1) {
    return { status: 'normalized', player: anyPositionNormalized[0], candidates: anyPositionNormalized };
  }
  if (anyPositionNormalized.length > 1) {
    return { status: 'ambiguous', player: null, candidates: anyPositionNormalized };
  }

  return { status: 'unmatched', player: null, candidates: [] };
}

export function fallbackPlayerId(player) {
  const position = normalizePosition(player.position).toLowerCase() || 'unknown';
  const name = normalizePlayerName(player.name) || 'unnamed';
  return `fp_${position}_${name}`;
}

export function buildCatalogPreview(fpPlayers, sleeperPlayers, { overrides = {} } = {}) {
  const index = buildSleeperPlayerIndex(sleeperPlayers);
  const sleeperById = index.allById;
  const summary = { total: fpPlayers.length, exact: 0, normalized: 0, override: 0, ambiguous: 0, unmatched: 0 };

  const players = fpPlayers.map(fpPlayer => {
    const overrideId = overrides[playerOverrideKey(fpPlayer)];
    const overridePlayer = overrideId ? sleeperById.get(String(overrideId)) : null;
    if (overrideId && !overridePlayer) {
      throw new Error(`Invalid Sleeper override for ${playerOverrideKey(fpPlayer)}: ${overrideId}`);
    }
    const match = overridePlayer
      ? { status: 'override', player: overridePlayer, candidates: [overridePlayer] }
      : matchCatalogPlayer(fpPlayer, index);
    summary[match.status]++;
    const sleeper = match.player;
    const stablePlayerId = sleeper?.sleeperPlayerId || fallbackPlayerId(fpPlayer);

    return {
      ...fpPlayer,
      stablePlayerId,
      sleeperPlayerId: sleeper?.sleeperPlayerId || null,
      headshotUrl: sleeper ? `https://sleepercdn.com/content/nfl/players/${sleeper.sleeperPlayerId}.jpg` : null,
      espnId: sleeper?.espnId || null,
      injuryStatus: sleeper?.injuryStatus || null,
      injuryBodyPart: sleeper?.injuryBodyPart || null,
      injuryNotes: sleeper?.injuryNotes || null,
      catalogMatchStatus: match.status,
      catalogMatchCandidates: match.candidates.map(candidate => ({
        sleeperPlayerId: candidate.sleeperPlayerId,
        fullName: candidate.fullName,
        position: candidate.position,
        nflTeam: candidate.nflTeam,
      })),
    };
  });

  return { players, summary, sleeperEligibleCount: index.eligibleCount };
}
