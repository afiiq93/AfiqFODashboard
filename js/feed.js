// Live news feed — fetches RSS/Atom feeds through free CORS proxies and parses
// them in the browser (no backend, no API key). Default feeds use Google News
// search queries, which are reliable and aggregate many sources.

const LS_FEEDS = 'afo:feeds';

export const DEFAULT_FEEDS = [
  { name: 'Marine fuel & bunkers', url: 'https://news.google.com/rss/search?q=(marine+fuel+OR+bunker+OR+VLSFO+OR+HSFO+OR+gasoil)+when:7d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Crude & OPEC', url: 'https://news.google.com/rss/search?q=(crude+oil+OR+Brent+OR+OPEC)+when:3d&hl=en-US&gl=US&ceid=US:en' },
];

// Tried in order until one returns the feed. Free, public, CORS-enabled.
const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
];

export function getFeeds() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_FEEDS) || 'null');
    return Array.isArray(v) && v.length ? v : DEFAULT_FEEDS;
  } catch { return DEFAULT_FEEDS; }
}
export function setFeeds(list) { localStorage.setItem(LS_FEEDS, JSON.stringify(list)); }

function stripHtml(s) {
  const d = document.createElement('div');
  d.innerHTML = s || '';
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

async function fetchRaw(feedUrl) {
  let lastErr;
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(feedUrl), { headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' } });
      if (!res.ok) { lastErr = new Error(`${res.status}`); continue; }
      const text = await res.text();
      if (text && text.indexOf('<') !== -1) return text;
      lastErr = new Error('empty');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all proxies failed');
}

function parseFeed(xml, sourceName) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('parse error');
  const nodes = Array.from(doc.querySelectorAll('item, entry'));
  return nodes.map((n) => {
    const get = (sel) => n.querySelector(sel)?.textContent?.trim() || '';
    let link = get('link');
    if (!link) { const la = n.querySelector('link'); link = la?.getAttribute('href') || ''; }
    const desc = get('description') || get('summary') || get('content');
    // Google News titles come as "Headline - Source"; keep as-is.
    return {
      title: get('title') || '(untitled)',
      link,
      pubDate: get('pubDate') || get('published') || get('updated') || '',
      snippet: stripHtml(desc).slice(0, 320),
      source: get('source') || sourceName,
    };
  });
}

async function fetchOne(feed) {
  const xml = await fetchRaw(feed.url);
  return parseFeed(xml, feed.name || 'Feed');
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
  // de-dupe by link
  const seen = new Set();
  const unique = items.filter((it) => { const k = it.link || it.title; if (seen.has(k)) return false; seen.add(k); return true; });
  unique.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return { items: unique, errors };
}

export function relativeTime(dateStr) {
  const t = new Date(dateStr).getTime();
  if (!t) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
