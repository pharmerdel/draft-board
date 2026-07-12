const FANTASYPROS_BASE_URL = 'https://www.fantasypros.com';
const NEWS_API_BASE_URL = import.meta.env?.VITE_NEWS_API_BASE_URL || '';

const FANTASYPROS_SLUG_OVERRIDES = {
  'kenneth walker iii': 'kenneth-walker-rb',
};

export function fantasyProsSlugFromName(playerName) {
  const override = FANTASYPROS_SLUG_OVERRIDES[normalizeOverrideName(playerName)];
  if (override) return override;

  return (playerName || '')
    .toLowerCase()
    .replace(/\bst\.?\s+brown\b/g, 'stbrown')
    .replace(/\bamon-ra\b/g, 'amonra')
    .replace(/['.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function fantasyProsSlugCandidates(playerName) {
  const primary = fantasyProsSlugFromName(playerName);
  const withoutSuffix = fantasyProsSlugFromName(
    (playerName || '').replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '')
  );

  return [...new Set([primary, withoutSuffix].filter(Boolean))];
}

function normalizeOverrideName(playerName) {
  return (playerName || '')
    .toLowerCase()
    .replace(/[.'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fantasyProsNewsUrl(playerName, slugOverride) {
  const slug = slugOverride || fantasyProsSlugFromName(playerName);
  return `${FANTASYPROS_BASE_URL}/nfl/news/${slug}.php`;
}

function fantasyProsProxyUrl(playerName, slugOverride) {
  const slug = slugOverride || fantasyProsSlugFromName(playerName);
  return `/__fantasypros/nfl/news/${slug}.php`;
}

export async function fetchFantasyProsPlayerNews(playerName, options = {}) {
  if (!playerName) return [];

  const slugs = options.slug ? [options.slug] : fantasyProsSlugCandidates(playerName);
  const maxAgeDays = options.maxAgeDays;
  let lastError = null;

  for (const slug of slugs) {
    try {
      const result = await fetchFantasyProsSlug(playerName, slug, options);
      const filtered = filterAndSortNews(result, maxAgeDays);
      if (result.length) return filtered;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export async function fetchFantasyProsPlayerNewsFromApi(playerName, options = {}) {
  if (!playerName) return [];

  const apiUrl = fantasyProsNewsApiUrl(playerName, options);

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`FantasyPros news API request failed: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.articles) ? data.articles : [];
  } catch (error) {
    if (!options.fallbackToDirect) throw error;
    return fetchFantasyProsPlayerNews(playerName, {
      ...options,
      proxy: true,
    });
  }
}

export async function checkFantasyProsNewsHealth() {
  const response = await fetch(`${NEWS_API_BASE_URL}/api/news/health`);
  if (!response.ok) {
    throw new Error(`FantasyPros news health check failed: ${response.status}`);
  }
  return response.json();
}

function fantasyProsNewsApiUrl(playerName, options = {}) {
  const params = new URLSearchParams({ player: playerName });
  if (Number.isFinite(options.maxAgeDays)) {
    params.set('maxAgeDays', String(options.maxAgeDays));
  }

  return `${NEWS_API_BASE_URL}/api/fantasypros-news?${params.toString()}`;
}

async function fetchFantasyProsSlug(playerName, slug, options) {
  const url = fantasyProsNewsUrl(playerName, slug);
  const requestUrl = options.proxy ? fantasyProsProxyUrl(playerName, slug) : url;
  const requestOptions = typeof window === 'undefined'
    ? { headers: { 'user-agent': 'Mozilla/5.0' } }
    : undefined;
  const response = await fetch(requestUrl, requestOptions);

  if (!response.ok) {
    throw new Error(`FantasyPros news request failed: ${response.status}`);
  }

  const html = await response.text();
  if (!isPlayerNewsPage(response.url, options.proxy)) return [];

  const items = parseFantasyProsNewsHtml(html, url);
  const sourcePagePlayerName = extractPagePlayerName(html);

  return items.map(item => ({
    ...item,
    playerName,
    source: 'FantasyPros',
    sourcePageUrl: url,
    sourcePagePlayerName,
  }));
}

function isPlayerNewsPage(url, allowProxy = false) {
  try {
    const parsed = new URL(url);
    return /^\/nfl\/news\/[^/]+\.php$/.test(parsed.pathname) ||
      (allowProxy && /^\/__fantasypros\/nfl\/news\/[^/]+\.php$/.test(parsed.pathname));
  } catch {
    return false;
  }
}

export function parseFantasyProsNewsHtml(html, sourcePageUrl = FANTASYPROS_BASE_URL) {
  const items = [];
  const itemPattern = /<div class="subsection feature-stretch\s*">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="foot-row clearfix">([\s\S]*?)<\/div>/g;
  let match;

  while ((match = itemPattern.exec(html)) !== null) {
    const bodyHtml = match[1];
    const footerHtml = match[2];
    const titleMatch = bodyHtml.match(/<a href="([^"]+)"><b>([\s\S]*?)<\/b><\/a>/i);

    if (!titleMatch) continue;

    const paragraphs = Array.from(bodyHtml.matchAll(/<p>([\s\S]*?)<\/p>/gi))
      .map(p => cleanHtmlText(p[1]))
      .filter(Boolean);

    const impactIndex = paragraphs.findIndex(p => /^Fantasy Impact$/i.test(p));
    const news = impactIndex >= 0
      ? paragraphs.slice(0, impactIndex).join(' ')
      : (paragraphs[0] || '');
    const fantasyImpact = impactIndex >= 0
      ? paragraphs.slice(impactIndex + 1).join(' ')
      : '';

    const author = extractAuthor(footerHtml);
    const timestamp = cleanHtmlText(
      footerHtml.match(/<span class="pull-right timestamp">([\s\S]*?)<\/span>/i)?.[1] || ''
    );
    const publishedAt = parseFantasyProsTimestamp(timestamp);
    const ageDays = publishedAt ? Math.max(0, Math.floor((Date.now() - publishedAt.getTime()) / 86400000)) : null;

    items.push({
      headline: cleanHtmlText(titleMatch[2]),
      news,
      fantasyImpact,
      author,
      timestamp,
      publishedAt: publishedAt ? publishedAt.toISOString() : null,
      ageDays,
      url: absoluteUrl(titleMatch[1], sourcePageUrl),
    });
  }

  return items;
}

function filterAndSortNews(items, maxAgeDays) {
  const sorted = [...items].sort((a, b) => {
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bTime - aTime;
  });

  if (!Number.isFinite(maxAgeDays)) return sorted;
  return sorted.filter(item => item.ageDays != null && item.ageDays <= maxAgeDays);
}

export function parseFantasyProsTimestamp(timestamp, now = new Date()) {
  const value = (timestamp || '').trim();
  if (!value) return null;

  const relative = value.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const multipliers = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    };
    return new Date(now.getTime() - amount * multipliers[unit]);
  }

  const absolute = Date.parse(value);
  return Number.isNaN(absolute) ? null : new Date(absolute);
}

function extractAuthor(footerHtml) {
  const authorLink = footerHtml.match(/<a class="pull-left"[^>]*>([\s\S]*?)<\/a>/i);
  if (authorLink) return cleanHtmlText(authorLink[1]);

  const authorSpan = footerHtml.match(/<span class="pull-left">([\s\S]*?)<\/span>/i);
  if (authorSpan) return cleanHtmlText(authorSpan[1]);

  return '';
}

function extractPagePlayerName(html) {
  return cleanHtmlText(
    html.match(/fp-player-name="([^"]+)"/i)?.[1] ||
    html.match(/<h1 class="player-bio-header_bio-name[\s\S]*?>([\s\S]*?)<\/h1>/i)?.[1] ||
    ''
  );
}

function absoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

function cleanHtmlText(value = '') {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value = '') {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'");
}
