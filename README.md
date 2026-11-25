# Levels — NQ · ES · GC

Shows where NQ, ES and GC futures are trading relative to the high, low and midpoint
of the previous day, week and month.

- `index.html` — the page (auto-refreshes every 60s). Add `?demo` to the URL to view sample data.
- `api/levels.js` — Vercel serverless function that fetches daily bars from Yahoo Finance
  and returns the levels as JSON at `/api/levels`.
- `api/_levels.js` — the level calculations.

Deploy: import this repo in Vercel (no build settings needed).

`calendar.html` + `api/calendar.js` — this week's US releases and the NQ bias. Actual results need a free FRED API key set as `FRED_API_KEY` in Vercel (Settings → Environment Variables).

Data is Yahoo Finance continuous front-month futures; it may be delayed and is not for order entry.
