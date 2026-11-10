# Levels — NQ · ES · GC

Shows where NQ, ES and GC futures are trading relative to the high, low and midpoint
of the previous day, week and month.

- `index.html` — the page (auto-refreshes every 60s). Add `?demo` to the URL to view sample data.
- `api/levels.js` — Vercel serverless function that fetches daily bars from Yahoo Finance
  and returns the levels as JSON at `/api/levels`.
- `api/_levels.js` — the level calculations.

Deploy: import this repo in Vercel (no build settings needed).

Data is Yahoo Finance continuous front-month futures; it may be delayed and is not for order entry.
