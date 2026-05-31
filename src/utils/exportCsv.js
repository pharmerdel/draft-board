// Generates a draft results CSV grouped by team, suitable for ESPN offline entry.
// Format per team:
//   {Team Name} — {Owner Name}
//   Player,NFL Team,Position,Price Paid
//   {rows...}
//   [blank line between teams]

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE'];

function sortRosterPlayers(players) {
  return [...players].sort((a, b) => {
    const aIdx = POSITION_ORDER.indexOf(a.position);
    const bIdx = POSITION_ORDER.indexOf(b.position);
    // Known positions sort by position group first, then by price descending
    if (aIdx !== bIdx) return aIdx - bIdx;
    return (b.pricePaid || 0) - (a.pricePaid || 0);
  });
}

export function generateDraftCsv(teams, nominationOrderIds) {
  const sections = [];

  nominationOrderIds.forEach(teamId => {
    const team = teams[teamId];
    if (!team) return;

    const roster = Object.values(team.roster || {});
    if (roster.length === 0) return;

    const sorted = sortRosterPlayers(roster);
    const lines = [];

    // Team header
    lines.push(`${team.name} — ${team.ownerName}`);
    // Column headers
    lines.push('Player,NFL Team,Position,Price Paid');
    // Player rows
    sorted.forEach(p => {
      // Wrap any fields containing commas in quotes
      const name    = p.playerName?.includes(',') ? `"${p.playerName}"` : (p.playerName || '');
      const nflTeam = p.nflTeam || '';
      const pos     = p.position || '';
      const price   = `$${p.pricePaid ?? 0}`;
      lines.push(`${name},${nflTeam},${pos},${price}`);
    });

    sections.push(lines.join('\n'));
  });

  return sections.join('\n\n');
}

export function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
