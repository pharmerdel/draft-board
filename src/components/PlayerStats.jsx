// Shared stat display used by PlayerCard (modal) and NominationOverlay (inline)
import { useState, useEffect } from 'react';
import { getPlayerData, fmt, fmtPts } from '../utils/sleeperStats';
import './PlayerCard.css'; // reuses pc- classes

export function usePlayerStats(sleeperPlayerId) {
  const [stats, setStats] = useState(undefined);
  const [proj,  setProj]  = useState(undefined);

  useEffect(() => {
    if (!sleeperPlayerId) { setStats(null); setProj(null); return; }
    let cancelled = false;
    getPlayerData(sleeperPlayerId).then(({ stats, proj }) => {
      if (!cancelled) { setStats(stats); setProj(proj); }
    });
    return () => { cancelled = true; };
  }, [sleeperPlayerId]);

  return { stats, proj, loading: stats === undefined };
}

export function PlayerStatsBody({ stats, proj, pos }) {
  return (
    <>
      <div className="pc-section">
        <span className="pc-section-title">2026 Projected</span>
        {proj
          ? <StatGrid rows={projRows(proj, pos)} highlight />
          : <p className="pc-unavailable">Projections not available yet</p>
        }
      </div>
      <div className="pc-section">
        <span className="pc-section-title">2025 Season</span>
        {stats
          ? <StatGrid rows={statRows(stats, pos)} />
          : <p className="pc-unavailable">2025 stats unavailable</p>
        }
      </div>
    </>
  );
}

function StatGrid({ rows, highlight }) {
  return (
    <div className={`pc-stat-grid ${highlight ? 'highlight' : ''}`}>
      {rows.map(({ label, value }) => (
        <div key={label} className="pc-stat-cell">
          <span className="pc-stat-value">{value}</span>
          <span className="pc-stat-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function statRows(s, pos) {
  if (pos === 'QB') return [
    { label: 'Gms',      value: fmt(s.gp) },
    { label: 'Cmp/Att',  value: s.pass_cmp != null ? `${fmt(s.pass_cmp)}/${fmt(s.pass_att)}` : '—' },
    { label: 'Pass Yds', value: fmt(s.pass_yd) },
    { label: 'Pass TDs', value: fmt(s.pass_td) },
    { label: 'INTs',     value: fmt(s.pass_int) },
    { label: 'Rush Yds', value: fmt(s.rush_yd) },
    { label: 'Rush TDs', value: fmt(s.rush_td) },
    { label: 'Pts PPR',  value: fmtPts(s.pts_ppr) },
  ];
  if (pos === 'RB') return [
    { label: 'Gms',      value: fmt(s.gp) },
    { label: 'Carries',  value: fmt(s.rush_att) },
    { label: 'Rush Yds', value: fmt(s.rush_yd) },
    { label: 'Rush TDs', value: fmt(s.rush_td) },
    { label: 'Targets',  value: fmt(s.rec_tgt) },
    { label: 'Rec',      value: fmt(s.rec) },
    { label: 'Rec Yds',  value: fmt(s.rec_yd) },
    { label: 'Pts PPR',  value: fmtPts(s.pts_ppr) },
  ];
  return [
    { label: 'Gms',      value: fmt(s.gp) },
    { label: 'Targets',  value: fmt(s.rec_tgt) },
    { label: 'Rec',      value: fmt(s.rec) },
    { label: 'Rec Yds',  value: fmt(s.rec_yd) },
    { label: 'Rec TDs',  value: fmt(s.rec_td) },
    { label: 'YPR',      value: s.rec && s.rec_yd ? fmt(s.rec_yd / s.rec, 1) : '—' },
    { label: 'Rush Yds', value: fmt(s.rush_yd) },
    { label: 'Pts PPR',  value: fmtPts(s.pts_ppr) },
  ];
}

function projRows(p, pos) {
  if (pos === 'QB') return [
    { label: 'Pass Yds', value: fmt(p.pass_yd) },
    { label: 'Pass TDs', value: fmt(p.pass_td, 1) },
    { label: 'Rush Yds', value: fmt(p.rush_yd) },
    { label: 'Pts PPR',  value: fmtPts(p.pts_ppr) },
  ];
  if (pos === 'RB') return [
    { label: 'Rush Yds', value: fmt(p.rush_yd) },
    { label: 'Rush TDs', value: fmt(p.rush_td, 1) },
    { label: 'Rec',      value: fmt(p.rec, 1) },
    { label: 'Pts PPR',  value: fmtPts(p.pts_ppr) },
  ];
  return [
    { label: 'Targets',  value: fmt(p.rec_tgt, 1) },
    { label: 'Rec',      value: fmt(p.rec, 1) },
    { label: 'Rec Yds',  value: fmt(p.rec_yd) },
    { label: 'Pts PPR',  value: fmtPts(p.pts_ppr) },
  ];
}
