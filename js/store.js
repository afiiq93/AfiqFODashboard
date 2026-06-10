// Data layer: loads committed seed data, merges user edits (from cloud when
// connected, otherwise this browser's localStorage), computes differentials.

import {
  cloudEnabled, cloudGetRecords, cloudUpsertRecord,
  cloudGetNews, cloudUpsertNews, cloudDeleteNews,
} from './cloud.js';

export const PRODUCTS = [
  { code: 'MF05', name: 'Marine Fuel 0.5', unit: 'USD/mt', active: true, file: 'data/marine-fuel-05.json' },
  { code: 'GO10', name: 'Gasoil 10ppm',    unit: 'USD/mt', active: false },
  { code: 'HSFO', name: 'HSFO 380cst',     unit: 'USD/mt', active: false },
];

const LS_RECORDS = (code) => `afo:records:${code}`;
const LS_NEWS = 'afo:news';

const seedCache = {};

export function productByCode(code) {
  return PRODUCTS.find((p) => p.code === code);
}

async function loadSeed(code) {
  if (seedCache[code]) return seedCache[code];
  const p = productByCode(code);
  if (!p || !p.file) { seedCache[code] = { records: [] }; return seedCache[code]; }
  try {
    const res = await fetch(p.file, { cache: 'no-store' });
    seedCache[code] = res.ok ? await res.json() : { records: [] };
  } catch {
    seedCache[code] = { records: [] };
  }
  return seedCache[code];
}

function readLocal(code) {
  try { return JSON.parse(localStorage.getItem(LS_RECORDS(code)) || '{}'); }
  catch { return {}; }
}
function writeLocal(code, map) {
  localStorage.setItem(LS_RECORDS(code), JSON.stringify(map));
}

// Compute the three differentials the desk tracks.
export function withDiffs(r) {
  const num = (v) => (typeof v === 'number' ? v : null);
  const mops = num(r.mops), mocM = num(r.mocM), mocM1 = num(r.mocM1);
  const sub = (a, b) => (a != null && b != null ? Math.round((a - b) * 100) / 100 : null);
  return {
    ...r,
    mops, mocM, mocM1,
    mopsVsM1: sub(mops, mocM1), // MOPS / M+1
    mVsM1: sub(mocM, mocM1),    // MOC M / M+1 (swap structure)
    mopsVsM: sub(mops, mocM),   // MOPS / M (physical premium)
  };
}

// Merge seed baseline + user edit layer (cloud when connected, else local
// cache). Returns a sorted, differential-enriched array.
export async function getRecords(code) {
  const seed = await loadSeed(code);
  const map = {};
  for (const r of (seed.records || [])) map[r.date] = { ...r, _src: 'seed' };

  let layer = readLocal(code);
  if (cloudEnabled()) {
    try {
      layer = await cloudGetRecords(code);
      writeLocal(code, layer); // keep an offline cache
    } catch (e) {
      console.warn('Cloud read failed, using local cache:', e.message);
    }
  }

  for (const [date, r] of Object.entries(layer)) {
    if (r && r._deleted) { delete map[date]; continue; }
    map[date] = { ...r, date, _src: cloudEnabled() ? 'cloud' : 'local' };
  }
  return Object.values(map)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(withDiffs);
}

export async function getMeta(code) {
  const seed = await loadSeed(code);
  const p = productByCode(code);
  return {
    product: seed.product || (p && p.name) || code,
    unit: seed.unit || (p && p.unit) || '',
    benchmark: seed.benchmark || '',
    note: seed.note || '',
  };
}

export async function saveRecord(code, rec) {
  const clean = {
    date: rec.date,
    mops: rec.mops ?? null,
    mocM: rec.mocM ?? null,
    mocM1: rec.mocM1 ?? null,
  };
  const map = readLocal(code);
  map[rec.date] = clean;
  writeLocal(code, map); // write-through cache
  if (cloudEnabled()) await cloudUpsertRecord(code, clean);
}

export async function deleteRecord(code, date) {
  const map = readLocal(code);
  map[date] = { _deleted: true }; // tombstone so seed rows hide too
  writeLocal(code, map);
  if (cloudEnabled()) await cloudUpsertRecord(code, { date }, true);
}

export async function importRecords(code, records, mode = 'merge') {
  const map = mode === 'replace' ? {} : readLocal(code);
  const clean = [];
  for (const r of records) {
    if (!r.date) continue;
    const c = { date: r.date, mops: numOrNull(r.mops), mocM: numOrNull(r.mocM), mocM1: numOrNull(r.mocM1) };
    map[r.date] = c;
    clean.push(c);
  }
  writeLocal(code, map);
  if (cloudEnabled()) {
    for (const c of clean) await cloudUpsertRecord(code, c);
  }
}

// Push everything currently in this browser's cache up to the cloud
// (used once after connecting, to migrate entries added while offline).
export async function pushLocalToCloud(code) {
  const map = readLocal(code);
  let n = 0;
  for (const [date, r] of Object.entries(map)) {
    if (r && r._deleted) { await cloudUpsertRecord(code, { date }, true); n++; }
    else { await cloudUpsertRecord(code, { date, mops: r.mops, mocM: r.mocM, mocM1: r.mocM1 }); n++; }
  }
  // news
  const news = JSON.parse(localStorage.getItem(LS_NEWS) || '[]');
  for (const item of news) await cloudUpsertNews(item);
  return { records: n, news: news.length };
}

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v;
  return Number.isFinite(n) ? n : null;
}

// ---- News ----
function readNewsLocal() {
  try { return JSON.parse(localStorage.getItem(LS_NEWS) || '[]'); }
  catch { return []; }
}
function writeNewsLocal(list) { localStorage.setItem(LS_NEWS, JSON.stringify(list)); }

export async function getNews() {
  if (cloudEnabled()) {
    try {
      const list = await cloudGetNews();
      writeNewsLocal(list);
      return list;
    } catch (e) {
      console.warn('Cloud news read failed, using local cache:', e.message);
    }
  }
  return readNewsLocal();
}

export async function saveNews(item) {
  const list = readNewsLocal();
  if (!item.id) item.id = 'n' + Date.now();
  const i = list.findIndex((n) => n.id === item.id);
  if (i >= 0) list[i] = item; else list.push(item);
  writeNewsLocal(list);
  if (cloudEnabled()) await cloudUpsertNews(item);
  return item;
}

export async function deleteNews(id) {
  writeNewsLocal(readNewsLocal().filter((n) => n.id !== id));
  if (cloudEnabled()) await cloudDeleteNews(id);
}

// ---- Export helpers ----
export function toCSV(records) {
  const head = ['date', 'mops', 'mocM', 'mocM1', 'mopsVsM', 'mopsVsM1', 'mVsM1'];
  const lines = [head.join(',')];
  for (const r of records.map(withDiffs)) {
    lines.push(head.map((k) => (r[k] == null ? '' : r[k])).join(','));
  }
  return lines.join('\n');
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
