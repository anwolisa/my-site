// GET /api/levels — current price vs previous day/week/month high, low, midpoint
// for NQ, ES and GC futures. Data: Yahoo Finance (free, unofficial, may be delayed).
const { computeLevels } = require("./_levels");

const SYMBOLS = [
  { id: "NQ", yahoo: "NQ=F", name: "Nasdaq 100 E-mini" },
  { id: "ES", yahoo: "ES=F", name: "S&P 500 E-mini" },
  { id: "GC", yahoo: "GC=F", name: "Gold" },
];

async function fetchChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (my-site levels)" } });
  if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || "no data");
  return result;
}

module.exports = async (req, res) => {
  const instruments = await Promise.all(
    SYMBOLS.map(async (s) => {
      try {
        return { ...s, ...computeLevels(await fetchChart(s.yahoo)) };
      } catch (err) {
        return { ...s, error: String(err.message || err) };
      }
    })
  );
  // Cache at Vercel's edge for 60s so many visitors don't hammer the data source.
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  res.status(200).json({ generatedAt: new Date().toISOString(), instruments });
};
