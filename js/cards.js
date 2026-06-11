// Reusable stat card with a mini sparkline and day-on-day (DoD) change,
// matching the requested visual: icon + title, sparkline, big value, DoD.

const fmt = (v, d = 2) => (v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));

const UP = '#2bd4a4', DOWN = '#ff6b6b', FLAT = '#8b98a8';

function sparkline(series, color) {
  const pts = (series || []).filter((v) => typeof v === 'number');
  if (pts.length < 2) return '';
  const w = 82, h = 26, pad = 3;
  const min = Math.min(...pts), max = Math.max(...pts);
  const rng = (max - min) || 1;
  const step = (w - 2 * pad) / (pts.length - 1);
  const xy = pts.map((v, i) => [pad + i * step, h - pad - ((v - min) / rng) * (h - 2 * pad)]);
  const line = xy.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${xy[xy.length - 1][0].toFixed(1)} ${h} L ${xy[0][0].toFixed(1)} ${h} Z`;
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${area}" fill="${color}1f"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

export function statCard({ icon, title, value, unit, prev, series }) {
  const v = typeof value === 'number' ? value : null;
  const p = typeof prev === 'number' ? prev : null;
  const d = (v != null && p != null) ? Math.round((v - p) * 100) / 100 : null;
  const cls = d == null ? 'flat' : d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  const color = d == null ? FLAT : d > 0 ? UP : d < 0 ? DOWN : FLAT;
  const arrow = d == null ? '' : d > 0 ? '↗' : d < 0 ? '↘' : '·';
  const dod = d == null ? '—' : `${arrow} ${d > 0 ? '+' : ''}${fmt(d)} DoD`;
  return `<div class="statc">
    <div class="statc-top">
      <div class="statc-title">${icon ? `<span class="statc-ic">${icon}</span>` : ''}<span>${title}</span></div>
      <div class="statc-spark">${sparkline(series, color)}</div>
    </div>
    <div class="statc-bottom">
      <div class="statc-val">${fmt(v)}${(v != null && unit) ? `<span class="statc-u">${unit}</span>` : ''}</div>
      <div class="statc-dod ${cls}">${dod}</div>
    </div>
  </div>`;
}
