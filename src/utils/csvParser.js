// Parses a FantasyPros rankings CSV into a player array.
// Expected columns: RK, TIERS, PLAYER NAME, TEAM, POS, BYE, SOS, ECR VS ADP
// POS format: "RB1", "WR4", "QB2", "TE1" — position + positional rank combined.
// Filters out K and DST automatically.

const ALLOWED_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

export function parseFantasyProsCsv(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV appears to be empty.');

  // Parse header to find column indices
  const header = parseCsvLine(lines[0]);
  const col = (name) => header.findIndex(h => h.replace(/"/g, '').trim().toUpperCase() === name.toUpperCase());

  const rkIdx       = col('RK');
  const nameIdx     = col('PLAYER NAME');
  const teamIdx     = col('TEAM');
  const posIdx      = col('POS');

  if (nameIdx === -1 || posIdx === -1) {
    throw new Error('Could not find expected columns. Make sure this is a FantasyPros rankings CSV.');
  }

  const players = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCsvLine(line);
    const rawPos = clean(cols[posIdx]);       // e.g. "RB1", "WR14", "DST3"
    const position = rawPos.replace(/\d+/g, ''); // e.g. "RB", "WR", "DST"

    // Skip K and DST
    if (!ALLOWED_POSITIONS.includes(position)) continue;

    const positionalRank = parseInt(rawPos.replace(/\D/g, ''), 10) || 0;
    const overallRank    = rkIdx !== -1 ? parseInt(clean(cols[rkIdx]), 10) || i : i;
    const name           = clean(cols[nameIdx]);
    const nflTeam        = teamIdx !== -1 ? clean(cols[teamIdx]) : '';

    if (!name) continue;

    players.push({
      name,
      position,
      positionalRank,
      overallRank,
      nflTeam,
      projectedValue: null,   // No auction values in rankings CSV — can be added later
      sleeperPlayerId: null,  // Populated in Phase 4 when Sleeper integration is added
      headshotUrl: null,
    });
  }

  if (players.length === 0) throw new Error('No valid players found. Check the CSV format.');
  return players;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clean(val) {
  if (val === undefined || val === null) return '';
  return val.toString().replace(/^"|"$/g, '').trim();
}

function parseCsvLine(line) {
  // Handles quoted fields with commas inside them
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
