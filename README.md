# AfiqFODashboard

A personal dashboard for tracking marine fuel prices, swaps and spreads — built for learning the market and keeping a clean log of daily moves.

Live focus today: **Marine Fuel 0.5** (Platts MOPS Singapore). **Gasoil 10ppm** and **HSFO** are scaffolded and can be switched on once you start logging them.

## What it does

- **Dashboard** — outright prices (MOPS, MOC M swap, MOC M+1 swap) and the three spreads you track, on interactive charts with 1M / 3M / 6M / All ranges, summary cards with day-on-day moves, and a recent-data table.
- **Data Entry** — log a day by typing just **MOPS, MOC M and MOC M+1**. The three differentials are calculated for you. A "month-end / M swap not assessed" toggle handles the days the front-month swap isn't published. Import history from CSV/JSON, export anytime.
- **News** — log the headlines that move the market, tag each **bullish / bearish / neutral**, and add your notes. Each item shows how MOPS moved that day (d/d) so you can connect the news to the price.

### The spreads, defined

| Field | Meaning | Formula |
|-------|---------|---------|
| `MOPS/M+1` | Physical vs second-month swap | MOPS − MOC M+1 |
| `MOC M/M+1` | Swap structure (backwardation/contango) | MOC M − MOC M+1 |
| `MOPS/M` | Physical premium over front swap | MOPS − MOC M |

`MOPS/M` and `MOC M/M+1` show **n/a** on days the M swap isn't assessed (typically month-end), matching how your spreadsheet handled it.

## Running it

It's a plain static site — no build step.

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000
```

### Deploying online (free)

Push to GitHub and enable **GitHub Pages** (Settings → Pages → deploy from the `main` branch, root). Your dashboard will be live at `https://<user>.github.io/AfiqFODashboard/`. Works on your phone too.

## How your data is stored — and the spreadsheet question

Your full history from the spreadsheet has been migrated into `data/marine-fuel-05.json` (68 days, Mar–Jun 2026). That file is the **committed, version-controlled baseline** — it loads on any device, no setup.

Day-to-day entries you add in the browser are saved locally (this browser) on top of that baseline, and you can **Export JSON** to download an updated dataset to commit back into `data/` (or send it to me to commit) — that makes it permanent and visible everywhere.

**My recommendation:** make this dashboard your single source of truth instead of keeping a parallel spreadsheet. Entry is faster here (you only type 3 numbers; spreads auto-calc), nothing gets out of sync, and you can always **Export CSV** if you need a spreadsheet copy for something. If you'd rather keep editing in Excel, that's fine too — just drop the CSV into **Data Entry → Import** whenever you update.

If you later want true cross-device sync (edit on your phone, see it on your laptop instantly) without exporting/committing, the next step is wiring a small free cloud database (e.g. Supabase) behind the same Data Entry form — ask and I'll set it up.

## Project layout

```
index.html              app shell + navigation
styles.css              dark trading-desk theme
js/
  app.js                router, product switcher, toasts
  store.js              data layer: seed + local edits, differential math, import/export
  dashboard.js          charts, cards, table
  entry.js              daily entry form, CSV/JSON import-export
  news.js               news log with price context
data/
  marine-fuel-05.json   migrated history (the committed baseline)
```
