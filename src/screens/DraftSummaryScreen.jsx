import { useState } from 'react';
import { ref, set, remove } from 'firebase/database';
import { db } from '../firebase';
import { generateDraftCsv, downloadCsv } from '../utils/exportCsv';
import { exportDraftExcel } from '../utils/exportExcel';
import './DraftSummaryScreen.css';

const NEWS_WORKER = 'https://draft-board-news.zachdelaney2012.workers.dev';

const GRADE_COLORS = {
  'A+': '#059669', 'A': '#059669', 'A-': '#059669',
  'B+': '#2563EB', 'B': '#2563EB', 'B-': '#2563EB',
  'C+': '#D97706', 'C': '#D97706', 'C-': '#D97706',
  'D+': '#DC2626', 'D': '#DC2626', 'D-': '#DC2626',
  'F':  '#991B1B',
};

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

export default function DraftSummaryScreen({ draft, teams, players, log, isCommissioner }) {
  const [reviews, setReviews]       = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError]     = useState(null);

  const nominationOrderIds = draft?.nominationOrderIds || [];

  async function generateReviews() {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const teamsPayload = nominationOrderIds.map(teamId => {
        const team = teams[teamId];
        if (!team) return null;
        const rosterPlayers = Object.entries(team.roster || {}).map(([id, r]) => {
          const playerData = players[id] || {};
          const projectedValue = playerData.projectedValue ?? null;
          const delta = projectedValue != null ? projectedValue - (r.pricePaid || 0) : null;
          return {
            name:           r.playerName,
            position:       r.position,
            positionalRank: playerData.positionalRank ?? null,
            pricePaid:      r.pricePaid || 0,
            projectedValue,
            delta,
            slotType:       r.slotType,
          };
        });
        const totalSpent = rosterPlayers.reduce((s, p) => s + p.pricePaid, 0);
        return {
          name:            team.name,
          ownerName:       team.ownerName,
          budgetSpent:     totalSpent,
          budgetRemaining: team.budgetRemaining ?? 0,
          players:         rosterPlayers,
        };
      }).filter(Boolean);

      const res = await fetch(`${NEWS_WORKER}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teams: teamsPayload }),
      });

      if (!res.ok) throw new Error(`Worker error: ${res.status}`);
      const data = await res.json();
      const parsed = JSON.parse(data.review);
      setReviews(parsed);
    } catch (err) {
      console.error('[reviews] error:', err);
      setReviewError('Something went wrong generating reviews. Try again.');
    } finally {
      setReviewLoading(false);
    }
  }
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
              className="summary-export-btn ai-review"
              onClick={generateReviews}
              disabled={reviewLoading}
            >
              {reviewLoading ? '⏳ Generating…' : '🤖 AI Draft Reviews'}
            </button>
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

      {/* AI Reviews */}
      {reviewError && (
        <p className="review-error">{reviewError}</p>
      )}
      {reviews && (
        <div className="reviews-section">
          <h2 className="reviews-title">🤖 AI Draft Reviews</h2>
          <div className="reviews-grid">
            {reviews.map((r, i) => (
              <div key={i} className="review-card">
                <div className="review-card-header">
                  <div className="review-card-names">
                    <span className="review-team-name">{r.team}</span>
                    <span className="review-owner-name">{r.owner}</span>
                  </div>
                  <span
                    className="review-grade"
                    style={{ color: GRADE_COLORS[r.grade] || '#6B7280' }}
                  >
                    {r.grade}
                  </span>
                </div>
                <p className="review-text">{r.review}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
