import XLSX from 'xlsx-js-style';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { TOTAL_DRAFT_SLOTS } from './rosterRules.js';

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];
const MAX_DRAFT_PICKS = 156;
const CONSOLE_HEADER_ROW = 8;
const CONSOLE_FIRST_ROW = CONSOLE_HEADER_ROW + 1;
const CONSOLE_LAST_ROW = CONSOLE_FIRST_ROW + MAX_DRAFT_PICKS - 1;
const DISPLAY_SLOTS = [
  { section: 'STARTERS' },
  { slot: 'QB', occurrence: 1, label: 'QB' },
  { slot: 'RB', occurrence: 1, label: 'RB 1' },
  { slot: 'RB', occurrence: 2, label: 'RB 2' },
  { slot: 'WR', occurrence: 1, label: 'WR 1' },
  { slot: 'WR', occurrence: 2, label: 'WR 2' },
  { slot: 'TE', occurrence: 1, label: 'TE' },
  { slot: 'FLEX', occurrence: 1, label: 'FLEX 1' },
  { slot: 'FLEX', occurrence: 2, label: 'FLEX 2' },
  { section: 'BENCH' },
  { slot: 'BN', occurrence: 1, label: 'BN 1' },
  { slot: 'BN', occurrence: 2, label: 'BN 2' },
  { slot: 'BN', occurrence: 3, label: 'BN 3' },
  { slot: 'BN', occurrence: 4, label: 'BN 4' },
  { slot: 'BN', occurrence: 5, label: 'BN 5' },
];
const COLORS = {
  navy: '17324D',
  teal: '167D8D',
  tealLight: 'DCEFF2',
  gold: 'F2C14E',
  goldLight: 'FFF4CC',
  green: '2F6B4F',
  greenLight: 'E4F1E9',
  gray: 'E8EDF1',
  border: 'AAB8C2',
  white: 'FFFFFF',
  templateGreen: '6AA84F',
  templateYellow: 'FFE599',
  templateRed: 'E06666',
  templateBlue: '4A86E8',
};

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function orderedTeamIds(snapshot) {
  const teams = asRecord(snapshot.teams);
  const officialOrder = Array.isArray(snapshot.draft?.nominationOrderIds)
    ? snapshot.draft.nominationOrderIds.filter(teamId => teams[teamId])
    : [];
  const remainingIds = Object.keys(teams)
    .filter(teamId => teamId !== 'commissioner' && !officialOrder.includes(teamId))
    .sort(compareText);
  return [...officialOrder, ...remainingIds];
}

function rosterEntries(team) {
  const orderIndex = slot => {
    const index = SLOT_ORDER.indexOf(slot);
    return index === -1 ? SLOT_ORDER.length : index;
  };
  return Object.entries(asRecord(team?.roster))
    .map(([playerId, player]) => ({ playerId, ...asRecord(player) }))
    .sort((left, right) => (
      orderIndex(left.slotType) - orderIndex(right.slotType)
      || safeNumber(right.pricePaid) - safeNumber(left.pricePaid)
      || compareText(left.playerName, right.playerName)
    ));
}

function activeSales(log) {
  return Object.entries(asRecord(log))
    .filter(([, entry]) => entry?.type === 'sold')
    .sort(([, left], [, right]) => safeNumber(left.timestamp) - safeNumber(right.timestamp));
}

function formatTimestamp(value) {
  const timestamp = safeNumber(value, NaN);
  return Number.isFinite(timestamp) ? new Date(timestamp) : '';
}

function addSheet(workbook, name, rows, widths, { freezeRows = 1, autoFilter = true } = {}) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = widths.map(width => ({ wch: width }));
  if (autoFilter && rows.length > 1) {
    worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length - 1, c: rows[0].length - 1 },
    }) };
  }
  if (freezeRows) worksheet['!freeze'] = { xSplit: 0, ySplit: freezeRows };
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
  return worksheet;
}

function formulaCell(worksheet, address, formula, cachedValue = '') {
  const isNumber = typeof cachedValue === 'number' && Number.isFinite(cachedValue);
  worksheet[address] = {
    t: isNumber ? 'n' : 's',
    v: cachedValue,
    f: formula,
  };
}

function setNumberFormat(worksheet, range, format) {
  const decoded = XLSX.utils.decode_range(range);
  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let column = decoded.s.c; column <= decoded.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      if (worksheet[address]) worksheet[address].z = format;
    }
  }
}

function styleRange(worksheet, range, style, { createCells = true } = {}) {
  const decoded = XLSX.utils.decode_range(range);
  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let column = decoded.s.c; column <= decoded.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      if (!worksheet[address] && !createCells) continue;
      if (!worksheet[address]) worksheet[address] = { t: 'z' };
      const existingStyle = worksheet[address].s || {};
      const nextStyle = { ...existingStyle, ...style };
      ['font', 'fill', 'alignment', 'border'].forEach(key => {
        if (existingStyle[key] || style[key]) {
          nextStyle[key] = { ...(existingStyle[key] || {}), ...(style[key] || {}) };
        } else {
          delete nextStyle[key];
        }
      });
      worksheet[address].s = nextStyle;
    }
  }
}

const thinBorder = {
  top: { style: 'thin', color: { rgb: COLORS.border } },
  bottom: { style: 'thin', color: { rgb: COLORS.border } },
  left: { style: 'thin', color: { rgb: COLORS.border } },
  right: { style: 'thin', color: { rgb: COLORS.border } },
};

function bandStyle(fill, color = COLORS.white, size = 11) {
  return {
    fill: { patternType: 'solid', fgColor: { rgb: fill } },
    font: { bold: true, color: { rgb: color }, sz: size },
    alignment: { vertical: 'center' },
  };
}

function quoted(value) {
  return String(value ?? '').replaceAll('"', '""');
}

function playerLookupFormula(row, returnColumn, playerEndRow) {
  return `IFERROR(INDEX('Player Data'!$${returnColumn}$2:$${returnColumn}$${playerEndRow},MATCH($C${row},'Player Data'!$A$2:$A$${playerEndRow},0)),"")`;
}

function teamLookupFormula(row, returnColumn, teamEndRow) {
  return `IFERROR(INDEX('Team Data'!$${returnColumn}$2:$${returnColumn}$${teamEndRow},MATCH($G${row},'Team Data'!$A$2:$A$${teamEndRow},0)),"")`;
}

function priorSlotCountFormula(row, slot) {
  if (row === CONSOLE_FIRST_ROW) return '0';
  return `COUNTIFS($G$${CONSOLE_FIRST_ROW}:$G$${row - 1},$G${row},$J$${CONSOLE_FIRST_ROW}:$J$${row - 1},"${slot}",$K$${CONSOLE_FIRST_ROW}:$K$${row - 1},"SOLD")`;
}

function priorTeamPickCountFormula(row) {
  if (row === CONSOLE_FIRST_ROW) return '0';
  return `COUNTIFS($G$${CONSOLE_FIRST_ROW}:$G$${row - 1},$G${row},$K$${CONSOLE_FIRST_ROW}:$K$${row - 1},"SOLD")`;
}

function priorTeamSpendFormula(row) {
  if (row === CONSOLE_FIRST_ROW) return '0';
  return `SUMIFS($I$${CONSOLE_FIRST_ROW}:$I$${row - 1},$G$${CONSOLE_FIRST_ROW}:$G$${row - 1},$G${row},$K$${CONSOLE_FIRST_ROW}:$K$${row - 1},"SOLD")`;
}

function maxLegalBidFormula(row, teamEndRow) {
  const budgetBeforePick = `(${teamLookupFormula(row, 'E', teamEndRow)}-${priorTeamSpendFormula(row)})`;
  const futureOpenSlots = `(${TOTAL_DRAFT_SLOTS}-${priorTeamPickCountFormula(row)}-1)`;
  return `(${budgetBeforePick}-${futureOpenSlots})`;
}

function assignedSlotFormula(row) {
  const qb = priorSlotCountFormula(row, 'QB');
  const rb = priorSlotCountFormula(row, 'RB');
  const wr = priorSlotCountFormula(row, 'WR');
  const te = priorSlotCountFormula(row, 'TE');
  const flex = priorSlotCountFormula(row, 'FLEX');
  const bench = priorSlotCountFormula(row, 'BN');
  return `IF(OR($C${row}="",$G${row}=""),"",IF(NOT(OR($E${row}="QB",$E${row}="RB",$E${row}="WR",$E${row}="TE")),"INVALID POS",IF(AND($E${row}="QB",${qb}<1),"QB",IF(AND($E${row}="RB",${rb}<2),"RB",IF(AND($E${row}="WR",${wr}<2),"WR",IF(AND($E${row}="TE",${te}<1),"TE",IF(AND(OR($E${row}="RB",$E${row}="WR",$E${row}="TE"),${flex}<2),"FLEX",IF(${bench}<5,"BN","FULL"))))))))`;
}

function statusFormula(row, teamEndRow) {
  return `IF($C${row}="","",IF(UPPER($B${row})="YES",IF(AND($D${row}<>"",$H${row}<>"",$I${row}>=1,$I${row}<=${maxLegalBidFormula(row, teamEndRow)},$J${row}<>"FULL",$J${row}<>"INVALID POS",COUNTIF($C$${CONSOLE_FIRST_ROW}:$C$${CONSOLE_LAST_ROW},$C${row})=1),"SOLD","FIX ENTRY"),"ON BLOCK"))`;
}

function budgetAfterFormula(row, teamEndRow) {
  return `IF($G${row}="","",${teamLookupFormula(row, 'E', teamEndRow)}-SUMIFS($I$${CONSOLE_FIRST_ROW}:$I${row},$G$${CONSOLE_FIRST_ROW}:$G${row},$G${row},$K$${CONSOLE_FIRST_ROW}:$K${row},"SOLD"))`;
}

function rosterKeyFormula(row) {
  return `IF($K${row}<>"SOLD","",$G${row}&"|"&$J${row}&"|"&COUNTIFS($G$${CONSOLE_FIRST_ROW}:$G${row},$G${row},$J$${CONSOLE_FIRST_ROW}:$J${row},$J${row},$K$${CONSOLE_FIRST_ROW}:$K${row},"SOLD"))`;
}

function checkFormula(row, teamEndRow) {
  return `IF($C${row}="","",IF(COUNTIF($C$${CONSOLE_FIRST_ROW}:$C$${CONSOLE_LAST_ROW},$C${row})>1,"DUPLICATE PLAYER",IF($D${row}="","UNKNOWN PLAYER ID",IF(UPPER($B${row})<>"YES","READY / ON BLOCK",IF($G${row}="","TEAM REQUIRED",IF($H${row}="","UNKNOWN TEAM ID",IF(OR($I${row}="",$I${row}<1),"BID REQUIRED",IF($J${row}="FULL","ROSTER FULL",IF($J${row}="INVALID POS","INVALID POSITION",IF($I${row}>${maxLegalBidFormula(row, teamEndRow)},"OVER MAX BID","OK"))))))))))`;
}

export function recoveryWorkbookData(snapshot) {
  const teams = asRecord(snapshot?.teams);
  const players = asRecord(snapshot?.players);
  const log = asRecord(snapshot?.log);
  const teamIds = orderedTeamIds(snapshot || {});
  const sales = activeSales(log);
  const rosteredPlayerIds = new Set(
    teamIds.flatMap(teamId => Object.keys(asRecord(teams[teamId]?.roster))),
  );

  const summaryRows = teamIds.map((teamId, index) => {
    const team = teams[teamId];
    const roster = rosterEntries(team);
    const spent = roster.reduce((total, player) => total + safeNumber(player.pricePaid), 0);
    const budgetRemaining = safeNumber(team.budgetRemaining, 200);
    const openSlots = Math.max(0, TOTAL_DRAFT_SLOTS - roster.length);
    return [
      teamId,
      index + 1,
      team.name || '',
      team.ownerName || '',
      budgetRemaining,
      spent,
      roster.length,
      openSlots,
      openSlots ? Math.max(0, budgetRemaining - (openSlots - 1)) : 0,
    ];
  });

  const rosterRows = teamIds.flatMap(teamId => {
    const team = teams[teamId];
    const roster = rosterEntries(team);
    if (!roster.length) {
      return [[teamId, team.name || '', team.ownerName || '', safeNumber(team.budgetRemaining, 200), '', '', '', '', '', '']];
    }
    return roster.map((player, index) => [
      teamId,
      team.name || '',
      team.ownerName || '',
      safeNumber(team.budgetRemaining, 200),
      index + 1,
      player.slotType || 'BN',
      player.playerName || players[player.playerId]?.name || '',
      player.position || players[player.playerId]?.position || '',
      player.nflTeam || players[player.playerId]?.nflTeam || '',
      safeNumber(player.pricePaid),
    ]);
  });

  const remainingRows = Object.entries(players)
    .filter(([playerId, player]) => player?.status !== 'sold' && !rosteredPlayerIds.has(playerId))
    .map(([playerId, player]) => [
      playerId,
      player.name || '',
      player.position || '',
      player.nflTeam || '',
      safeNumber(player.overallRank, ''),
      safeNumber(player.positionalRank, ''),
      player.projectedValue == null ? '' : safeNumber(player.projectedValue, ''),
      `${player.name || playerId} — ${player.position || '?'} · ${player.nflTeam || 'FA'} [${playerId}]`,
      player.status || 'available',
      snapshot.draft?.currentNomination?.playerId === playerId ? 'YES' : '',
    ])
    .sort((left, right) => (
      safeNumber(left[4], Number.MAX_SAFE_INTEGER) - safeNumber(right[4], Number.MAX_SAFE_INTEGER)
      || compareText(left[1], right[1])
    ));

  const logRows = sales.map(([logId, sale], index) => [
    index + 1,
    formatTimestamp(sale.timestamp),
    sale.playerId || '',
    sale.playerName || players[sale.playerId]?.name || '',
    sale.position || players[sale.playerId]?.position || '',
    sale.nflTeam || players[sale.playerId]?.nflTeam || '',
    sale.teamId || '',
    sale.teamName || teams[sale.teamId]?.name || '',
    teams[sale.teamId]?.ownerName || '',
    safeNumber(sale.pricePaid),
    sale.slotType || teams[sale.teamId]?.roster?.[sale.playerId]?.slotType || '',
    logId,
  ]);

  return {
    teamIds,
    sales,
    summaryRows,
    rosterRows,
    remainingRows,
    logRows,
  };
}

export function buildRecoveryWorkbook(snapshot) {
  if (!snapshot?.draft || !snapshot?.teams || !snapshot?.players) {
    throw new Error('Invalid backup file — missing draft, teams, or players.');
  }

  const data = recoveryWorkbookData(snapshot);
  const workbook = XLSX.utils.book_new();
  const players = asRecord(snapshot.players);
  const teams = asRecord(snapshot.teams);
  const playerRows = Object.entries(players)
    .map(([playerId, player]) => [
      playerId,
      player.name || '',
      player.position || '',
      player.nflTeam || '',
      safeNumber(player.overallRank, ''),
      safeNumber(player.positionalRank, ''),
      player.projectedValue == null ? '' : safeNumber(player.projectedValue, ''),
      `${player.name || playerId} — ${player.position || '?'} · ${player.nflTeam || 'FA'} [${playerId}]`,
    ])
    .sort((left, right) => (
      safeNumber(left[4], Number.MAX_SAFE_INTEGER) - safeNumber(right[4], Number.MAX_SAFE_INTEGER)
      || compareText(left[1], right[1])
    ));
  const playerEndRow = playerRows.length + 1;

  const startingBudgets = {};
  const teamRows = data.teamIds.map((teamId, index) => {
    const roster = rosterEntries(teams[teamId]);
    const spent = roster.reduce((total, player) => total + safeNumber(player.pricePaid), 0);
    const startingBudget = safeNumber(teams[teamId].budgetRemaining, 200) + spent;
    startingBudgets[teamId] = startingBudget;
    return [
      teamId, index + 1, teams[teamId].name || '', teams[teamId].ownerName || '', startingBudget,
      `${teams[teamId].name || teamId} — ${teams[teamId].ownerName || 'Owner'} [${teamId}]`,
    ];
  });
  const teamEndRow = teamRows.length + 1;

  const playerData = addSheet(workbook, 'Player Data', [
    ['PLAYER ID', 'PLAYER', 'POS', 'NFL', 'OVERALL RANK', 'POS RANK', 'PROJECTED $', 'PLAYER SEARCH CHOICE'],
    ...playerRows,
  ], [18, 30, 9, 9, 15, 12, 14, 48]);
  setNumberFormat(playerData, `G2:G${playerEndRow}`, '$#,##0');

  const teamData = addSheet(workbook, 'Team Data', [
    ['TEAM ID', 'ORDER', 'TEAM', 'OWNER', 'STARTING BUDGET', 'TEAM SEARCH CHOICE'],
    ...teamRows,
  ], [14, 9, 32, 24, 19, 46]);
  setNumberFormat(teamData, `E2:E${teamEndRow}`, '$#,##0');

  const futurePickCount = Math.max(0, MAX_DRAFT_PICKS - data.sales.length);
  const entryFirstRow = 9;
  const entryLastRow = Math.max(entryFirstRow, entryFirstRow + futurePickCount - 1);
  const commissionerConsole = XLSX.utils.aoa_to_sheet(
    Array.from({ length: entryLastRow }, () => Array(26).fill('')),
  );
  XLSX.utils.book_append_sheet(workbook, commissionerConsole, 'Nomination List');

  const consoleRows = Array.from({ length: CONSOLE_LAST_ROW }, () => Array(17).fill(''));
  consoleRows[0] = ['DRAFT LEDGER — FORMULA ENGINE', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  consoleRows[1] = ['Use Nomination List for all new picks. This supporting ledger contains imported history and formula calculations.', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  consoleRows[3] = ['League', snapshot.draft.leagueName || 'Draft', 'Snapshot picks', data.sales.length, 'Capacity', MAX_DRAFT_PICKS, 'Source', 'Commissioner JSON backup', '', '', '', '', '', ''];
  consoleRows[5] = ['LEDGER FIELDS', 'Submit', 'Player ID', '', '', '', 'Winning Team ID', '', 'Bid', '', '', '', '', ''];
  consoleRows[6] = ['Historical picks are fixed values. Future rows are linked to Nomination List and calculate automatically.', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  consoleRows[CONSOLE_HEADER_ROW - 1] = [
    'PICK', 'SUBMIT', 'PLAYER ID', 'PLAYER', 'POS', 'NFL', 'WINNING TEAM ID',
    'FANTASY TEAM', 'BID', 'ASSIGNED SLOT', 'STATUS', 'BUDGET AFTER', 'CHECK', 'ROSTER KEY',
  ];
  const draftConsole = XLSX.utils.aoa_to_sheet(consoleRows);
  draftConsole['!cols'] = [
    { wch: 8 }, { wch: 11 }, { wch: 18 }, { wch: 30 }, { wch: 8 }, { wch: 8 },
    { wch: 19 }, { wch: 31 }, { wch: 10 }, { wch: 15 }, { wch: 14 }, { wch: 15 }, { wch: 22 },
  ];
  draftConsole['!merges'] = [
    XLSX.utils.decode_range('A1:N1'),
    XLSX.utils.decode_range('A2:N2'),
    XLSX.utils.decode_range('A7:N7'),
  ];
  draftConsole['!freeze'] = { xSplit: 3, ySplit: CONSOLE_HEADER_ROW };
  draftConsole['!autofilter'] = { ref: `A${CONSOLE_HEADER_ROW}:M${CONSOLE_LAST_ROW}` };
  draftConsole['!cols'].push(
    { wch: 3, hidden: true },
    { wch: 3, hidden: true },
    { wch: 3, hidden: true },
    { wch: 3, hidden: true },
  );

  const soldRows = data.sales.map(([logId, sale], index) => ({
    pick: index + 1,
    playerId: sale.playerId || '',
    teamId: sale.teamId || '',
    pricePaid: safeNumber(sale.pricePaid),
    slotType: sale.slotType || teams[sale.teamId]?.roster?.[sale.playerId]?.slotType || '',
    logId,
  }));
  const nominatedPlayerId = snapshot.draft.currentNomination?.playerId || '';
  const runningSpent = {};

  for (let pick = 1; pick <= MAX_DRAFT_PICKS; pick += 1) {
    const row = CONSOLE_FIRST_ROW + pick - 1;
    const sale = soldRows[pick - 1];
    const isQueuedNomination = !sale && pick === soldRows.length + 1 && nominatedPlayerId;
    const playerId = sale?.playerId || (isQueuedNomination ? nominatedPlayerId : '');
    const teamId = sale?.teamId || '';
    const player = players[playerId] || {};
    const team = teams[teamId] || {};
    const status = sale ? 'SOLD' : (playerId ? 'ON BLOCK' : '');
    const slotType = sale?.slotType || '';
    const entryRow = entryFirstRow + pick - soldRows.length - 1;
    if (sale) runningSpent[teamId] = safeNumber(runningSpent[teamId]) + sale.pricePaid;
    const budgetAfter = sale ? startingBudgets[teamId] - runningSpent[teamId] : '';

    draftConsole[`A${row}`] = { t: 'n', v: pick };
    if (sale) draftConsole[`B${row}`] = { t: 's', v: 'YES' };
    else formulaCell(draftConsole, `B${row}`, `IF('Nomination List'!$J$${entryRow}="","",'Nomination List'!$J$${entryRow})`, '');
    if (sale) draftConsole[`C${row}`] = { t: 's', v: playerId };
    else formulaCell(draftConsole, `C${row}`, `IF('Nomination List'!$C$${entryRow}="","",'Nomination List'!$C$${entryRow})`, playerId);
    formulaCell(draftConsole, `D${row}`, playerLookupFormula(row, 'B', playerEndRow), player.name || '');
    formulaCell(draftConsole, `E${row}`, playerLookupFormula(row, 'C', playerEndRow), player.position || '');
    formulaCell(draftConsole, `F${row}`, playerLookupFormula(row, 'D', playerEndRow), player.nflTeam || '');
    if (sale) draftConsole[`G${row}`] = { t: 's', v: teamId };
    else formulaCell(draftConsole, `G${row}`, `IF('Nomination List'!$H$${entryRow}="","",'Nomination List'!$H$${entryRow})`, '');
    formulaCell(draftConsole, `H${row}`, teamLookupFormula(row, 'C', teamEndRow), team.name || '');
    if (sale) draftConsole[`I${row}`] = { t: 'n', v: sale.pricePaid, z: '$#,##0' };
    else formulaCell(draftConsole, `I${row}`, `IF('Nomination List'!$I$${entryRow}="","",'Nomination List'!$I$${entryRow})`, '');
    if (sale) draftConsole[`J${row}`] = { t: 's', v: slotType };
    else formulaCell(draftConsole, `J${row}`, assignedSlotFormula(row), '');
    formulaCell(draftConsole, `K${row}`, statusFormula(row, teamEndRow), status);
    formulaCell(draftConsole, `L${row}`, budgetAfterFormula(row, teamEndRow), budgetAfter);
    formulaCell(draftConsole, `M${row}`, checkFormula(row, teamEndRow), playerId ? (sale ? 'OK' : 'READY / ON BLOCK') : '');
    let slotOccurrence = 0;
    if (sale) {
      slotOccurrence = soldRows.slice(0, pick).filter(previous => previous.teamId === teamId && previous.slotType === slotType).length;
    }
    formulaCell(draftConsole, `N${row}`, rosterKeyFormula(row), sale ? `${teamId}|${slotType}|${slotOccurrence}` : '');
  }
  data.teamIds.forEach((teamId, index) => {
    const row = CONSOLE_FIRST_ROW + index;
    draftConsole[`O${row}`] = { t: 's', v: teamId };
    formulaCell(
      draftConsole,
      `P${row}`,
      `${startingBudgets[teamId]}-SUMIFS($I$${CONSOLE_FIRST_ROW}:$I$${CONSOLE_LAST_ROW},$G$${CONSOLE_FIRST_ROW}:$G$${CONSOLE_LAST_ROW},$O${row},$K$${CONSOLE_FIRST_ROW}:$K$${CONSOLE_LAST_ROW},"SOLD")`,
      '',
    );
    formulaCell(
      draftConsole,
      `Q${row}`,
      `COUNTIFS($G$${CONSOLE_FIRST_ROW}:$G$${CONSOLE_LAST_ROW},$O${row},$K$${CONSOLE_FIRST_ROW}:$K$${CONSOLE_LAST_ROW},"SOLD")`,
      '',
    );
    draftConsole[`P${row}`].z = '$#,##0';
  });
  setNumberFormat(draftConsole, `I${CONSOLE_FIRST_ROW}:I${CONSOLE_LAST_ROW}`, '$#,##0');
  setNumberFormat(draftConsole, `L${CONSOLE_FIRST_ROW}:L${CONSOLE_LAST_ROW}`, '$#,##0');
  styleRange(draftConsole, 'A1:N1', { ...bandStyle(COLORS.navy, COLORS.white, 18), alignment: { horizontal: 'left', vertical: 'center' } });
  styleRange(draftConsole, 'A2:N2', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.tealLight } }, font: { italic: true, color: { rgb: COLORS.navy } }, alignment: { wrapText: true, vertical: 'center' } });
  styleRange(draftConsole, 'A4:N4', { font: { bold: true, color: { rgb: COLORS.navy } } }, { createCells: false });
  styleRange(draftConsole, 'A6:N6', bandStyle(COLORS.gray, COLORS.navy));
  styleRange(draftConsole, 'A7:N7', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.goldLight } }, font: { italic: true, color: { rgb: COLORS.navy } }, alignment: { wrapText: true } });
  styleRange(draftConsole, `A${CONSOLE_HEADER_ROW}:N${CONSOLE_HEADER_ROW}`, { ...bandStyle(COLORS.teal), border: thinBorder, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } });
  styleRange(draftConsole, `A${CONSOLE_FIRST_ROW}:N${CONSOLE_LAST_ROW}`, { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, border: thinBorder, alignment: { vertical: 'center' } });
  ['B', 'C', 'G', 'I'].forEach(column => styleRange(draftConsole, `${column}${CONSOLE_FIRST_ROW}:${column}${CONSOLE_LAST_ROW}`, {
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.goldLight } },
    border: thinBorder,
  }));
  if (soldRows.length) {
    styleRange(draftConsole, `K${CONSOLE_FIRST_ROW}:K${CONSOLE_FIRST_ROW + soldRows.length - 1}`, {
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.greenLight } },
      font: { bold: true, color: { rgb: COLORS.green } },
    });
  }
  draftConsole['!rows'] = Array.from({ length: CONSOLE_LAST_ROW }, (_, index) => ({ hpt: index === 0 ? 28 : index === 1 || index === 6 ? 30 : 20 }));
  XLSX.utils.book_append_sheet(workbook, draftConsole, 'Draft Ledger');

  commissionerConsole.A1 = { t: 's', v: 'NOMINATION LIST — LIVE AUCTION' };
  commissionerConsole.A2 = { t: 's', v: 'Choose the Player, select Drafted By, enter the Final Bid, then choose YES under Submit Pick. This is the same draft-day flow as the 2025 workbook.' };
  commissionerConsole.A4 = { t: 's', v: 'ON THE BLOCK' };
  commissionerConsole.A5 = { t: 's', v: 'PLAYER' };
  commissionerConsole.D5 = { t: 's', v: 'POS / NFL' };
  commissionerConsole.G5 = { t: 's', v: 'WINNING TEAM / MAX BID' };
  commissionerConsole.J5 = { t: 's', v: 'PRICE' };
  commissionerConsole.L5 = { t: 's', v: 'STATUS' };
  commissionerConsole.A7 = { t: 's', v: 'HOW TO' };
  commissionerConsole.B7 = { t: 's', v: '1. Search player  →  2. Select team  →  3. Enter price  →  4. Submit YES. To undo the latest local pick, clear its Submit cell.' };
  ['NOMINATION', 'PLAYER', 'PLAYER ID', 'PLAYER NAME', 'POSITION', 'NFL TEAM', 'DRAFTED BY', 'TEAM ID', 'FINAL BID', 'SUBMIT PICK', 'STATUS', 'ROSTER SLOT', 'BUDGET REMAINING', 'CHECK']
    .forEach((header, index) => {
      commissionerConsole[`${XLSX.utils.encode_col(index)}8`] = { t: 's', v: header };
    });

  const nominatedChoice = playerRows.find(row => row[0] === nominatedPlayerId)?.[7] || '';
  for (let index = 0; index < futurePickCount; index += 1) {
    const row = entryFirstRow + index;
    const pick = soldRows.length + index + 1;
    const ledgerRow = CONSOLE_FIRST_ROW + pick - 1;
    const isCurrentNomination = index === 0 && nominatedPlayerId;
    const playerId = isCurrentNomination ? nominatedPlayerId : '';
    const player = players[playerId] || {};
    commissionerConsole[`A${row}`] = { t: 'n', v: pick };
    if (isCurrentNomination) commissionerConsole[`B${row}`] = { t: 's', v: nominatedChoice };
    formulaCell(commissionerConsole, `C${row}`, `IFERROR(INDEX('Player Data'!$A$2:$A$${playerEndRow},MATCH($B${row},'Player Data'!$H$2:$H$${playerEndRow},0)),"")`, playerId);
    formulaCell(commissionerConsole, `D${row}`, `IFERROR(INDEX('Player Data'!$B$2:$B$${playerEndRow},MATCH($C${row},'Player Data'!$A$2:$A$${playerEndRow},0)),"")`, player.name || '');
    formulaCell(commissionerConsole, `E${row}`, `IFERROR(INDEX('Player Data'!$C$2:$C$${playerEndRow},MATCH($C${row},'Player Data'!$A$2:$A$${playerEndRow},0)),"")`, player.position || '');
    formulaCell(commissionerConsole, `F${row}`, `IFERROR(INDEX('Player Data'!$D$2:$D$${playerEndRow},MATCH($C${row},'Player Data'!$A$2:$A$${playerEndRow},0)),"")`, player.nflTeam || '');
    formulaCell(commissionerConsole, `H${row}`, `IFERROR(INDEX('Team Data'!$A$2:$A$${teamEndRow},MATCH($G${row},'Team Data'!$F$2:$F$${teamEndRow},0)),"")`, '');
    formulaCell(commissionerConsole, `K${row}`, `IFERROR('Draft Ledger'!$K$${ledgerRow},"")`, isCurrentNomination ? 'ON BLOCK' : '');
    formulaCell(commissionerConsole, `L${row}`, `IFERROR('Draft Ledger'!$J$${ledgerRow},"")`, '');
    formulaCell(commissionerConsole, `M${row}`, `IFERROR('Draft Ledger'!$L$${ledgerRow},"")`, '');
    formulaCell(commissionerConsole, `N${row}`, `IFERROR('Draft Ledger'!$M$${ledgerRow},"")`, isCurrentNomination ? 'READY / ON BLOCK' : '');
  }

  const firstOpenOffset = `COUNTIF($K$${entryFirstRow}:$K$${entryLastRow},"SOLD")+1`;
  formulaCell(commissionerConsole, 'B5', `IFERROR(INDEX($D$${entryFirstRow}:$D$${entryLastRow},${firstOpenOffset}),"Draft complete")`, players[nominatedPlayerId]?.name || 'Choose a player below');
  formulaCell(commissionerConsole, 'E5', `IFERROR(INDEX($E$${entryFirstRow}:$E$${entryLastRow},${firstOpenOffset})&" · "&INDEX($F$${entryFirstRow}:$F$${entryLastRow},${firstOpenOffset}),"")`, nominatedPlayerId ? `${players[nominatedPlayerId]?.position || ''} · ${players[nominatedPlayerId]?.nflTeam || ''}` : '');
  const activeTeamId = `INDEX($H$${entryFirstRow}:$H$${entryLastRow},${firstOpenOffset})`;
  const activeTeamMatch = `MATCH(${activeTeamId},'Draft Ledger'!$O$${CONSOLE_FIRST_ROW}:$O$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},0)`;
  const activeTeamBudget = `INDEX('Draft Ledger'!$P$${CONSOLE_FIRST_ROW}:$P$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},${activeTeamMatch})`;
  const activeTeamRoster = `INDEX('Draft Ledger'!$Q$${CONSOLE_FIRST_ROW}:$Q$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},${activeTeamMatch})`;
  formulaCell(commissionerConsole, 'H5', `IFERROR(INDEX($G$${entryFirstRow}:$G$${entryLastRow},${firstOpenOffset})&" · MAX $"&MAX(0,${activeTeamBudget}-MAX(0,${TOTAL_DRAFT_SLOTS}-${activeTeamRoster}-1)),"")`, '');
  formulaCell(commissionerConsole, 'K5', `IFERROR(INDEX($I$${entryFirstRow}:$I$${entryLastRow},${firstOpenOffset}),"")`, '');
  formulaCell(commissionerConsole, 'M5', `IFERROR(INDEX($K$${entryFirstRow}:$K$${entryLastRow},${firstOpenOffset})&" · "&INDEX($N$${entryFirstRow}:$N$${entryLastRow},${firstOpenOffset}),"")`, nominatedPlayerId ? 'ON BLOCK · READY / ON BLOCK' : '');

  playerRows.forEach((row, index) => { commissionerConsole[`X${index + 2}`] = { t: 's', v: row[7] }; });
  teamRows.forEach((row, index) => { commissionerConsole[`Y${index + 2}`] = { t: 's', v: row[5] }; });
  commissionerConsole.Z1 = { t: 's', v: 'YES' };
  commissionerConsole['!ref'] = `A1:Z${Math.max(entryLastRow, playerRows.length + 1)}`;
  commissionerConsole['!cols'] = [
    { wch: 8 }, { wch: 48 }, { wch: 3, hidden: true }, { wch: 25 }, { wch: 8 }, { wch: 8 },
    { wch: 42 }, { wch: 3, hidden: true }, { wch: 11 }, { wch: 14 }, { wch: 13 }, { wch: 10 },
    { wch: 16 }, { wch: 23 },
    ...Array.from({ length: 9 }, () => ({ wch: 3, hidden: true })),
    { wch: 3, hidden: true }, { wch: 3, hidden: true }, { wch: 3, hidden: true },
  ];
  commissionerConsole['!merges'] = [
    XLSX.utils.decode_range('A1:N1'), XLSX.utils.decode_range('A2:N2'),
    XLSX.utils.decode_range('A4:N4'), XLSX.utils.decode_range('B7:N7'),
    XLSX.utils.decode_range('B5:C5'), XLSX.utils.decode_range('E5:F5'),
    XLSX.utils.decode_range('H5:I5'), XLSX.utils.decode_range('M5:N5'),
  ];
  commissionerConsole['!freeze'] = { xSplit: 0, ySplit: 8 };
  commissionerConsole['!autofilter'] = { ref: `A8:N${entryLastRow}` };
  setNumberFormat(commissionerConsole, `I${entryFirstRow}:I${entryLastRow}`, '$#,##0');
  setNumberFormat(commissionerConsole, `M${entryFirstRow}:M${entryLastRow}`, '$#,##0');
  setNumberFormat(commissionerConsole, 'K5:K5', '$#,##0');
  styleRange(commissionerConsole, 'A1:N1', bandStyle(COLORS.templateGreen, COLORS.white, 18));
  styleRange(commissionerConsole, 'A2:N2', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.tealLight } }, font: { italic: true, color: { rgb: COLORS.navy } }, alignment: { wrapText: true } });
  styleRange(commissionerConsole, 'A4:N4', bandStyle(COLORS.green, COLORS.white, 14));
  styleRange(commissionerConsole, 'A5:N5', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.greenLight } }, border: thinBorder, alignment: { vertical: 'center' } });
  ['A5', 'D5', 'G5', 'J5', 'L5'].forEach(address => styleRange(commissionerConsole, address, { font: { bold: true, color: { rgb: COLORS.green } } }));
  styleRange(commissionerConsole, 'A7:A7', bandStyle(COLORS.gold, COLORS.navy));
  styleRange(commissionerConsole, 'B7:N7', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.goldLight } }, font: { italic: true, color: { rgb: COLORS.navy } }, alignment: { wrapText: true } });
  styleRange(commissionerConsole, 'A8:N8', { ...bandStyle(COLORS.templateGreen), border: thinBorder, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } });
  styleRange(commissionerConsole, `A${entryFirstRow}:N${entryLastRow}`, { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, border: thinBorder, alignment: { vertical: 'center' } });
  ['B', 'G', 'I', 'J'].forEach(column => styleRange(commissionerConsole, `${column}${entryFirstRow}:${column}${entryLastRow}`, { fill: { patternType: 'solid', fgColor: { rgb: COLORS.templateYellow } }, border: thinBorder }));
  commissionerConsole['!rows'] = Array.from({ length: entryLastRow }, (_, index) => ({ hpt: index === 0 ? 30 : index === 1 ? 34 : index === 3 ? 24 : index === 4 ? 28 : index === 6 ? 30 : 20 }));

  const teamsGrid = XLSX.utils.aoa_to_sheet(Array.from({ length: 99 }, () => Array(17).fill('')));
  teamsGrid['!cols'] = [
    { wch: 10 }, { wch: 27 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 3 },
    { wch: 10 }, { wch: 27 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 3 },
    { wch: 10 }, { wch: 27 }, { wch: 10 }, { wch: 8 }, { wch: 8 },
  ];
  teamsGrid['!merges'] = [];

  teamsGrid.A1 = { t: 's', v: 'Min Bid' };
  teamsGrid.B1 = { t: 'n', v: 1, z: '$#,##0' };
  teamsGrid.A2 = { t: 's', v: 'Total Roster Size' };
  teamsGrid.B2 = { t: 'n', v: TOTAL_DRAFT_SLOTS };
  ['Team Name / Owner', 'Total Budget', 'Total Players Drafted', 'Total Spent', 'Budget Remaining', 'Players to be drafted', 'Max Bid']
    .forEach((header, index) => { teamsGrid[`${XLSX.utils.encode_col(index)}4`] = { t: 's', v: header }; });

  data.teamIds.forEach((teamId, index) => {
    const row = index + 5;
    const team = teams[teamId];
    teamsGrid[`A${row}`] = { t: 's', v: `${team.name || teamId}\n${team.ownerName || ''}` };
    teamsGrid[`B${row}`] = { t: 'n', v: startingBudgets[teamId], z: '$#,##0' };
    formulaCell(teamsGrid, `C${row}`, `IFERROR(INDEX('Draft Ledger'!$Q$${CONSOLE_FIRST_ROW}:$Q$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},MATCH("${quoted(teamId)}",'Draft Ledger'!$O$${CONSOLE_FIRST_ROW}:$O$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},0)),0)`, rosterEntries(team).length);
    formulaCell(teamsGrid, `E${row}`, `IFERROR(INDEX('Draft Ledger'!$P$${CONSOLE_FIRST_ROW}:$P$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},MATCH("${quoted(teamId)}",'Draft Ledger'!$O$${CONSOLE_FIRST_ROW}:$O$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},0)),B${row})`, safeNumber(team.budgetRemaining, startingBudgets[teamId]));
    formulaCell(teamsGrid, `D${row}`, `B${row}-E${row}`, startingBudgets[teamId] - safeNumber(team.budgetRemaining, startingBudgets[teamId]));
    formulaCell(teamsGrid, `F${row}`, `MAX(0,$B$2-C${row})`, Math.max(0, TOTAL_DRAFT_SLOTS - rosterEntries(team).length));
    formulaCell(teamsGrid, `G${row}`, `MAX(0,E${row}-MAX(0,F${row}-1)*$B$1)`, Math.max(0, safeNumber(team.budgetRemaining, startingBudgets[teamId]) - Math.max(0, TOTAL_DRAFT_SLOTS - rosterEntries(team).length - 1)));
  });
  styleRange(teamsGrid, 'A1:A2', { font: { bold: true } });
  styleRange(teamsGrid, 'B1:B2', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.templateYellow } }, border: thinBorder });
  styleRange(teamsGrid, 'A4:G4', { font: { bold: true }, border: thinBorder, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } });
  styleRange(teamsGrid, `A5:G${data.teamIds.length + 4}`, { border: thinBorder, alignment: { vertical: 'center', wrapText: true } });
  styleRange(teamsGrid, `A5:B${data.teamIds.length + 4}`, { fill: { patternType: 'solid', fgColor: { rgb: COLORS.templateYellow } } });
  setNumberFormat(teamsGrid, `B5:B${data.teamIds.length + 4}`, '$#,##0');
  setNumberFormat(teamsGrid, `D5:E${data.teamIds.length + 4}`, '$#,##0');
  setNumberFormat(teamsGrid, `G5:G${data.teamIds.length + 4}`, '$#,##0');

  data.teamIds.forEach((teamId, teamIndex) => {
    const team = teams[teamId];
    const startColumn = (teamIndex % 3) * 6;
    const startRow = 19 + Math.floor(teamIndex / 3) * 20;
    const headerRow = startRow + 1;
    const ownerRow = startRow + 2;
    const columnsRow = startRow + 3;
    const firstColumn = XLSX.utils.encode_col(startColumn);
    const lastColumn = XLSX.utils.encode_col(startColumn + 4);
    teamsGrid['!merges'].push(XLSX.utils.decode_range(`${firstColumn}${headerRow}:${lastColumn}${headerRow}`));
    teamsGrid['!merges'].push(XLSX.utils.decode_range(`${firstColumn}${ownerRow}:${lastColumn}${ownerRow}`));
    teamsGrid[`${firstColumn}${headerRow}`] = { t: 's', v: `${team.name || teamId}` };
    teamsGrid[`${firstColumn}${ownerRow}`] = { t: 's', v: `${team.ownerName || ''}  ·  ${teamId}` };
    ['SLOT', 'PLAYER', 'PAID', 'POS', 'NFL'].forEach((header, offset) => {
      teamsGrid[`${XLSX.utils.encode_col(startColumn + offset)}${columnsRow}`] = { t: 's', v: header };
    });

    const rosterBySlot = {};
    soldRows.filter(sale => sale.teamId === teamId).forEach(sale => {
      const sourcePlayer = players[sale.playerId] || {};
      const player = {
        playerName: sourcePlayer.name || teams[teamId]?.roster?.[sale.playerId]?.playerName || '',
        position: sourcePlayer.position || '',
        nflTeam: sourcePlayer.nflTeam || '',
        pricePaid: sale.pricePaid,
      };
      const slot = sale.slotType || 'BN';
      if (!rosterBySlot[slot]) rosterBySlot[slot] = [];
      rosterBySlot[slot].push(player);
    });

    let outputRow = columnsRow + 1;
    DISPLAY_SLOTS.forEach(display => {
      if (display.section) {
        teamsGrid['!merges'].push(XLSX.utils.decode_range(`${firstColumn}${outputRow}:${lastColumn}${outputRow}`));
        teamsGrid[`${firstColumn}${outputRow}`] = { t: 's', v: display.section };
        outputRow += 1;
        return;
      }

      const player = rosterBySlot[display.slot]?.[display.occurrence - 1] || {};
      teamsGrid[`${firstColumn}${outputRow}`] = { t: 's', v: display.label };
      const sourceColumns = ['D', 'I', 'E', 'F'];
      const cached = [player.playerName || '', player.pricePaid ?? '', player.position || '', player.nflTeam || ''];
      sourceColumns.forEach((sourceColumn, offset) => {
        formulaCell(
          teamsGrid,
          `${XLSX.utils.encode_col(startColumn + offset + 1)}${outputRow}`,
          `IFERROR(INDEX('Draft Ledger'!$${sourceColumn}$${CONSOLE_FIRST_ROW}:$${sourceColumn}$${CONSOLE_LAST_ROW},MATCH("${quoted(teamId)}|${display.slot}|${display.occurrence}",'Draft Ledger'!$N$${CONSOLE_FIRST_ROW}:$N$${CONSOLE_LAST_ROW},0)),"")`,
          cached[offset],
        );
      });
      outputRow += 1;
    });

    teamsGrid['!merges'].push(XLSX.utils.decode_range(`${firstColumn}${outputRow}:${XLSX.utils.encode_col(startColumn + 3)}${outputRow}`));
    teamsGrid[`${firstColumn}${outputRow}`] = { t: 's', v: 'BUDGET REMAINING' };
    formulaCell(
      teamsGrid,
      `${lastColumn}${outputRow}`,
      `IFERROR(INDEX('Draft Ledger'!$P$${CONSOLE_FIRST_ROW}:$P$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},MATCH("${quoted(teamId)}",'Draft Ledger'!$O$${CONSOLE_FIRST_ROW}:$O$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},0)),${startingBudgets[teamId]})`,
      '',
    );
    teamsGrid[`${lastColumn}${outputRow}`].z = '$#,##0';

    const cardRange = `${firstColumn}${headerRow}:${lastColumn}${outputRow}`;
    styleRange(teamsGrid, cardRange, { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, border: thinBorder, alignment: { vertical: 'center' } });
    styleRange(teamsGrid, `${firstColumn}${headerRow}:${lastColumn}${headerRow}`, { ...bandStyle(COLORS.navy, COLORS.white, 15), border: thinBorder });
    styleRange(teamsGrid, `${firstColumn}${ownerRow}:${lastColumn}${ownerRow}`, { ...bandStyle(COLORS.teal, COLORS.white, 10), border: thinBorder });
    styleRange(teamsGrid, `${firstColumn}${columnsRow}:${lastColumn}${columnsRow}`, { ...bandStyle(COLORS.gray, COLORS.navy, 10), border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } });
    [columnsRow + 1, columnsRow + 10].forEach(sectionRow => styleRange(
      teamsGrid,
      `${firstColumn}${sectionRow}:${lastColumn}${sectionRow}`,
      { ...bandStyle(COLORS.tealLight, COLORS.navy, 10), border: thinBorder },
    ));
    styleRange(teamsGrid, `${firstColumn}${outputRow}:${lastColumn}${outputRow}`, { ...bandStyle(COLORS.green, COLORS.white, 12), border: thinBorder });
  });
  teamsGrid['!rows'] = Array.from({ length: 99 }, (_, index) => ({ hpt: index < 18 ? (index === 3 ? 34 : 21) : index % 20 === 18 ? 9 : index % 20 === 19 ? 24 : 19 }));
  teamsGrid['!freeze'] = { xSplit: 0, ySplit: 0 };
  XLSX.utils.book_append_sheet(workbook, teamsGrid, 'Teams');

  const remainingPool = XLSX.utils.aoa_to_sheet([
    ['BEST PLAYER AVAILABLE — SEARCHABLE LIVE PLAYER POOL', '', '', '', '', '', '', ''],
    ['Open the PLAYER filter and type into its Search box. Filter LIVE STATUS to AVAILABLE, then select that player on Nomination List.', '', '', '', '', '', '', ''],
    ['SEARCH TOOL', 'Use the filter arrow in the PLAYER header below', '', '', '', '', '', ''],
    [''],
    ['PLAYER ID', 'PLAYER', 'POS', 'NFL', 'OVERALL RANK', 'POS RANK', 'PROJECTED $', 'LIVE STATUS'],
    ...playerRows.map(row => [...row.slice(0, 7), '']),
  ]);
  remainingPool['!cols'] = [{ wch: 18 }, { wch: 31 }, { wch: 9 }, { wch: 9 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
  remainingPool['!merges'] = [XLSX.utils.decode_range('A1:H1'), XLSX.utils.decode_range('A2:H2')];
  remainingPool['!freeze'] = { xSplit: 0, ySplit: 5 };
  remainingPool['!autofilter'] = { ref: `A5:H${playerRows.length + 5}` };
  const consolePlayerIds = new Set(soldRows.map(sale => sale.playerId));
  if (nominatedPlayerId) consolePlayerIds.add(nominatedPlayerId);
  playerRows.forEach((playerRow, index) => {
    const row = index + 6;
    const cachedStatus = consolePlayerIds.has(playerRow[0])
      ? (playerRow[0] === nominatedPlayerId ? 'ON BLOCK' : 'DRAFTED')
      : 'AVAILABLE';
    formulaCell(
      remainingPool,
      `H${row}`,
      `IF(COUNTIFS('Draft Ledger'!$C$${CONSOLE_FIRST_ROW}:$C$${CONSOLE_LAST_ROW},A${row},'Draft Ledger'!$K$${CONSOLE_FIRST_ROW}:$K$${CONSOLE_LAST_ROW},"SOLD")>0,"DRAFTED",IF(COUNTIF('Draft Ledger'!$C$${CONSOLE_FIRST_ROW}:$C$${CONSOLE_LAST_ROW},A${row})>0,"ON BLOCK","AVAILABLE"))`,
      cachedStatus,
    );
  });
  remainingPool['!ref'] = `A1:H${Math.max(6, playerRows.length + 5)}`;
  styleRange(remainingPool, 'A1:H1', bandStyle(COLORS.templateBlue, COLORS.white, 18));
  styleRange(remainingPool, 'A2:H2', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.tealLight } }, font: { italic: true, color: { rgb: COLORS.navy } }, alignment: { wrapText: true, vertical: 'center' } });
  styleRange(remainingPool, 'A3:A3', bandStyle(COLORS.gold, COLORS.navy));
  styleRange(remainingPool, 'B3:H3', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.goldLight } }, border: thinBorder });
  styleRange(remainingPool, 'A5:H5', { ...bandStyle(COLORS.teal), border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } });
  styleRange(remainingPool, `A6:H${playerRows.length + 5}`, { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, border: thinBorder, alignment: { vertical: 'center' } }, { createCells: false });
  remainingPool['!rows'] = [{ hpt: 28 }, { hpt: 32 }, { hpt: 24 }, { hpt: 8 }, { hpt: 22 }];
  XLSX.utils.book_append_sheet(workbook, remainingPool, 'Best Player Avail.');

  const draftLog = XLSX.utils.aoa_to_sheet([
    ['LIVE DRAFT LOG', '', '', '', '', '', '', '', ''],
    ['Rows update from Nomination List whenever Submit Pick is YES and the entry passes validation.', '', '', '', '', '', '', '', ''],
    [''],
    ['PICK', 'PLAYER', 'POS', 'NFL', 'FANTASY TEAM', 'OWNER', 'BID', 'SLOT', 'STATUS'],
  ]);
  draftLog['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 8 }, { wch: 8 }, { wch: 31 }, { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  draftLog['!merges'] = [XLSX.utils.decode_range('A1:I1'), XLSX.utils.decode_range('A2:I2')];
  draftLog['!freeze'] = { xSplit: 0, ySplit: 4 };
  const initialLogByPick = new Map(data.logRows.map(row => [row[0], row]));
  for (let pick = 1; pick <= MAX_DRAFT_PICKS; pick += 1) {
    const outputRow = pick + 4;
    const consoleRow = CONSOLE_FIRST_ROW + pick - 1;
    const initial = initialLogByPick.get(pick) || [];
    const mappings = [
      ['A', 'A', initial[0] ?? ''], ['B', 'D', initial[3] ?? ''], ['C', 'E', initial[4] ?? ''],
      ['D', 'F', initial[5] ?? ''], ['E', 'H', initial[7] ?? ''], ['G', 'I', initial[9] ?? ''],
      ['H', 'J', initial[10] ?? ''], ['I', 'K', initial.length ? 'SOLD' : ''],
    ];
    mappings.forEach(([targetColumn, sourceColumn, cached]) => {
      formulaCell(draftLog, `${targetColumn}${outputRow}`, `IF('Draft Ledger'!$K$${consoleRow}="SOLD",'Draft Ledger'!$${sourceColumn}$${consoleRow},"")`, cached);
    });
    formulaCell(draftLog, `F${outputRow}`, `IF($E${outputRow}="","",IFERROR(INDEX('Team Data'!$D$2:$D$${teamEndRow},MATCH('Draft Ledger'!$G$${consoleRow},'Team Data'!$A$2:$A$${teamEndRow},0)),""))`, teams[initial[6]]?.ownerName || '');
  }
  setNumberFormat(draftLog, `G5:G${MAX_DRAFT_PICKS + 4}`, '$#,##0');
  draftLog['!ref'] = `A1:I${MAX_DRAFT_PICKS + 4}`;
  styleRange(draftLog, 'A1:I1', bandStyle(COLORS.navy, COLORS.white, 18));
  styleRange(draftLog, 'A2:I2', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.tealLight } }, font: { italic: true, color: { rgb: COLORS.navy } }, alignment: { wrapText: true } });
  styleRange(draftLog, 'A4:I4', { ...bandStyle(COLORS.teal), border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } });
  styleRange(draftLog, `A5:I${MAX_DRAFT_PICKS + 4}`, { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, border: thinBorder, alignment: { vertical: 'center' } });
  XLSX.utils.book_append_sheet(workbook, draftLog, 'Draft Log');

  const savedAt = formatTimestamp(snapshot.savedAt);
  const overviewRows = [
    ['RECOVERY WORKBOOK STATUS', ''],
    ['League', snapshot.draft.leagueName || 'Draft'],
    ['Snapshot saved', savedAt || 'Timestamp unavailable in source file'],
    ['Imported picks', data.sales.length],
    ['Queued nomination', players[nominatedPlayerId]?.name || 'None'],
    ['Workbook capacity', MAX_DRAFT_PICKS],
    ['', ''],
    ['TEAM ID', 'TEAM', 'OWNER', 'STARTING BUDGET', 'LIVE BUDGET', 'LIVE ROSTER', 'MAX BID'],
  ];
  const overview = XLSX.utils.aoa_to_sheet(overviewRows);
  overview['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 24 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  overview['!freeze'] = { xSplit: 0, ySplit: 8 };
  teamRows.forEach((teamRow, index) => {
    const row = index + 9;
    const [teamId, , teamName, ownerName, startingBudget] = teamRow;
    overview[`A${row}`] = { t: 's', v: teamId };
    overview[`B${row}`] = { t: 's', v: teamName };
    overview[`C${row}`] = { t: 's', v: ownerName };
    overview[`D${row}`] = { t: 'n', v: startingBudget, z: '$#,##0' };
    formulaCell(overview, `E${row}`, `IFERROR(INDEX('Draft Ledger'!$P$${CONSOLE_FIRST_ROW}:$P$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},MATCH(A${row},'Draft Ledger'!$O$${CONSOLE_FIRST_ROW}:$O$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},0)),D${row})`, '');
    formulaCell(overview, `F${row}`, `IFERROR(INDEX('Draft Ledger'!$Q$${CONSOLE_FIRST_ROW}:$Q$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},MATCH(A${row},'Draft Ledger'!$O$${CONSOLE_FIRST_ROW}:$O$${CONSOLE_FIRST_ROW + data.teamIds.length - 1},0)),0)`, '');
    formulaCell(overview, `G${row}`, `MAX(0,E${row}-MAX(0,${TOTAL_DRAFT_SLOTS}-F${row}-1))`, '');
    overview[`E${row}`].z = '$#,##0';
    overview[`G${row}`].z = '$#,##0';
  });
  overview['!ref'] = `A1:G${Math.max(8, teamRows.length + 8)}`;
  styleRange(overview, 'A1:G1', bandStyle(COLORS.navy, COLORS.white, 18));
  styleRange(overview, 'A2:G6', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, border: thinBorder });
  styleRange(overview, 'A8:G8', { ...bandStyle(COLORS.teal), border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } });
  styleRange(overview, `A9:G${teamRows.length + 8}`, { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, border: thinBorder, alignment: { vertical: 'center' } });
  XLSX.utils.book_append_sheet(workbook, overview, 'Recovery Summary');

  const instructions = addSheet(workbook, 'Instructions', [
    ['HOW TO CONTINUE THE DRAFT OFFLINE', ''],
    ['1', 'Open Nomination List. In the first open row, type part of a player name in PLAYER SEARCH and choose the matching dropdown result.'],
    ['2', 'The player immediately becomes ON THE BLOCK. Choose the winning fantasy team from its dropdown.'],
    ['3', 'Enter the winning bid as a whole-dollar amount. CHECK will reject duplicates, unknown values, full rosters, and bids above the legal maximum.'],
    ['4', 'Choose YES in SUBMIT PICK. A valid row becomes SOLD and updates Teams, Best Player Avail., Draft Log, and all budgets.'],
    ['5', 'To undo the latest local spreadsheet pick, clear that row’s SUBMIT PICK cell. Clear PLAYER SEARCH to return the player to AVAILABLE.'],
    ['', ''],
    ['DESIGN REFERENCES', ''],
    ['RubeSheets auction tool', 'https://rubesheets.com/Footballv2.aspx'],
    ['r/fantasyfootball auction spreadsheet discussion', 'https://www.reddit.com/r/fantasyfootball/comments/1em99zo/heres_an_auction_draft_spreadsheet_to_use_during/'],
    ['CSG fantasy football spreadsheets', 'https://www.reddit.com/r/fantasyfootball/comments/1vi45bv/csg_fantasy_football_spreadsheets_v140_2026/'],
    ['LiveDraftX auction workflow', 'https://www.livedraftx.com/guide/'],
  ], [34, 120], { freezeRows: 1, autoFilter: false });
  styleRange(instructions, 'A1:B1', bandStyle(COLORS.navy, COLORS.white, 18));
  styleRange(instructions, 'A2:A6', bandStyle(COLORS.teal, COLORS.white, 12));
  styleRange(instructions, 'B2:B6', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, alignment: { wrapText: true, vertical: 'center' } });
  styleRange(instructions, 'A8:B8', bandStyle(COLORS.green, COLORS.white, 12));
  styleRange(instructions, 'A9:B12', { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, border: thinBorder, alignment: { wrapText: true } });
  instructions['!rows'] = [{ hpt: 30 }, ...Array.from({ length: 5 }, () => ({ hpt: 34 }))];

  styleRange(playerData, `A1:H1`, { ...bandStyle(COLORS.teal), border: thinBorder });
  styleRange(playerData, `A2:H${playerEndRow}`, { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, border: thinBorder }, { createCells: false });
  styleRange(teamData, 'A1:F1', { ...bandStyle(COLORS.teal), border: thinBorder });
  styleRange(teamData, `A2:F${teamEndRow}`, { fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } }, border: thinBorder }, { createCells: false });

  const useDuringAuction = addSheet(workbook, 'Use during Auction ->', [['USE DURING AUCTION  →']], [42], { freezeRows: 0, autoFilter: false });
  styleRange(useDuringAuction, 'A1:A1', bandStyle(COLORS.templateGreen, COLORS.white, 16));

  const draftPrepSection = addSheet(workbook, 'Draft Prep Section->', [['DRAFT PREP / PUBLIC DATA  →']], [42], { freezeRows: 0, autoFilter: false });
  styleRange(draftPrepSection, 'A1:A1', bandStyle(COLORS.templateBlue, COLORS.white, 16));

  const targetList = addSheet(workbook, 'Target & DND List', [
    ['PRIVATE OWNER LISTS ARE NOT EXPORTED', ''],
    ['This commissioner recovery workbook intentionally excludes every owner’s targets, DND list, personal ranks, tiers, notes, and watchlist.', ''],
  ], [68, 16], { freezeRows: 0, autoFilter: false });
  styleRange(targetList, 'A1:B1', bandStyle(COLORS.templateRed, COLORS.white, 14));
  styleRange(targetList, 'A2:B2', { fill: { patternType: 'solid', fgColor: { rgb: 'FCE8E6' } }, alignment: { wrapText: true } });
  targetList['!merges'] = [XLSX.utils.decode_range('A1:B1'), XLSX.utils.decode_range('A2:B2')];
  targetList['!rows'] = [{ hpt: 26 }, { hpt: 42 }];

  const publicRankings = addSheet(workbook, 'Player Tiers & Rankings', [
    ['OVERALL RANK', 'PLAYER', 'POSITION', 'NFL TEAM', 'POSITION RANK', 'PROJECTED VALUE', 'LIVE STATUS'],
    ...playerRows.map(row => [row[4], row[1], row[2], row[3], row[5], row[6], players[row[0]]?.status || 'available']),
  ], [16, 30, 12, 12, 16, 18, 16]);
  styleRange(publicRankings, 'A1:G1', { ...bandStyle(COLORS.templateBlue), border: thinBorder });
  setNumberFormat(publicRankings, `F2:F${playerEndRow}`, '$#,##0');

  const auctionValues = addSheet(workbook, 'Player Auction Values', [
    ['PLAYER', 'POSITION', 'NFL TEAM', 'PROJECTED VALUE', 'OVERALL RANK', 'POSITION RANK'],
    ...playerRows.map(row => [row[1], row[2], row[3], row[6], row[4], row[5]]),
  ], [30, 12, 12, 18, 16, 16]);
  styleRange(auctionValues, 'A1:F1', { ...bandStyle(COLORS.templateGreen), border: thinBorder });
  setNumberFormat(auctionValues, `D2:D${playerEndRow}`, '$#,##0');

  const historicalBids = addSheet(workbook, 'Historical Bid by Position Rank', [
    ['PICK', 'PLAYER', 'POSITION', 'POSITION RANK', 'WINNING BID', 'DRAFTED BY'],
    ...data.logRows.map(row => [row[0], row[3], row[4], players[row[2]]?.positionalRank ?? '', row[9], row[7]]),
  ], [10, 30, 12, 16, 16, 34]);
  styleRange(historicalBids, 'A1:F1', { ...bandStyle(COLORS.templateRed), border: thinBorder });
  setNumberFormat(historicalBids, `E2:E${Math.max(2, data.logRows.length + 1)}`, '$#,##0');

  const calcDivider = addSheet(workbook, 'Calc Sheets. DO NOT TOUCH ->', [['CALC SHEETS. DO NOT TOUCH  →']], [44], { freezeRows: 0, autoFilter: false });
  styleRange(calcDivider, 'A1:A1', bandStyle(COLORS.templateRed, COLORS.white, 16));

  workbook.SheetNames = [
    'Instructions', 'Use during Auction ->', 'Nomination List', 'Best Player Avail.', 'Teams', 'Draft Log',
    'Recovery Summary', 'Draft Prep Section->', 'Target & DND List', 'Player Tiers & Rankings',
    'Player Auction Values', 'Historical Bid by Position Rank', 'Calc Sheets. DO NOT TOUCH ->',
    'Draft Ledger', 'Player Data', 'Team Data',
  ];

  workbook.Props = {
    Title: `${snapshot.draft.leagueName || 'Draft'} operational recovery workbook`,
    Subject: 'Macro-free local draft console generated from a commissioner JSON backup',
    Comments: 'Private owner rankings, tiers, notes, watchlists, and access records are intentionally excluded. Nomination List is the only draft-day input sheet.',
  };
  workbook.Workbook = {
    CalcPr: { calcMode: 'auto', fullCalcOnLoad: true, forceFullCalc: true },
    Sheets: workbook.SheetNames.map(name => ({ name, Hidden: ['Draft Ledger', 'Player Data', 'Team Data'].includes(name) ? 1 : 0 })),
  };
  return workbook;
}

export function recoveryWorkbookFilename(snapshot) {
  const league = String(snapshot?.draft?.leagueName || 'Draft')
    .trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'Draft';
  const date = new Date(safeNumber(snapshot?.savedAt, Date.now())).toISOString().slice(0, 10);
  const picks = activeSales(snapshot?.log).length;
  return `${league}-recovery-${picks}-picks-${date}.xlsx`;
}

function addCommissionerConsoleValidations(bytes, snapshot) {
  const files = unzipSync(bytes);
  const workbookPath = 'xl/workbook.xml';
  const relationshipsPath = 'xl/_rels/workbook.xml.rels';
  const workbookXml = strFromU8(files[workbookPath]);
  const relationshipsXml = strFromU8(files[relationshipsPath]);
  const sheetTag = workbookXml.match(/<sheet\b(?=[^>]*name="Nomination List")[^>]*>/)?.[0];
  const relationshipId = sheetTag?.match(/r:id="([^"]+)"/)?.[1];
  const relationshipTag = relationshipId
    ? relationshipsXml.match(new RegExp(`<Relationship\\b(?=[^>]*Id="${relationshipId}")[^>]*>`))?.[0]
    : null;
  const target = relationshipTag?.match(/Target="([^"]+)"/)?.[1];
  if (!target) throw new Error('Could not locate Nomination List worksheet XML.');
  const worksheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const soldCount = activeSales(snapshot?.log).length;
  const lastEntryRow = Math.max(9, 9 + MAX_DRAFT_PICKS - soldCount - 1);
  const playerLastRow = Object.keys(asRecord(snapshot?.players)).length + 1;
  const teamLastRow = orderedTeamIds(snapshot || {}).length + 1;
  const validations = [
    `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" promptTitle="Search player" prompt="Type part of a name, then choose the matching player." errorTitle="Choose a listed player" error="Use a player from the search dropdown." sqref="B9:B${lastEntryRow}"><formula1>$X$2:$X$${playerLastRow}</formula1></dataValidation>`,
    `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" promptTitle="Winning team" prompt="Choose the fantasy team that won the auction." errorTitle="Choose a listed team" error="Use a team from the dropdown." sqref="G9:G${lastEntryRow}"><formula1>$Y$2:$Y$${teamLastRow}</formula1></dataValidation>`,
    `<dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Whole-dollar bid" error="Enter a whole-dollar bid from 1 to 200. The CHECK column enforces the live maximum bid." sqref="I9:I${lastEntryRow}"><formula1>1</formula1><formula2>200</formula2></dataValidation>`,
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Submit pick" error="Choose YES to submit, or clear the cell to undo." sqref="J9:J${lastEntryRow}"><formula1>$Z$1</formula1></dataValidation>`,
  ];
  const validationXml = `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>`;
  const worksheetXml = strFromU8(files[worksheetPath]);
  // dataValidations must appear before ignoredErrors in the worksheet schema.
  // SheetJS emits ignoredErrors near the end of the document, so treating it as
  // an insertion boundary keeps Excel from rejecting the entire worksheet.
  const insertionPattern = /<(?:dataValidations|hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|drawing|legacyDrawing|ignoredErrors|tableParts|extLst)\b|<\/worksheet>/;
  const insertion = worksheetXml.search(insertionPattern);
  if (insertion < 0) throw new Error('Could not add Nomination List validations.');
  files[worksheetPath] = strToU8(`${worksheetXml.slice(0, insertion)}${validationXml}${worksheetXml.slice(insertion)}`);
  const calcPr = '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';
  const recalculatingWorkbookXml = /<calcPr\b[^>]*\/>/.test(workbookXml)
    ? workbookXml.replace(/<calcPr\b[^>]*\/>/, calcPr)
    : workbookXml.replace('</workbook>', `${calcPr}</workbook>`);
  files[workbookPath] = strToU8(recalculatingWorkbookXml);
  return zipSync(files, { level: 6 });
}

export function recoveryWorkbookBytes(snapshot) {
  const workbook = buildRecoveryWorkbook(snapshot);
  const bytes = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true }));
  return addCommissionerConsoleValidations(bytes, snapshot);
}

export function downloadRecoveryWorkbook(snapshot) {
  const blob = new Blob([recoveryWorkbookBytes(snapshot)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = recoveryWorkbookFilename(snapshot);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
