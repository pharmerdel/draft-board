import { useState, useEffect } from 'react';
import { usePlayerStats, PlayerStatsBody } from './PlayerStats';
import { fetchFantasyProsPlayerNewsFromApi } from '../utils/fantasyProsNews';
import './PlayerCard.css';

function injClass(status) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === 'questionable') return 'q';
  if (s === 'doubtful')     return 'd';
  if (s === 'out')          return 'out';
  if (s === 'ir')           return 'ir';
  if (s.startsWith('pup'))  return 'pup';
  return 'dnr';
}

function xSearchUrl(playerName) {
  const query = `"${playerName}"`;
  return `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query`;
}

function usePlayerNews(playerName) {
  const [news, setNews] = useState(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!playerName) { setNews([]); setError(false); return; }
    let cancelled = false;
    setNews(undefined);
    setError(false);
    fetchFantasyProsPlayerNewsFromApi(playerName, {
      fallbackToDirect: true,
      maxAgeDays: 30,
    }).then(articles => {
      if (!cancelled) {
        setNews(articles);
        setError(false);
      }
    }).catch(error => {
      console.error('[fantasypros-news] fetch error:', error);
      if (!cancelled) {
        setNews([]);
        setError(true);
      }
    });
    return () => { cancelled = true; };
  }, [playerName]);
  return { news, loading: news === undefined, error };
}

export default function PlayerCard({ player, onClose }) {
  const { stats, proj, loading } = usePlayerStats(player.sleeperPlayerId);
  const { news, loading: newsLoading, error: newsError } = usePlayerNews(player.name);
  const pos = player.position;

  return (
    <div className="pc-overlay" onClick={onClose}>
      <div className="pc-card" onClick={e => e.stopPropagation()}>

        <div className="pc-header">
          <div className="pc-headshot">
            {player.headshotUrl
              ? <img src={player.headshotUrl} alt={player.name} />
              : <div className="pc-headshot-sil">{pos}</div>
            }
          </div>
          <div className="pc-header-info">
            <div className="pc-header-top">
              <span className={`pc-pos-badge pos-${pos}`}>{pos}{player.positionalRank}</span>
              <span className="pc-rank">Overall #{player.overallRank}</span>
            </div>
            <h2 className="pc-name">{player.name}</h2>
            <span className="pc-team">{player.nflTeam}</span>
            {player.injuryStatus && (
              <span className={`pc-injury-row inj-${injClass(player.injuryStatus)}`}>
                ⚠ {player.injuryStatus}{player.injuryBodyPart ? ` · ${player.injuryBodyPart}` : ''}
              </span>
            )}
            {player.status === 'sold' && (
              <span className="pc-sold-badge">Sold ${player.soldPrice}</span>
            )}
          </div>
          <button className="pc-close" onClick={onClose}>✕</button>
        </div>

        <div className="pc-body">
          {loading
            ? <p className="pc-loading">Loading stats…</p>
            : <PlayerStatsBody stats={stats} proj={proj} pos={pos} />
          }
          <div className="pc-section">
            <div className="pc-section-header">
              <span className="pc-section-title">Recent News</span>
              <a
                className="pc-x-link"
                href={xSearchUrl(player.name)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Search X for ${player.name}`}
                aria-label={`Search X for latest posts about ${player.name}`}
              >
                <span className="pc-x-mark">𝕏</span>
                <span>Search</span>
              </a>
            </div>
            {newsLoading ? (
              <p className="pc-loading">Loading news…</p>
            ) : newsError ? (
              <p className="pc-unavailable">News service unavailable. Use X Search for current updates.</p>
            ) : !news || news.length === 0 ? (
              <p className="pc-unavailable">No player-specific updates in the past 30 days.</p>
            ) : (
              news.map((a, i) => (
                <a
                  key={i}
                  className="pc-news-item"
                  href={a.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <p className="pc-news-headline">{a.headline}</p>
                  <span className="pc-news-meta">
                    {a.source || 'FantasyPros'}{a.author ? ` · ${a.author}` : ''}{a.timestamp ? ` · ${a.timestamp}` : ''}
                  </span>
                  {a.news && <p className="pc-news-desc">{a.news}</p>}
                  {a.fantasyImpact && (
                    <p className="pc-news-impact">
                      <span>Fantasy Impact</span>
                      {a.fantasyImpact}
                    </p>
                  )}
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
