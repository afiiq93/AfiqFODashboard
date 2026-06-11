import { getCloudConfig, setCloudConfig, cloudEnabled, cloudTest, SETUP_SQL } from './cloud.js';
import { getAIConfig, setAIConfig, aiEnabled, aiTest } from './ai.js';
import { getFeeds, setFeeds } from './feed.js';
import { pushLocalToCloud, PRODUCTS } from './store.js';
import { toast, rerender } from './app.js';

export async function renderSettings(view, state) {
  const cfg = getCloudConfig() || { url: '', key: '' };
  const connected = cloudEnabled();
  const ai = getAIConfig() || { key: '', model: 'claude-opus-4-8' };
  const aiOn = aiEnabled();
  const feedLines = escapeHtml(getFeeds().map((f) => `${f.name} | ${f.url}`).join('\n'));

  view.innerHTML = `
    <div class="page-head"><h1>Settings · Cloud Sync</h1></div>
    <p class="page-sub">Connect a free Supabase database so your prices and news sync across every device automatically — and are backed up online.</p>

    <div class="panel">
      <h2>Status: <span class="${connected ? 'up' : 'flat'}">${connected ? '● Connected' : '○ Not connected'}</span></h2>
      <p class="hint">${connected
        ? 'New entries on any device that uses these same details will appear everywhere.'
        : 'Right now entries are saved only in this browser. Connect below to sync across devices.'}</p>

      <form id="cloudForm">
        <div class="form-grid">
          <div class="field">
            <label for="curl">Project URL</label>
            <input class="input" type="url" id="curl" placeholder="https://xxxx.supabase.co" value="${cfg.url || ''}" />
          </div>
          <div class="field">
            <label for="ckey">API key (Publishable or anon)</label>
            <input class="input" type="text" id="ckey" placeholder="sb_publishable_… or eyJhbGci…" value="${cfg.key || ''}" />
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${connected ? 'Re-test & save' : 'Connect'}</button>
          ${connected ? '<button type="button" class="btn" id="pushBtn">Upload my existing entries</button>' : ''}
          ${connected ? '<button type="button" class="btn btn-danger" id="disconnectBtn">Disconnect this device</button>' : ''}
        </div>
        <p class="hint" id="cloudStatus"></p>
      </form>
    </div>

    <div class="panel">
      <h2>First-time setup (do this once)</h2>
      <ol class="setup-steps">
        <li>Go to <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> and sign up (free — you can use GitHub to sign in).</li>
        <li>Click <b>New project</b>. Give it any name and a database password (save the password somewhere). Pick the region closest to you. Wait ~1 minute for it to finish setting up.</li>
        <li>In the left menu open <b>SQL Editor</b> → <b>New query</b>, paste the code below, and click <b>Run</b>. This creates the two tables.</li>
        <li>Open <b>Project Settings</b> (gear, bottom-left) → <b>Data API</b>. Copy the <b>Project URL</b> (it ends in <code>.supabase.co</code>) into the box above.</li>
        <li>Then go to <b>Project Settings</b> → <b>API Keys</b> and copy the <b>Publishable key</b> (<code>sb_publishable_…</code>). Either that or the legacy <b>anon</b> key works. Paste it above and click <b>Connect</b>.</li>
        <li>On your other devices (phone, etc.), open this same Settings page and paste the same two values. Done — everything syncs.</li>
      </ol>

      <div class="panel-head"><h2 style="font-size:13px">Tables setup SQL</h2>
        <button class="btn btn-sm" id="copySql">Copy SQL</button></div>
      <pre class="code"><code id="sqlBlock">${escapeHtml(SETUP_SQL)}</code></pre>
    </div>

    <div class="notice">
      <b>Good to know:</b> the anon key is meant to be used in the browser. Because this dashboard is public, anyone who finds your link could in theory read or edit your fuel data — it holds no passwords or personal info, just market prices. If you'd rather lock it down to only you, tell me and I'll add a simple login step.
    </div>

    <div class="page-head" style="margin-top:26px"><h1>AI News Summaries</h1></div>
    <p class="page-sub">Add an Anthropic API key to summarise pasted articles on the News page in your format.</p>

    <div class="panel">
      <h2>Status: <span class="${aiOn ? 'up' : 'flat'}">${aiOn ? '● Key saved' : '○ No key'}</span></h2>
      <p class="hint">The key is stored only in this browser. Each summary costs a fraction of a cent (Opus ~1¢, Haiku ~¼¢ per article).</p>
      <form id="aiForm">
        <div class="form-grid">
          <div class="field">
            <label for="aikey">Anthropic API key</label>
            <input class="input" type="password" id="aikey" placeholder="sk-ant-…" value="${ai.key || ''}" />
          </div>
          <div class="field">
            <label for="aimodel">Model</label>
            <select class="select" id="aimodel">
              <option value="claude-opus-4-8" ${ai.model === 'claude-opus-4-8' ? 'selected' : ''}>Opus 4.8 — best quality</option>
              <option value="claude-haiku-4-5" ${ai.model === 'claude-haiku-4-5' ? 'selected' : ''}>Haiku 4.5 — fastest &amp; cheapest</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save key</button>
          ${aiOn ? '<button type="button" class="btn" id="aiTestBtn">Test</button>' : ''}
          ${aiOn ? '<button type="button" class="btn btn-danger" id="aiClearBtn">Remove key</button>' : ''}
        </div>
        <p class="hint" id="aiStatus"></p>
      </form>
      <ol class="setup-steps">
        <li>Go to <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> and sign up (you'll add a small amount of pay-as-you-go credit).</li>
        <li>Open <b>API Keys</b> → <b>Create Key</b>, copy it, and paste it above.</li>
        <li>On the <b>News</b> page, paste an article and click <b>Summarise with AI</b>.</li>
      </ol>
    </div>

    <div class="notice">
      <b>Security:</b> your API key is stored in this browser only (never committed to the public site). Keep it to your own devices — anyone with the key could spend your Anthropic credit. You can remove it here anytime.
    </div>

    <div class="page-head" style="margin-top:26px"><h1>News Feed Sources</h1></div>
    <p class="page-sub">The live feed on the News page pulls these RSS feeds. One per line as <code>Name | URL</code>.</p>

    <div class="panel">
      <form id="feedForm">
        <div class="field">
          <label for="feedsText">Feeds (RSS/Atom URLs)</label>
          <textarea id="feedsText" rows="4" placeholder="Marine fuel | https://news.google.com/rss/search?q=bunker">${feedLines}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save feeds</button>
          <span class="hint" id="feedStatus" style="align-self:center"></span>
        </div>
      </form>
      <p class="hint">Good marine/energy feeds to add: Ship &amp; Bunker, Hellenic Shipping News, Rigzone, Reuters Energy. Feeds the converter can't reach are skipped automatically.</p>
    </div>
  `;

  const $ = (id) => view.querySelector('#' + id);

  $('cloudForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $('curl').value.trim();
    const key = $('ckey').value.trim();
    if (!url || !key) { toast('Fill in both fields'); return; }
    $('cloudStatus').textContent = 'Testing connection…';
    setCloudConfig({ url, key });
    try {
      await cloudTest();
      $('cloudStatus').innerHTML = '<span class="up">Connected ✓</span> — syncing is on.';
      toast('Cloud connected');
      setTimeout(rerender, 600);
    } catch (err) {
      setCloudConfig(null);
      $('cloudStatus').innerHTML = `<span class="down">Couldn't connect.</span> Check the URL/key and that you ran the setup SQL. (${escapeHtml(err.message)})`;
    }
  });

  if (connected) {
    $('disconnectBtn').addEventListener('click', () => {
      if (confirm('Disconnect cloud sync on this device? Your data stays safe in the cloud and locally.')) {
        setCloudConfig(null); toast('Disconnected'); rerender();
      }
    });
    $('pushBtn').addEventListener('click', async () => {
      $('cloudStatus').textContent = 'Uploading your local entries…';
      try {
        let totalR = 0, totalN = 0;
        for (const p of PRODUCTS) { const r = await pushLocalToCloud(p.code); totalR += r.records; totalN = r.news; }
        $('cloudStatus').innerHTML = `<span class="up">Uploaded ✓</span> ${totalR} price rows and ${totalN} news items.`;
        toast('Uploaded to cloud');
      } catch (err) {
        $('cloudStatus').innerHTML = `<span class="down">Upload failed:</span> ${escapeHtml(err.message)}`;
      }
    });
  }

  $('copySql').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(SETUP_SQL); toast('SQL copied'); }
    catch { toast('Select and copy manually'); }
  });

  // ---- AI key ----
  $('aiForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = $('aikey').value.trim();
    const model = $('aimodel').value;
    if (!key) { toast('Enter an API key'); return; }
    setAIConfig({ key, model });
    $('aiStatus').innerHTML = '<span class="up">Saved ✓</span> — paste an article on the News page to summarise.';
    toast('API key saved');
    setTimeout(rerender, 600);
  });
  if (aiOn) {
    $('aiClearBtn').addEventListener('click', () => {
      if (confirm('Remove your API key from this browser?')) { setAIConfig(null); toast('Key removed'); rerender(); }
    });
    $('aiTestBtn').addEventListener('click', async () => {
      $('aiStatus').textContent = 'Testing…';
      try { await aiTest(); $('aiStatus').innerHTML = '<span class="up">Key works ✓</span>'; }
      catch (err) { $('aiStatus').innerHTML = `<span class="down">Test failed:</span> ${escapeHtml(err.message)}`; }
    });
  }

  // ---- news feeds ----
  $('feedForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const feeds = $('feedsText').value.split('\n').map((line) => {
      const s = line.trim();
      if (!s) return null;
      const [a, b] = s.split('|').map((x) => x.trim());
      const url = b || a;
      if (!/^https?:\/\//.test(url)) return null;
      let name = b ? a : '';
      if (!name) { try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { name = 'Feed'; } }
      return { name, url };
    }).filter(Boolean);
    setFeeds(feeds);
    $('feedStatus').innerHTML = `<span class="up">Saved ${feeds.length} feed(s) ✓</span>`;
    toast('Feeds saved');
  });
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
