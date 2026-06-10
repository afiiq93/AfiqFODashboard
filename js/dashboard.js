import { getRecords, getMeta, productByCode, deleteRecord, toCSV, download } from './store.js';
import { toast, rerender } from './app.js';

let priceChart, spreadChart;

const fmt = (v, d = 2) => (v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

function changeCell(curr, prev) {
  if (curr == null || prev == null) return '<span class="chg flat">—</span>';
  const d = Math.round((curr - prev) * 100) / 100;
  const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '·';
  return `<span class="chg ${cls}">${arrow} ${fmt(Math.abs(d))}</span>`;
}

export async function renderDashboard(view, state) {
  const product = productByCode(state.product);
  if (!product.active) {
    view.innerHTML = `<div class="coming-soon"><div class="big">${product.name}</div>
      <p>This product isn't tracked yet. We started with Marine Fuel 0.5 — Gasoil 10ppm and HSFO can be switched on the same way once you start logging them.</p></div>`;
    return;
  }

  const [records, meta] = await Promise.all([getRecords(state.product), getMeta(state.product)]);
  const range = localStorage.getItem('afo:range') || '3M';
  const shown = applyRange(records, range);

  const last = records[records.length - 1] || {};
  const prev = records[records.length - 2] || {};

  view.innerHTML = `
    <div class="page-head">
      <h1>${meta.product}</h1>
      <span class="page-sub">${meta.benchmark || ''} · ${meta.unit}</span>
    </div>
    <p class="page-sub">Latest assessment: <b>${last.date ? fmtDate(last.date) + ' ' + new Date(last.date).getFullYear() : '—'}</b></p>

    <div class="cards">
      ${card('MOPS', last.mops, prev.mops, meta.unit)}
      ${card('MOC M', last.mocM, prev.mocM, meta.unit)}
      ${card('MOC M+1', last.mocM1, prev.mocM1, meta.unit)}
      ${card('MOPS / M+1', last.mopsVsM1, prev.mopsVsM1, '')}
      ${card('MOC M / M+1', last.mVsM1, prev.mVsM1, '')}
      ${card('MOPS / M', last.mopsVsM, prev.mopsVsM, '')}
    </div>

    <div class="toolbar">
      <div class="seg" id="rangeSeg">
        ${['1M', '3M', '6M', 'All'].map((r) => `<button data-range="${r}" class="${r === range ? 'active' : ''}">${r}</button>`).join('')}
      </div>
      <div class="spacer"></div>
      <button class="btn btn-sm" id="exportCsv">Export CSV</button>
      <button class="btn btn-sm" id="exportJson">Export JSON backup</button>
    </div>

    <div class="panel">
      <h2>Outright prices</h2>
      <p class="hint">Physical MOPS vs front-month (M) and second-month (M+1) MOC swaps.</p>
      <div class="chart-wrap"><canvas id="priceChart"></canvas></div>
    </div>

    <div class="panel">
      <h2>Spreads &amp; differentials</h2>
      <p class="hint">MOPS/M+1 (physical vs M+1), MOC M/M+1 (swap structure), MOPS/M (physical premium — blank when the M swap isn't assessed).</p>
      <div class="chart-wrap"><canvas id="spreadChart"></canvas></div>
    </div>

    <div class="panel">
      <h2>Recent data</h2>
      <p class="hint">Most recent first. Differentials are computed automatically.</p>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>MOPS</th><th>MOC M</th><th>MOC M+1</th>
            <th>MOPS/M</th><th>MOPS/M+1</th><th>MOC M/M+1</th><th></th>
          </tr></thead>
          <tbody>
            ${[...shown].reverse().slice(0, 40).map(rowHtml).join('') || `<tr><td colspan="8" class="empty">No data in range</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // range buttons
  view.querySelectorAll('#rangeSeg button').forEach((b) =>
    b.addEventListener('click', () => { localStorage.setItem('afo:range', b.dataset.range); rerender(); })
  );
  view.querySelector('#exportCsv').addEventListener('click', () => {
    download(`${state.product}-data.csv`, toCSV(records), 'text/csv');
    toast('CSV exported');
  });
  view.querySelector('#exportJson').addEventListener('click', () => {
    const payload = { product: meta.product, code: state.product, unit: meta.unit, exportedAt: new Date().toISOString(),
      records: records.map(({ date, mops, mocM, mocM1 }) => ({ date, mops, mocM, mocM1 })) };
    download(`${state.product}-backup.json`, JSON.stringify(payload, null, 2));
    toast('JSON backup downloaded');
  });
  view.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm(`Delete record for ${b.dataset.del}?`)) { deleteRecord(state.product, b.dataset.del); rerender(); }
    })
  );

  drawCharts(shown, meta.unit);
}

function card(label, val, prev, unit) {
  return `<div class="card">
    <div class="label">${label}</div>
    <div class="value">${fmt(val)}${unit ? `<span style="font-size:12px;color:var(--muted)"> ${unit}</span>` : ''}</div>
    ${changeCell(val, prev)}
  </div>`;
}

function rowHtml(r) {
  const cell = (v) => (v == null ? '<td class="na">n/a</td>' : `<td>${fmt(v)}</td>`);
  return `<tr>
    <td>${fmtDate(r.date)} ${new Date(r.date).getFullYear()}</td>
    ${cell(r.mops)}${cell(r.mocM)}${cell(r.mocM1)}
    ${cell(r.mopsVsM)}${cell(r.mopsVsM1)}${cell(r.mVsM1)}
    <td class="actions-cell"><button class="btn btn-sm btn-danger" data-del="${r.date}">Delete</button></td>
  </tr>`;
}

function applyRange(records, range) {
  if (range === 'All' || !records.length) return records;
  const months = { '1M': 1, '3M': 3, '6M': 6 }[range] || 3;
  const last = new Date(records[records.length - 1].date);
  const cutoff = new Date(last); cutoff.setMonth(cutoff.getMonth() - months);
  return records.filter((r) => new Date(r.date) >= cutoff);
}

const COLORS = { mops: '#4aa3ff', mocM: '#2bd4a4', mocM1: '#f0b429', mopsVsM1: '#4aa3ff', mVsM1: '#2bd4a4', mopsVsM: '#c77dff' };

function baseOpts(unit) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#c6d2df', usePointStyle: true, boxWidth: 8 } },
      tooltip: { backgroundColor: '#1c2733', borderColor: '#243140', borderWidth: 1,
        callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? 'n/a' : c.parsed.y.toFixed(2)}` } },
    },
    scales: {
      x: { ticks: { color: '#8b98a8', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { color: 'rgba(36,49,64,.5)' } },
      y: { ticks: { color: '#8b98a8' }, grid: { color: 'rgba(36,49,64,.5)' }, title: { display: !!unit, text: unit, color: '#8b98a8' } },
    },
  };
}

function drawCharts(rows, unit) {
  const labels = rows.map((r) => fmtDate(r.date));
  const ds = (label, key, color) => ({
    label, data: rows.map((r) => r[key]), borderColor: color,
    backgroundColor: color + '22', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4,
    tension: 0.25, spanGaps: false,
  });

  if (priceChart) priceChart.destroy();
  if (spreadChart) spreadChart.destroy();

  priceChart = new Chart(document.getElementById('priceChart'), {
    type: 'line',
    data: { labels, datasets: [ds('MOPS', 'mops', COLORS.mops), ds('MOC M', 'mocM', COLORS.mocM), ds('MOC M+1', 'mocM1', COLORS.mocM1)] },
    options: baseOpts(unit),
  });

  spreadChart = new Chart(document.getElementById('spreadChart'), {
    type: 'line',
    data: { labels, datasets: [ds('MOPS / M+1', 'mopsVsM1', COLORS.mopsVsM1), ds('MOC M / M+1', 'mVsM1', COLORS.mVsM1), ds('MOPS / M', 'mopsVsM', COLORS.mopsVsM)] },
    options: baseOpts('USD/mt'),
  });
}
