import { ref, set, remove } from 'firebase/database';
import { db } from '../firebase';
import { generateDraftCsv, downloadCsv } from '../utils/exportCsv';
import { exportDraftExcel } from '../utils/exportExcel';
import './DraftSummaryScreen.css';

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];

function sortRosterBySlot(rosterEntries) {
  const grouped = {};
  SLOT_ORDER.forEach(s => { grouped[s] = []; });
  rosterEntries.forEach(([id, p]) => {
    const slot = p.slotType || 'BN';
    if (!grouped[slot]) grouped[slot] = [];
    grouped[slot].push({ id, ...p });
  });
  Object.values(grouped).forEach(arr =>
    arr.sort((a, b) => (b.pricePaid || 0) - (a.pricePaid || 0))
  );
  return SLOT_ORDER.flatMap(s => grouped[s] || []);
}

export default function DraftSummaryScreen({ draft, teams, log, isCommissioner }) {
  const nominationOrderIds = draft?.nominationOrderIds || [];
  const draftDate = draft?.startedAt
    ? new Date(draft.startedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const totalPicks = Object.values(log || {}).filter(e => e.type === 'sold').length;

  return (
    <div className="summary-screen">

      {/* Header */}
      <div className="summary-header">
        <h1 className="summary-title">{draft?.leagueName}</h1>
        <p className="summary-meta">
          {draftDate && `${draftDate} · `}{totalPicks} picks
        </p>

        {isCommissioner && (
          <div className="summary-export-btns">
            <button
              className="summary-export-btn excel"
              onClick={() => exportDraftExcel({ teams, log: log || {}, draft })}
            >
              ⬇ Export Excel
            </button>
            <button
              className="summary-export-btn csv"
              onClick={() => {
                const csv = generateDraftCsv(teams, nominationOrderIds);
                const date = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '-');
                downloadCsv(csv, `${(draft?.leagueName || 'draft').replace(/\s+/g, '-')}-results-${date}.csv`);
              }}
            >
              ⬇ Export CSV
            </button>
            <button
              className="summary-export-btn resume"
              onClick={async () => {
                if (window.confirm('Resume the draft? Everyone will return to the draft board.')) {
                  await set(ref(db, 'draft/status'), 'active');
                }
              }}
            >
              ↩ Resume Draft
            </button>
            <button
              className="summary-export-btn reset"
              onClick={async () => {
                if (window.confirm('Reset everything? This wipes all draft data and returns to Setup.')) {
                  await remove(ref(db, 'draft'));
                  await remove(ref(db, 'teams'));
                  await remove(ref(db, 'players'));
                  await remove(ref(db, 'log'));
                  localStorage.removeItem('ff_selected_team');
                  localStorage.removeItem('ff_draft_backup');
                }
              }}
            >
              🗑 Reset
            </button>
          </div>
        )}
      </div>

      {/* Team grid */}
      <div className="summary-grid">
        {nominationOrderIds.map((teamId, idx) => {
          const team = teams[teamId];
          if (!team) return null;
          const rosterEntries = Object.entries(team.roster || {});
          const sorted = sortRosterBySlot(rosterEntries);
          const totalSpent = sorted.reduce((sum, p) => sum + (p.pricePaid || 0), 0);
          const remaining = (team.budgetRemaining ?? 200);

          return (
            <div key={teamId} className="summary-team-card">
              <div className="summary-team-header">
                <div className="summary-team-names">
                  <span className="summary-team-name">{team.name}</span>
                  <span className="summary-team-owner">{team.ownerName}</span>
                </div>
                <div className="summary-team-budget">
                  <span className="summary-spent">${totalSpent} spent</span>
                  <span className="summary-remaining">${remaining} left</span>
                </div>
              </div>

              <table className="summary-roster-table">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>$</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(p => (
                    <tr key={p.id}>
                      <td className="slot-cell">{p.slotType}</td>
                      <td className="player-cell">{p.playerName}</td>
                      <td className={`pos-cell pos-${p.position}`}>{p.position}</td>
                      <td className="price-cell">${p.pricePaid}</td>
                    </tr>
                  ))}
                  {/* Empty slots */}
                  {Array.from({ length: Math.max(0, 13 - sorted.length) }).map((_, i) => (
                    <tr key={`empty-${i}`} className="empty-row">
                      <td colSpan={4}>— empty —</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
