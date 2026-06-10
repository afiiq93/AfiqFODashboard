import { getNews, saveNews, deleteNews, getRecords, productByCode } from './store.js';
import { toast, rerender } from './app.js';

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export async function renderNews(view, state) {
  const news = (await getNews()).sort((a, b) => b.date.localeCompare(a.date));

  // Price context: map of date -> MOPS day-on-day move for the active product,
  // so a headline can be read against how the market actually moved.
  const records = productByCode(state.product).active ? await getRecords(state.product) : [];
  const moveByDate = {};
  for (let i = 1; i < records.length; i++) {
    const a = records[i - 1].mops, b = records[i].mops;
    if (a != null && b != null) moveByDate[records[i].date] = Math.round((b - a) * 100) / 100;
  }

  view.innerHTML = `
    <div class="page-head"><h1>Market News</h1></div>
    <p class="page-sub">Log the headlines that move the market and tag them bullish / bearish / neutral. Each item shows how MOPS moved that day so you can see the link between news and price.</p>

    <div class="panel">
      <h2>Add a headline</h2>
      <form id="newsForm">
        <div class="form-grid">
          <div class="field">
            <label for="ndate">Date</label>
            <input class="input" type="date" id="ndate" value="${today()}" required />
          </div>
          <div class="field">
            <label for="nsent">Read</label>
            <select class="select" id="nsent">
              <option value="bull">Bullish</option>
              <option value="bear">Bearish</option>
              <option value="neutral" selected>Neutral</option>
            </select>
          </div>
          <div class="field">
            <label for="nsource">Source</label>
            <input class="input" type="text" id="nsource" placeholder="Platts, Reuters, Argus…" />
          </div>
          <div class="field">
            <label for="nurl">Link (optional)</label>
            <input class="input" type="url" id="nurl" placeholder="https://…" />
          </div>
        </div>
        <div class="field" style="margin-top:12px">
          <label for="nhead">Headline</label>
          <input class="input" type="text" id="nhead" placeholder="e.g. OPEC+ extends voluntary cuts through Q3" required />
        </div>
        <div class="field" style="margin-top:12px">
          <label for="nbody">Notes — why it matters / how it hit MF 0.5, spreads</label>
          <textarea id="nbody" rows="3" placeholder="Your read on the impact to prices and spreads…"></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save headline</button>
        </div>
      </form>
    </div>

    <div class="news-list" id="newsList">
      ${news.length ? news.map((n) => itemHtml(n, moveByDate[n.date])).join('') : `<div class="empty">No headlines logged yet. Add the first one above.</div>`}
    </div>
  `;

  view.querySelector('#newsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = (id) => view.querySelector('#' + id).value.trim();
    if (!g('nhead')) { toast('Add a headline'); return; }
    try {
      await saveNews({ date: g('ndate'), sentiment: view.querySelector('#nsent').value, source: g('nsource'),
        url: g('nurl'), headline: g('nhead'), body: g('nbody') });
      toast('Headline saved');
    } catch (err) { toast('Saved locally — cloud sync failed'); console.error(err); }
    rerender();
  });

  view.querySelectorAll('[data-delnews]').forEach((b) =>
    b.addEventListener('click', async () => { if (confirm('Delete this headline?')) { await deleteNews(b.dataset.delnews); rerender(); } })
  );
}

function itemHtml(n, move) {
  const sentLabel = { bull: 'Bullish', bear: 'Bearish', neutral: 'Neutral' }[n.sentiment] || 'Neutral';
  const head = n.url
    ? `<a href="${n.url}" target="_blank" rel="noopener">${escape(n.headline)}</a>`
    : escape(n.headline);
  let px = '';
  if (move != null) {
    const cls = move > 0 ? 'up' : move < 0 ? 'down' : 'flat';
    const arrow = move > 0 ? '▲' : move < 0 ? '▼' : '·';
    px = `<div class="pxtag">MOPS that day: <span class="${cls}">${arrow} ${Math.abs(move).toFixed(2)}</span> USD/mt d/d</div>`;
  }
  return `<div class="news-item">
    <div class="meta">
      <span class="badge ${n.sentiment}">${sentLabel}</span>
      <span>${fmtDate(n.date)}</span>
      ${n.source ? `<span>· ${escape(n.source)}</span>` : ''}
      <span style="margin-left:auto"><button class="btn btn-sm btn-danger" data-delnews="${n.id}">Delete</button></span>
    </div>
    <h3>${head}</h3>
    ${n.body ? `<div class="body">${escape(n.body)}</div>` : ''}
    ${px}
  </div>`;
}

function escape(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
