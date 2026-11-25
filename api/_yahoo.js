// Shared Yahoo Finance fetch for daily futures bars.
async function fetchChart(symbol, fetchImpl = fetch) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  const res = await fetchImpl(url, { headers: { "User-Agent": "Mozilla/5.0 (my-site levels)" } });
  if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || "no data");
  return result;
}
module.exports = { fetchChart };
