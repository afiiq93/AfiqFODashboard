// Cloud sync via Supabase REST API (no SDK — just fetch).
// Credentials live in this browser's localStorage (not committed to the repo),
// so each device is connected once with the same project URL + anon key.

const LS_CLOUD = 'afo:cloud';

export function getCloudConfig() {
  try { return JSON.parse(localStorage.getItem(LS_CLOUD) || 'null'); }
  catch { return null; }
}

export function setCloudConfig(cfg) {
  if (cfg && cfg.url && cfg.key) localStorage.setItem(LS_CLOUD, JSON.stringify({ url: cfg.url.trim().replace(/\/$/, ''), key: cfg.key.trim() }));
  else localStorage.removeItem(LS_CLOUD);
}

export function cloudEnabled() {
  const c = getCloudConfig();
  return !!(c && c.url && c.key);
}

function headers(extra = {}) {
  const c = getCloudConfig();
  return { apikey: c.key, Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json', ...extra };
}
function base() { return getCloudConfig().url + '/rest/v1'; }

// ---- connection test ----
export async function cloudTest() {
  const res = await fetch(`${base()}/records?select=product&limit=1`, { headers: headers() });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return true;
}

// ---- records ----
// Table "records": product text, date date, mops/mocm/mocm1 numeric, deleted bool, PK(product,date)
export async function cloudGetRecords(code) {
  const res = await fetch(`${base()}/records?product=eq.${encodeURIComponent(code)}&select=*`, { headers: headers() });
  if (!res.ok) throw new Error('cloud read failed: ' + res.status);
  const rows = await res.json();
  const map = {};
  for (const row of rows) {
    map[row.date] = row.deleted
      ? { _deleted: true }
      : { date: row.date, mops: row.mops, mocM: row.mocm, mocM1: row.mocm1 };
  }
  return map;
}

export async function cloudUpsertRecord(code, rec, deleted = false) {
  const row = deleted
    ? { product: code, date: rec.date, deleted: true }
    : { product: code, date: rec.date, mops: rec.mops ?? null, mocm: rec.mocM ?? null, mocm1: rec.mocM1 ?? null, deleted: false };
  const res = await fetch(`${base()}/records?on_conflict=product,date`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error('cloud write failed: ' + res.status + ' ' + (await res.text()));
}

// ---- news ----
// Table "news": id text PK, date date, sentiment/source/url/headline/body text
export async function cloudGetNews() {
  const res = await fetch(`${base()}/news?select=*`, { headers: headers() });
  if (!res.ok) throw new Error('cloud read failed: ' + res.status);
  return res.json();
}

export async function cloudUpsertNews(item) {
  const res = await fetch(`${base()}/news?on_conflict=id`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('cloud write failed: ' + res.status + ' ' + (await res.text()));
}

export async function cloudDeleteNews(id) {
  const res = await fetch(`${base()}/news?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error('cloud delete failed: ' + res.status);
}

// The SQL the user runs once in Supabase to create the tables + open access.
export const SETUP_SQL = `-- Run once in Supabase → SQL Editor → New query → Run
create table if not exists public.records (
  product text not null,
  date    date not null,
  mops    numeric,
  mocm    numeric,
  mocm1   numeric,
  deleted boolean default false,
  primary key (product, date)
);

create table if not exists public.news (
  id        text primary key,
  date      date,
  sentiment text,
  source    text,
  url       text,
  headline  text,
  body      text
);

alter table public.records enable row level security;
alter table public.news    enable row level security;

-- Personal dashboard: allow the anon key to read & write.
create policy "anon all records" on public.records for all
  to anon using (true) with check (true);
create policy "anon all news" on public.news for all
  to anon using (true) with check (true);`;
