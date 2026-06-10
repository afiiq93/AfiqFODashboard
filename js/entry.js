import { getRecords, productByCode, saveRecord, importRecords, withDiffs, download } from './store.js';
import { toast, rerender } from './app.js';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (v) => (v == null ? '—' : v.toFixed(2));

export async function renderEntry(view, state) {
  const product = productByCode(state.product);
  const records = product.active ? await getRecords(state.product) : [];
  const existing = Object.fromEntries(records.map((r) => [r.date, r]));

  view.innerHTML = `
    <div class="page-head"><h1>Data Entry</h1></div>
    <p class="page-sub">Logging <b>${product.name}</b>. Enter MOPS, MOC M and MOC M+1 — the three differentials are calculated for you.</p>

    ${!product.active ? `<div class="notice">${product.name} isn't active yet. Switch the product to Marine Fuel 0.5 in the top-right to log data, or ask to enable this one.</div>` : ''}

    <div class="panel">
      <h2>Add / update a day</h2>
      <p class="hint">Picking a date that already exists will update it.</p>
      <form id="entryForm">
        <div class="form-grid">
          <div class="field">
            <label for="date">Date</label>
            <input class="input" type="date" id="date" value="${today()}" required />
          </div>
          <div class="field">
            <label for="mops">MOPS (physical)</label>
            <input class="input" type="number" step="0.01" id="mops" placeholder="e.g. 708.75" />
          </div>
          <div class="field">
            <label for="mocM">MOC M swap</label>
            <input class="input" type="number" step="0.01" id="mocM" placeholder="front month" />
          </div>
          <div class="field">
            <label for="mocM1">MOC M+1 swap</label>
            <input class="input" type="number" step="0.01" id="mocM1" placeholder="second month" />
          </div>
        </div>
        <div class="checkbox-row" style="margin-top:12px">
          <input type="checkbox" id="mNA" />
          <label for="mNA">M swap not assessed today (month-end) — leave MOPS/M blank</label>
        </div>

        <div class="preview" id="preview" style="margin-top:14px"></div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save day</button>
          <button type="reset" class="btn btn-ghost">Clear</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <h2>Import &amp; export</h2>
      <p class="hint">Bring in history from a spreadsheet (CSV with columns: date, mops, mocM, mocM1) or a JSON backup. Export anytime to keep a copy or commit it to the repo.</p>
      <div class="toolbar">
        <input type="file" id="importFile" accept=".csv,.json" class="input" />
        <select class="select" id="importMode">
          <option value="merge">Merge with existing</option>
          <option value="replace">Replace my local edits</option>
        </select>
        <button class="btn" id="importBtn">Import</button>
        <div class="spacer"></div>
        <button class="btn btn-sm" id="dlCsv">Export CSV</button>
        <button class="btn btn-sm" id="dlJson">Export JSON</button>
      </div>
      <p class="hint" id="importStatus"></p>
    </div>
  `;

  if (!product.active) return;

  const $ = (id) => view.querySelector('#' + id);
  const dateEl = $('date'), mopsEl = $('mops'), mocMEl = $('mocM'), mocM1El = $('mocM1'), naEl = $('mNA');

  function loadExisting() {
    const r = existing[dateEl.value];
    if (r) {
      mopsEl.value = r.mops ?? '';
      mocMEl.value = r.mocM ?? '';
      mocM1El.value = r.mocM1 ?? '';
      naEl.checked = r.mocM == null && r.mops != null;
    }
    updatePreview();
  }

  function readForm() {
    const num = (el) => (el.value === '' ? null : parseFloat(el.value));
    return {
      date: dateEl.value,
      mops: num(mopsEl),
      mocM: naEl.checked ? null : num(mocMEl),
      mocM1: num(mocM1El),
    };
  }

  function updatePreview() {
    const d = withDiffs(readForm());
    $('preview').innerHTML = `
      <div class="chip">MOPS/M: <b>${fmt(d.mopsVsM)}</b></div>
      <div class="chip">MOPS/M+1: <b>${fmt(d.mopsVsM1)}</b></div>
      <div class="chip">MOC M/M+1: <b>${fmt(d.mVsM1)}</b></div>`;
    mocMEl.disabled = naEl.checked;
  }

  ['input', 'change'].forEach((ev) => view.querySelector('#entryForm').addEventListener(ev, updatePreview));
  dateEl.addEventListener('change', loadExisting);
  loadExisting();

  view.querySelector('#entryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const rec = readForm();
    if (rec.mops == null && rec.mocM == null && rec.mocM1 == null) { toast('Enter at least one value'); return; }
    saveRecord(state.product, rec);
    toast('Saved ' + rec.date);
    rerender();
  });

  // import / export
  view.querySelector('#importBtn').addEventListener('click', async () => {
    const file = $('importFile').files[0];
    if (!file) { toast('Choose a file first'); return; }
    try {
      const text = await file.text();
      const recs = file.name.endsWith('.json') ? parseJson(text) : parseCsv(text);
      importRecords(state.product, recs, $('importMode').value);
      $('importStatus').textContent = `Imported ${recs.length} rows.`;
      toast(`Imported ${recs.length} rows`);
      rerender();
    } catch (err) {
      $('importStatus').textContent = 'Import failed: ' + err.message;
    }
  });

  const exportRows = records.map(({ date, mops, mocM, mocM1 }) => ({ date, mops, mocM, mocM1 }));
  view.querySelector('#dlCsv').addEventListener('click', () => {
    const head = 'date,mops,mocM,mocM1';
    const body = exportRows.map((r) => [r.date, r.mops ?? '', r.mocM ?? '', r.mocM1 ?? ''].join(',')).join('\n');
    download(`${state.product}-data.csv`, head + '\n' + body, 'text/csv');
  });
  view.querySelector('#dlJson').addEventListener('click', () =>
    download(`${state.product}-data.json`, JSON.stringify({ code: state.product, records: exportRows }, null, 2))
  );
}

function parseJson(text) {
  const j = JSON.parse(text);
  const recs = Array.isArray(j) ? j : j.records || [];
  return recs.filter((r) => r && r.date);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (names) => head.findIndex((h) => names.includes(h));
  const di = idx(['date']), pi = idx(['mops']), mi = idx(['mocm', 'moc m', 'm']), m1i = idx(['mocm1', 'moc m+1', 'm+1']);
  if (di < 0) throw new Error('No "date" column found');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const date = normalizeDate((c[di] || '').trim());
    if (!date) continue;
    const v = (k) => (k >= 0 && c[k] != null && c[k].trim() !== '' ? parseFloat(c[k]) : null);
    out.push({ date, mops: v(pi), mocM: v(mi), mocM1: v(m1i) });
  }
  return out;
}

function normalizeDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/); // dd/mm/yyyy
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dt = new Date(s);
  return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
}
