// Live news feed — pulls RSS feeds via a free browser-friendly JSON converter
// (rss2json) so it works from the static site with no backend. Feed list and
// optional API key live in this browser's localStorage.

const LS_FEEDS = 'afo:feeds';
const LS_RSSKEY = 'afo:rss2json';

export const DEFAULT_FEEDS = [
  { name: 'OilPrice', url: 'https://oilprice.com/rss/main' },
  { name: 'Investing — Commodities', url: 'https://www.investing.com/rss/news_11.rss' },
];

export function getFeeds() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_FEEDS) || 'null');
    return Array.isArray(v) && v.length ? v : DEFAULT_FEEDS;
  } catch { return DEFAULT_FEEDS; }
}
export function setFeeds(list) { localStorage.setItem(LS_FEEDS, JSON.stringify(list)); }

export function getRssKey() { return localStorage.getItem(LS_RSSKEY) || ''; }
export function setRssKey(k) { if (k) localStorage.setItem(LS_RSSKEY, k.trim()); else localStorage.removeItem(LS_RSSKEY); }

function stripHtml(s) {
  const d = document.createElement('div');
  d.innerHTML = s || '';
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

async function fetchOne(feed) {
  const key = getRssKey();
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`
    + (key ? `&api_key=${encodeURIComponent(key)}` : '') + '&count=12';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(data.message || 'feed error');
  const source = feed.name || data.feed?.title || 'Feed';
  return (data.items || []).map((it) => ({
    title: it.title || '(untitled)',
    link: it.link || '',
    source,
    pubDate: it.pubDate || '',
    snippet: stripHtml(it.description || it.content || '').slice(0, 320),
  }));
}

// Fetch all feeds, merge newest-first, report which feeds failed.
export async function fetchFeeds() {
  const feeds = getFeeds();
  const results = await Promise.allSettled(feeds.map(fetchOne));
  const items = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else errors.push(feeds[i].name || feeds[i].url);
  });
  items.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return { items, errors };
}

export function relativeTime(dateStr) {
  const t = new Date(dateStr).getTime();
  if (!t) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
