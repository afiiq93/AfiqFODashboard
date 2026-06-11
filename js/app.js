import { PRODUCTS, productByCode } from './store.js';
import { renderDashboard } from './dashboard.js';
import { renderEntry } from './entry.js';
import { renderNews } from './news.js';
import { renderSettings } from './settings.js';
import { renderSwaps } from './swaps.js';

const state = {
  product: localStorage.getItem('afo:product') || 'MF05',
};

const routes = {
  dashboard: renderDashboard,
  entry: renderEntry,
  swaps: renderSwaps,
  news: renderNews,
  settings: renderSettings,
};

function currentRoute() {
  const hash = location.hash.replace(/^#\//, '');
  return routes[hash] ? hash : 'dashboard';
}

function setActiveNav(route) {
  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === route);
  });
}

async function render() {
  const route = currentRoute();
  setActiveNav(route);
  const view = document.getElementById('view');
  view.innerHTML = '<div class="empty">Loading…</div>';
  try {
    await routes[route](view, state);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="notice">Something went wrong rendering this page: ${err.message}</div>`;
  }
}

function initProductSelect() {
  const sel = document.getElementById('productSelect');
  sel.innerHTML = PRODUCTS.map(
    (p) => `<option value="${p.code}">${p.name}${p.active ? '' : ' (coming soon)'}</option>`
  ).join('');
  sel.value = state.product;
  sel.addEventListener('change', () => {
    state.product = sel.value;
    localStorage.setItem('afo:product', state.product);
    render();
  });
}

export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

// expose for sub-modules that re-render after mutations
export function rerender() { render(); }
export function getState() { return state; }

window.addEventListener('hashchange', render);
initProductSelect();
if (!location.hash) location.hash = '#/dashboard';
render();
