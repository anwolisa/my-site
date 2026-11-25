// GET /api/calendar — this week's US releases (forecast, previous, actual) and
// rules-based NQ bias calls for the day, week and month.
const C = require("./_calendar");
const { computeLevels } = require("./_levels");
const { fetchChart } = require("./_yahoo");

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { "User-Agent": "Mozilla/5.0 (my-site calendar)" } });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}

async function fredSeries(id, key, fetchImpl) {
  const q = `series_id=${id}&api_key=${key}&file_type=json`;
  const [info, obs] = await Promise.all([
    getJson(`${C.FRED}/series?${q}`, fetchImpl),
    getJson(`${C.FRED}/series/observations?${q}&sort_order=desc&limit=14`, fetchImpl),
  ]);
  return { lastUpdated: C.parseFredTime(info.seriess?.[0]?.last_updated), obs: obs.observations || [] };
}

async function build({ fetchImpl = fetch, fredKey = process.env.FRED_API_KEY, now = Date.now() } = {}) {
  const notes = [];
  const ff = await getJson(C.FF_URL, fetchImpl);
  const rows = C.buildRows(ff);

  // Actuals from FRED (only for series this week's releases need).
  let fred = null;
  if (fredKey) {
    fred = {};
    const ids = [...new Set(rows.filter((r) => r.spec).map((r) => r.spec.series))];
    await Promise.all(ids.map(async (id) => {
      try { fred[id] = await fredSeries(id, fredKey, fetchImpl); }
      catch (e) { notes.push(`FRED ${id}: ${e.message}`); }
    }));
  } else {
    notes.push("Actual results need a free FRED API key (set FRED_API_KEY in Vercel).");
  }
  const finished = rows.map((r) => C.finishRow(r, fred, now));

  let levels = null;
  try { levels = computeLevels(await fetchChart("NQ=F", fetchImpl)); }
  catch (e) { notes.push(`NQ price: ${e.message}`); }

  return {
    generatedAt: new Date(now).toISOString(),
    nqPrice: levels?.price ?? null,
    calls: C.buildCalls(finished, levels, now),
    events: finished,
    notes,
  };
}

module.exports = async (req, res) => {
  try {
    const data = await build();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
module.exports.build = build;
