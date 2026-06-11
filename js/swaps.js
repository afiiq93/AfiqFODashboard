// Fuel Swap MOC — front-month swap levels for HSFO 380 and VLSFO 0.5%, plus the
// Hi/Fi spread (VLSFO 0.5% minus HSFO 380). Seeded from a committed baseline;
// new entries saved in this browser (cloud sync can be added later).

import { download } from './store.js';
import { statCard } from './cards.js';
import { toast, rerender } from './app.js';

const SEED_FILE = 'data/fuel-swap-moc.json';
const LS = 'afo:swaps';
let seedCache = null;
let chart;

const fmt = (v, d = 2) => (v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const yr = (s) => new Date(s + 'T00:00:00').getFullYear();

async function loadSeed() {
  if (seedCache) return seedCache;
  try { const r = await fetch(SEED_FILE, { cache: 'no-store' }); seedCache = r.ok ? await r.json() : { records: [] }; }
  catch { seedCache = { records: [] }; }
  return seedCache;
}
function readLocal() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } }
function writeLocal(m) { localStorage.setItem(LS, JSON.stringify(m)); }

function withHiFi(r) {
  const sub = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.round((a - b) * 100) / 100 : null);
  return { ...r, hifi: sub(r.vlsfo_m, r.hsfo380_m) };
}

async function getSwaps() {
  const seed = await loadSeed();
  const map = {};
  for (const r of (seed.records || [])) map[r.date] = { ...r };
  const local = readLocal();
  for (const [date, r] of Object.entries(local)) {
    if (r && r._deleted) { delete map[date]; continue; }
    map[date] = { ...r, date };
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map(withHiFi);
}

function saveSwap(rec) {
  const m = readLocal();
  m[rec.date] = { date: rec.date, hsfo380_m: rec.hsfo380_m ?? null, hsfo380_m1: rec.hsfo380_m1 ?? null, vlsfo_m: rec.vlsfo_m ?? null, vlsfo_m1: rec.vlsfo_m1 ?? null };
  writeLocal(m);
}
function deleteSwap(date) { const m = readLocal(); m[date] = { _deleted: true }; writeLocal(m); }

function applyRange(rows, range) {
  if (range === 'All' || !rows.length) return rows;
  const months = { '1M': 1, '3M': 3, '6M': 6 }[range] || 3;
  const last = new Date(rows[rows.length - 1].date);
  const cutoff = new Date(last); cutoff.setMonth(cutoff.getMonth() - months);
  return rows.filter((r) => new Date(r.date) >= cutoff);
}

export async function renderSwaps(view) {
  const rows = await getSwaps();
  const range = localStorage.getItem('afo:swapsRange') || '3M';
  const shown = applyRange(rows, range);
  const last = rows[rows.length - 1] || {};
  const prev = rows[rows.length - 2] || {};
  const ser = (k) => shown.map((r) => r[k]);

  view.innerHTML = `
    <div class="page-head"><h1>Fuel Swap MOC — Spreads</h1>
      <span class="page-sub">Front-month swaps &amp; Hi/Fi · USD/mt</span></div>
    <p class="page-sub">Latest: <b>${last.date ? fmtDate(last.date) + ' ' + yr(last.date) : '—'}</b> · Hi/Fi = VLSFO 0.5% − HSFO 380</p>

    <div class="stats">
      ${statCard({ icon: '⛽', title: 'HSFO 380 (M)', value: last.hsfo380_m, prev: prev.hsfo380_m, unit: '$/mt', series: ser('hsfo380_m') })}
      ${statCard({ icon: '🛢️', title: 'VLSFO 0.5% (M)', value: last.vlsfo_m, prev: prev.vlsfo_m, unit: '$/mt', series: ser('vlsfo_m') })}
      ${statCard({ icon: '📊', title: 'Hi/Fi spread', value: last.hifi, prev: prev.hifi, unit: '$/mt', series: ser('hifi') })}
      ${statCard({ icon: '⛽', title: 'HSFO 380 (M+1)', value: last.hsfo380_m1, prev: prev.hsfo380_m1, unit: '$/mt', series: ser('hsfo380_m1') })}
      ${statCard({ icon: '🛢️', title: 'VLSFO 0.5% (M+1)', value: last.vlsfo_m1, prev: prev.vlsfo_m1, unit: '$/mt', series: ser('vlsfo_m1') })}
    </div>

    <div class="panel">
      <div class="panel-head">
        <div class="seg" id="swapRange">${['1M', '3M', '6M', 'All'].map((r) => `<button data-range="${r}" class="${r === range ? 'active' : ''}">${r}</button>`).join('')}</div>
        <div class="toolbar" style="margin:0">
          <button class="btn btn-sm" id="swapCsv">Export CSV</button>
          <button class="btn btn-sm" id="swapJson">Backup JSON</button>
        </div>
      </div>
      <p class="hint">Front-month swap levels (left axis) with the Hi/Fi spread (right axis).</p>
      <div class="chart-wrap"><canvas id="swapChart"></canvas></div>
    </div>

    <div class="panel">
      <h2>Add / update a day</h2>
      <p class="hint">Enter the front (M) and next-month (M+1) swaps. Hi/Fi is calculated for you.</p>
      <form id="swapForm">
        <div class="form-grid">
          <div class="field"><label for="sdate">Date</label><input class="input" type="date" id="sdate" value="${new Date().toISOString().slice(0, 10)}" required /></div>
          <div class="field"><label for="s380m">HSFO 380 — M</label><input class="input" type="number" step="0.01" id="s380m" placeholder="e.g. 597.75" /></div>
          <div class="field"><label for="s380m1">HSFO 380 — M+1</label><input class="input" type="number" step="0.01" id="s380m1" placeholder="next month" /></div>
          <div class="field"><label for="s05m">VLSFO 0.5% — M</label><input class="input" type="number" step="0.01" id="s05m" placeholder="e.g. 718.50" /></div>
          <div class="field"><label for="s05m1">VLSFO 0.5% — M+1</label><input class="input" type="number" step="0.01" id="s05m1" placeholder="next month" /></div>
        </div>
        <div class="preview" id="swapPreview" style="margin-top:14px"></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save day</button>
          <button type="reset" class="btn btn-ghost">Clear</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <h2>Recent data</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>380 M</th><th>380 M+1</th><th>0.5% M</th><th>0.5% M+1</th><th>Hi/Fi</th><th></th></tr></thead>
        <tbody>${[...shown].reverse().slice(0, 40).map(rowHtml).join('') || `<tr><td colspan="7" class="empty">No data in range</td></tr>`}</tbody>
      </table></div>
    </div>

    <p class="page-sub">LSMGO isn't in the Fuel Swap MOC source — say the word when you have its swaps and I'll add it here.</p>
  `;

  view.querySelectorAll('#swapRange button').forEach((b) => b.addEventListener('click', () => { localStorage.setItem('afo:swapsRange', b.dataset.range); rerender(); }));
  view.querySelector('#swapCsv').addEventListener('click', () => { download('fuel-swap-moc.csv', toCSV(rows), 'text/csv'); toast('CSV exported'); });
  view.querySelector('#swapJson').addEventListener('click', () => {
    download('fuel-swap-moc-backup.json', JSON.stringify({ name: 'Fuel Swap MOC', exportedAt: new Date().toISOString(),
      records: rows.map(({ date, hsfo380_m, hsfo380_m1, vlsfo_m, vlsfo_m1 }) => ({ date, hsfo380_m, hsfo380_m1, vlsfo_m, vlsfo_m1 })) }, null, 2));
    toast('JSON backup downloaded');
  });
  view.querySelectorAll('[data-delswap]').forEach((b) => b.addEventListener('click', () => { if (confirm(`Delete ${b.dataset.delswap}?`)) { deleteSwap(b.dataset.delswap); rerender(); } }));

  const num = (id) => { const v = view.querySelector('#' + id).value; return v === '' ? null : parseFloat(v); };
  function readForm() { return { date: view.querySelector('#sdate').value, hsfo380_m: num('s380m'), hsfo380_m1: num('s380m1'), vlsfo_m: num('s05m'), vlsfo_m1: num('s05m1') }; }
  function preview() { const h = withHiFi(readForm()); view.querySelector('#swapPreview').innerHTML = `<div class="chip">Hi/Fi: <b>${fmt(h.hifi)}</b></div>`; }
  function loadExisting() { const r = rows.find((x) => x.date === view.querySelector('#sdate').value); if (r) { view.querySelector('#s380m').value = r.hsfo380_m ?? ''; view.querySelector('#s380m1').value = r.hsfo380_m1 ?? ''; view.querySelector('#s05m').value = r.vlsfo_m ?? ''; view.querySelector('#s05m1').value = r.vlsfo_m1 ?? ''; } preview(); }
  ['input', 'change'].forEach((ev) => view.querySelector('#swapForm').addEventListener(ev, preview));
  view.querySelector('#sdate').addEventListener('change', loadExisting);
  loadExisting();
  view.querySelector('#swapForm').addEventListener('submit', (e) => {
    e.preventDefault(); const rec = readForm();
    if (rec.hsfo380_m == null && rec.vlsfo_m == null && rec.hsfo380_m1 == null && rec.vlsfo_m1 == null) { toast('Enter at least one value'); return; }
    saveSwap(rec); toast('Saved ' + rec.date); rerender();
  });

  drawChart(shown);
}

function rowHtml(r) {
  const c = (v) => (v == null ? '<td class="na">n/a</td>' : `<td>${fmt(v)}</td>`);
  return `<tr><td>${fmtDate(r.date)} ${yr(r.date)}</td>${c(r.hsfo380_m)}${c(r.hsfo380_m1)}${c(r.vlsfo_m)}${c(r.vlsfo_m1)}${c(r.hifi)}<td class="actions-cell"><button class="btn btn-sm btn-danger" data-delswap="${r.date}">Delete</button></td></tr>`;
}
function toCSV(rows) {
  const head = ['date', 'hsfo380_m', 'hsfo380_m1', 'vlsfo_m', 'vlsfo_m1', 'hifi'];
  return [head.join(',')].concat(rows.map((r) => head.map((k) => (r[k] == null ? '' : r[k])).join(','))).join('\n');
}

function drawChart(rows) {
  const labels = rows.map((r) => fmtDate(r.date));
  const line = (label, key, color, axis) => ({ label, data: rows.map((r) => r[key]), borderColor: color, backgroundColor: color + '22', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, spanGaps: false, yAxisID: axis });
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('swapChart'), {
    type: 'line',
    data: { labels, datasets: [
      line('HSFO 380 (M)', 'hsfo380_m', '#e6a13c', 'y'),
      line('VLSFO 0.5% (M)', 'vlsfo_m', '#4aa3ff', 'y'),
      line('Hi/Fi spread', 'hifi', '#c77dff', 'y1'),
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#c6d2df', usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? 'n/a' : c.parsed.y.toFixed(2)}` } } },
      scales: {
        x: { ticks: { color: '#8b98a8', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { color: 'rgba(36,49,64,.5)' } },
        y: { position: 'left', ticks: { color: '#8b98a8' }, grid: { color: 'rgba(36,49,64,.5)' }, title: { display: true, text: 'Swap level (USD/mt)', color: '#8b98a8' } },
        y1: { position: 'right', ticks: { color: '#c77dff' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Hi/Fi (USD/mt)', color: '#c77dff' } },
      },
    },
  });
}
