import * as XLSX from 'xlsx';

// Roster slot display order — matches ESPN's manual entry layout
const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];
const SLOT_LIMITS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5 };

function sortRosterBySlot(rosterEntries) {
  const grouped = {};
  SLOT_ORDER.forEach(slot => { grouped[slot] = []; });

  rosterEntries.forEach(([id, player]) => {
    const slot = player.slotType || 'BN';
    if (!grouped[slot]) grouped[slot] = [];
    grouped[slot].push({ id, ...player });
  });

  // Sort within each group by price descending
  Object.values(grouped).forEach(arr =>
    arr.sort((a, b) => (b.pricePaid || 0) - (a.pricePaid || 0))
  );

  return SLOT_ORDER.flatMap(slot => grouped[slot] || []);
}

// ── Tab 1: Draft Order ────────────────────────────────────────────────────────
function buildDraftOrderSheet(log, teams) {
  const picks = Object.values(log)
    .filter(e => e.type === 'sold')
    .sort((a, b) => a.timestamp - b.timestamp);

  const rows = [
    ['Pick #', 'Player', 'Position', 'NFL Team', 'Winning Team', 'Owner', 'Price Paid'],
  ];

  picks.forEach((pick, idx) => {
    const team = teams[pick.teamId];
    rows.push([
      idx + 1,
      pick.playerName,
      pick.position,
      pick.nflTeam,
      pick.teamName,
      team?.ownerName || '',
      pick.pricePaid,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 8 },   // Pick #
    { wch: 24 },  // Player
    { wch: 10 },  // Position
    { wch: 10 },  // NFL Team
    { wch: 20 },  // Winning Team
    { wch: 18 },  // Owner
    { wch: 12 },  // Price Paid
  ];

  return ws;
}

// ── Tab 2: By Team ────────────────────────────────────────────────────────────
function buildByTeamSheet(teams, nominationOrderIds) {
  const rows = [];

  nominationOrderIds.forEach((teamId, teamIdx) => {
    const team = teams[teamId];
    if (!team) return;

    // Blank row between teams (skip before first)
    if (teamIdx > 0) rows.push(['']);

    // Team header row
    rows.push([`${team.name}  —  ${team.ownerName}`, '', '', '']);

    // Column headers
    rows.push(['Slot', 'Player', 'NFL Team', 'Position', 'Price Paid']);

    // Players in ESPN slot order
    const sorted = sortRosterBySlot(Object.entries(team.roster || {}));
    sorted.forEach(p => {
      rows.push([
        p.slotType || 'BN',
        p.playerName || '',
        p.nflTeam || '',
        p.position || '',
        p.pricePaid ?? 0,
      ]);
    });

    // Empty slots
    const filled = sorted.length;
    const totalSlots = 13;
    const emptyCount = Math.max(0, totalSlots - filled);
    for (let i = 0; i < emptyCount; i++) {
      rows.push(['—', '(empty)', '', '', '']);
    }

    // Team total row
    const total = sorted.reduce((sum, p) => sum + (p.pricePaid || 0), 0);
    rows.push(['', 'TOTAL SPENT', '', '', total]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 8 },   // Slot
    { wch: 24 },  // Player
    { wch: 10 },  // NFL Team
    { wch: 10 },  // Position
    { wch: 12 },  // Price Paid
  ];

  return ws;
}

// ── Main export function ──────────────────────────────────────────────────────
export function exportDraftExcel({ teams, log, draft }) {
  const wb = XLSX.utils.book_new();

  const draftOrderSheet = buildDraftOrderSheet(log, teams);
  const byTeamSheet     = buildByTeamSheet(teams, draft.nominationOrderIds || []);

  XLSX.utils.book_append_sheet(wb, draftOrderSheet, 'Draft Order');
  XLSX.utils.book_append_sheet(wb, byTeamSheet,     'By Team');

  const date = new Date().toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: '2-digit'
  }).replace(/\//g, '-');

  const filename = `${(draft.leagueName || 'Draft').replace(/\s+/g, '-')}-results-${date}.xlsx`;
  XLSX.writeFile(wb, filename);
}
