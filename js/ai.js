// AI news summarisation — calls the Anthropic API directly from the browser.
// The API key lives in this browser's localStorage (not committed). Direct
// browser access requires the anthropic-dangerous-direct-browser-access header.

const LS_AI = 'afo:anthropic';
const DEFAULT_MODEL = 'claude-opus-4-8';

export function getAIConfig() {
  try { return JSON.parse(localStorage.getItem(LS_AI) || 'null'); }
  catch { return null; }
}

export function setAIConfig(cfg) {
  if (cfg && cfg.key) {
    localStorage.setItem(LS_AI, JSON.stringify({ key: cfg.key.trim(), model: cfg.model || DEFAULT_MODEL }));
  } else {
    localStorage.removeItem(LS_AI);
  }
}

export function aiEnabled() {
  const c = getAIConfig();
  return !!(c && c.key);
}

const SYSTEM = `You are a market analyst assistant for a Marine Fuel 0.5 (VLSFO) bunker trader in Singapore.
Summarise the supplied news text into a concise, factual brief focused on what matters for marine fuel prices and spreads (Platts MOPS Marine Fuel 0.5, MOC swaps, crude oil, HSFO, gasoil).
Rules:
- Be factual. Never invent numbers, dates, names, or sources that are not in the text.
- "price_read" is your judgement of the likely directional impact on Marine Fuel 0.5 and related markets.
- Keep each field tight (1-2 sentences). Use an empty string "" for any field the text does not support.`;

const SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    what_happened: { type: 'string' },
    why_it_matters: { type: 'string' },
    price_read: { type: 'string', enum: ['bull', 'bear', 'neutral'] },
    instruments: { type: 'string' },
    key_numbers: { type: 'string' },
    source: { type: 'string' },
  },
  required: ['headline', 'what_happened', 'why_it_matters', 'price_read', 'instruments', 'key_numbers', 'source'],
  additionalProperties: false,
};

export async function summarizeArticle(text) {
  const cfg = getAIConfig();
  if (!cfg || !cfg.key) throw new Error('No Anthropic API key set — add one in Settings.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model || DEFAULT_MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    }),
  });

  if (!res.ok) {
    let msg = `${res.status}`;
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e).slice(0, 200); }
    catch { msg = `${res.status} ${res.statusText}`; }
    if (res.status === 401) msg = 'Invalid API key (401). Check the key in Settings.';
    throw new Error(msg);
  }

  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === 'text');
  if (!block) throw new Error('No summary returned.');
  return JSON.parse(block.text);
}

// Lightweight credential check used by the Settings "Test" button.
export async function aiTest() {
  const cfg = getAIConfig();
  if (!cfg || !cfg.key) throw new Error('No API key set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: cfg.model || DEFAULT_MODEL, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid API key (401)');
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return true;
}
