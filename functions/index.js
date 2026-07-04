import { onRequest } from 'firebase-functions/v2/https';
import { fetchFantasyProsPlayerNews } from './fantasyProsNews.js';

const DEFAULT_MAX_AGE_DAYS = 30;
const MAX_ALLOWED_AGE_DAYS = 365;

export const newsHealth = onRequest({ cors: true, region: 'us-central1' }, (_request, response) => {
  response.status(200).json({
    ok: true,
    service: 'draft-board-news',
  });
});

export const fantasyProsNews = onRequest({ cors: true, region: 'us-central1' }, async (request, response) => {
  if (request.method !== 'GET') {
    response.set('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const playerName = String(request.query.player || '').trim();
  if (!playerName) {
    response.status(400).json({ error: 'Missing required player query parameter' });
    return;
  }

  if (playerName.length > 80) {
    response.status(400).json({ error: 'Player query parameter is too long' });
    return;
  }

  const maxAgeDays = normalizeMaxAgeDays(request.query.maxAgeDays);

  try {
    const articles = await fetchFantasyProsPlayerNews(playerName, { maxAgeDays });

    response.set('Cache-Control', 'public, max-age=300, s-maxage=900');
    response.status(200).json({
      playerName,
      maxAgeDays,
      source: 'FantasyPros',
      count: articles.length,
      articles,
    });
  } catch (error) {
    console.error('FantasyPros news lookup failed', {
      playerName,
      message: error.message,
    });
    response.status(502).json({
      error: 'FantasyPros news lookup failed',
    });
  }
});

function normalizeMaxAgeDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_AGE_DAYS;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_ALLOWED_AGE_DAYS);
}
