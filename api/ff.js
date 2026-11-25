// GET /api/ff — the Forex Factory weekly feed, cached at Vercel's edge for an hour.
// The feed rate-limits heavy callers (HTTP 429), and forecasts rarely change during the day,
// so every other function reads this cached copy instead of hitting the feed directly.
const { FF_URL } = require("./_calendar");

module.exports = async (req, res) => {
  try {
    const r = await fetch(FF_URL, { headers: { "User-Agent": "Mozilla/5.0 (my-site calendar)" } });
    if (!r.ok) throw new Error(`nfs.faireconomy.media returned ${r.status}`);
    const data = await r.json();
    // Fresh for 1 hour; keep serving the old copy for up to a day if the feed is down.
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400");
    res.status(200).json(data);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e.message || e) });
  }
};
