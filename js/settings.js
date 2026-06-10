import { getCloudConfig, setCloudConfig, cloudEnabled, cloudTest, SETUP_SQL } from './cloud.js';
import { pushLocalToCloud, PRODUCTS } from './store.js';
import { toast, rerender } from './app.js';

export async function renderSettings(view, state) {
  const cfg = getCloudConfig() || { url: '', key: '' };
  const connected = cloudEnabled();

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
            <label for="ckey">Anon public key</label>
            <input class="input" type="text" id="ckey" placeholder="eyJhbGciOi…" value="${cfg.key || ''}" />
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
        <li>In the left menu open <b>Project Settings</b> (gear) → <b>API</b>. Copy the <b>Project URL</b> and the <b>anon public</b> key into the boxes above, then click <b>Connect</b>.</li>
        <li>On your other devices (phone, etc.), open this same Settings page and paste the same two values. Done — everything syncs.</li>
      </ol>

      <div class="panel-head"><h2 style="font-size:13px">Tables setup SQL</h2>
        <button class="btn btn-sm" id="copySql">Copy SQL</button></div>
      <pre class="code"><code id="sqlBlock">${escapeHtml(SETUP_SQL)}</code></pre>
    </div>

    <div class="notice">
      <b>Good to know:</b> the anon key is meant to be used in the browser. Because this dashboard is public, anyone who finds your link could in theory read or edit your fuel data — it holds no passwords or personal info, just market prices. If you'd rather lock it down to only you, tell me and I'll add a simple login step.
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
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
