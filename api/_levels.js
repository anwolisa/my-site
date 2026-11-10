// Pure logic: turns daily bars into previous day / week / month levels.
// Kept separate from the API route so it can be tested without the network.

// Format a unix timestamp as a calendar date in the exchange's time zone.
function dateKey(ts, tz) {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts * 1000));
}

// Monday of the week containing a YYYY-MM-DD date.
function weekKey(day) {
  const d = new Date(day + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function monthKey(day) {
  return day.slice(0, 7);
}

// Combine bars into one high/low range.
function rangeOf(bars) {
  if (!bars.length) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const b of bars) {
    if (b.high > high) high = b.high;
    if (b.low < low) low = b.low;
  }
  return { high, low, mid: (high + low) / 2, from: bars[0].day, to: bars[bars.length - 1].day };
}

// Where price sits relative to a range.
function position(price, r) {
  if (!r) return null;
  const span = r.high - r.low;
  const pct = span > 0 ? ((price - r.low) / span) * 100 : 50;
  let zone;
  if (price > r.high) zone = "above-high";
  else if (price >= r.mid) zone = "upper-half";
  else if (price >= r.low) zone = "lower-half";
  else zone = "below-low";
  return {
    ...r,
    pct,
    zone,
    distHigh: price - r.high,
    distMid: price - r.mid,
    distLow: price - r.low,
  };
}

// The period just before the one containing currentKey.
function previousGroup(bars, keyFn, currentKey) {
  const earlier = bars.filter((b) => keyFn(b.day) < currentKey);
  if (!earlier.length) return [];
  const prevKey = keyFn(earlier[earlier.length - 1].day);
  return earlier.filter((b) => keyFn(b.day) === prevKey);
}

// chart: the `chart.result[0]` object from Yahoo's v8 chart API (daily bars).
function computeLevels(chart) {
  const meta = chart.meta;
  const tz = meta.exchangeTimezoneName || "America/New_York";
  const q = chart.indicators.quote[0];
  const bars = [];
  chart.timestamp.forEach((ts, i) => {
    if (q.high[i] == null || q.low[i] == null) return;
    bars.push({ day: dateKey(ts, tz), high: q.high[i], low: q.low[i], close: q.close[i] });
  });
  if (!bars.length) throw new Error("no bars");

  const price = meta.regularMarketPrice ?? bars[bars.length - 1].close;
  // The session the latest price belongs to is the "current" one.
  const currentDay = meta.regularMarketTime ? dateKey(meta.regularMarketTime, tz) : bars[bars.length - 1].day;

  const prevDayBars = bars.filter((b) => b.day < currentDay).slice(-1);

  return {
    price,
    asOf: meta.regularMarketTime || null,
    currentDay,
    day: position(price, rangeOf(prevDayBars)),
    week: position(price, rangeOf(previousGroup(bars, weekKey, weekKey(currentDay)))),
    month: position(price, rangeOf(previousGroup(bars, monthKey, monthKey(currentDay)))),
  };
}

module.exports = { computeLevels, weekKey, dateKey };
