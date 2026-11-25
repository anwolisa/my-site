// Economic calendar + NQ bias logic. Pure functions where possible so it can be tested offline.
//
// Sources:
//   Forecast / previous / schedule: Forex Factory weekly feed (free, no key)
//   Actual results:                 FRED, the St. Louis Fed's data service (free key: FRED_API_KEY)

const FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const FRED = "https://api.stlouisfed.org/fred";

// How each release is scored for NQ while the Fed is fighting inflation
// ("good news for the economy is bad news for rates-sensitive tech").
// dir = what a number ABOVE forecast does to NQ: -1 bearish, +1 bullish. weight = importance.
// calc: how the actual is built from FRED: pct_mom, pct_yoy, direct (already a %), level, diff.
const SPECS = [
  { key: "core_pce_mom", match: /^core pce price index m\/m/i, label: "Core PCE Price Index (MoM)", series: "PCEPILFE", calc: "pct_mom", dir: -1, weight: 3, group: "Inflation" },
  { key: "core_pce_yoy", match: /^core pce price index y\/y/i, label: "Core PCE Price Index (YoY)", series: "PCEPILFE", calc: "pct_yoy", dir: -1, weight: 2, group: "Inflation", extraOf: "core_pce_mom" },
  { key: "pce_mom", match: /^pce price index m\/m/i, label: "PCE Price Index (MoM)", series: "PCEPI", calc: "pct_mom", dir: -1, weight: 2, group: "Inflation", extraOf: "core_pce_mom" },
  { key: "pce_yoy", match: /^pce price index y\/y/i, label: "PCE Price Index (YoY)", series: "PCEPI", calc: "pct_yoy", dir: -1, weight: 1, group: "Inflation", extraOf: "core_pce_mom" },
  { key: "income", match: /^personal income m\/m/i, label: "Personal Income (MoM)", series: "PI", calc: "pct_mom", dir: -1, weight: 0.5, group: "Consumer" },
  { key: "spending", match: /^personal spending m\/m/i, label: "Personal Spending (MoM)", series: "PCE", calc: "pct_mom", dir: -1, weight: 1, group: "Consumer" },
  { key: "real_pce", match: /^real personal (consumption|spending)/i, label: "Real Personal Consumption (MoM)", series: "PCEC96", calc: "pct_mom", dir: -1, weight: 0.5, group: "Consumer", extraOf: "core_pce_mom" },
  { key: "gdp", match: /^(advance|prelim|final) gdp q\/q/i, label: "GDP (QoQ, annualized)", series: "A191RL1Q225SBEA", calc: "direct", dir: -1, weight: 1, group: "Growth" },
  { key: "gdp_price", match: /^(advance|prelim|final) gdp price index q\/q/i, label: "GDP Price Index (QoQ)", series: "GDPCTPI", calc: "pct_qoq_ann", dir: -1, weight: 1, group: "Inflation" },
  { key: "gdp_core_pce", match: /^(advance|prelim|final) core pce prices? q\/q/i, label: "Core PCE Prices (QoQ, from GDP)", series: "DPCCRV1Q225SBEA", calc: "direct", dir: -1, weight: 1, group: "Inflation", extraOf: "gdp" },
  { key: "durables", match: /^durable goods orders m\/m/i, label: "Durable Goods Orders (MoM)", series: "DGORDER", calc: "pct_mom", dir: -1, weight: 0.5, group: "Growth" },
  { key: "core_durables", match: /^core durable goods orders m\/m/i, label: "Durable Goods ex Transportation (MoM)", series: "ADXTNO", calc: "pct_mom", dir: -1, weight: 0.5, group: "Growth" },
  { key: "durables_ex_def", match: /^durable goods.*ex.?defen[cs]e/i, label: "Durable Goods ex Defense (MoM)", series: "ADXDNO", calc: "pct_mom", dir: -1, weight: 0.25, group: "Growth", extraOf: "durables" },
  { key: "capex", match: /^(non.?defen[cs]e|core) capital goods/i, label: "Non-Defense Capital Goods ex Aircraft (MoM)", series: "NEWORDER", calc: "pct_mom", dir: -1, weight: 0.5, group: "Growth", extraOf: "durables" },
  { key: "claims", match: /^unemployment claims/i, label: "Initial Jobless Claims", series: "ICSA", calc: "level", scale: 1 / 1000, suffix: "K", dir: +1, weight: 0.5, group: "Jobs" },
  { key: "new_home", match: /^new home sales/i, label: "New Home Sales", series: "HSN1F", calc: "level", scale: 1, suffix: "K", dir: -1, weight: 0.5, group: "Housing" },
];

// Parse "0.3%", "201K", "-19B", "2.0M" → number in the string's own unit, plus formatting hints.
function parseNum(s) {
  if (s == null || s === "") return null;
  const m = String(s).trim().match(/^(-?\d+(?:\.\d+)?)\s*([%KMBT]?)/i);
  if (!m) return null;
  const dec = (m[1].split(".")[1] || "").length;
  return { value: parseFloat(m[1]), suffix: m[2].toUpperCase(), decimals: dec };
}

function fmtNum(v, suffix, decimals) {
  if (v == null || !isFinite(v)) return "";
  return `${v.toFixed(decimals)}${suffix}`;
}

// Build the actual from FRED observations (newest first).
function actualFromObs(spec, obs) {
  const v = obs.map((o) => (o.value === "." ? null : parseFloat(o.value)));
  if (v[0] == null) return null;
  switch (spec.calc) {
    case "pct_mom": return v[1] ? (v[0] / v[1] - 1) * 100 : null;
    case "pct_qoq_ann": return v[1] ? ((v[0] / v[1]) ** 4 - 1) * 100 : null;
    case "pct_yoy": return v[12] ? (v[0] / v[12] - 1) * 100 : null;
    case "direct": return v[0];
    case "level": return v[0] * (spec.scale ?? 1);
    case "diff": return v[1] != null ? (v[0] - v[1]) * (spec.scale ?? 1) : null;
  }
  return null;
}

// FRED's last_updated looks like "2026-11-25 07:47:13-06".
function parseFredTime(s) {
  if (!s) return null;
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const t = Date.parse(iso);
  return isNaN(t) ? null : t;
}


// Short plain-English description for each release (matched on the feed's title).
const DESCRIPTIONS = [
  [/core pce price index/i, "Monthly change in prices people pay, excluding food and energy. The Fed's preferred inflation gauge."],
  [/pce price index/i, "Monthly change in prices people pay, including food and energy."],
  [/core cpi/i, "Change in consumer prices excluding food and energy. The most-watched monthly inflation number."],
  [/\bcpi\b/i, "Change in the prices of a basket of consumer goods and services."],
  [/core ppi/i, "Change in prices businesses receive, excluding food and energy. An early sign of consumer inflation."],
  [/\bppi\b/i, "Change in prices businesses receive for their goods and services."],
  [/gdp price index/i, "Inflation across the whole economy, from the GDP report."],
  [/gdp/i, "How fast the US economy grew last quarter, annualized and after inflation."],
  [/non-?farm (employment|payrolls)/i, "Number of jobs added last month, outside farming. The biggest monthly jobs number."],
  [/unemployment rate/i, "Share of people looking for work who can't find a job."],
  [/average hourly earnings/i, "Change in average pay per hour. Fast wage growth can feed inflation."],
  [/unemployment claims|jobless claims/i, "New unemployment filings last week. A quick read on layoffs."],
  [/adp/i, "Private payroll firm ADP's estimate of jobs added."],
  [/jolts|job openings/i, "Number of open jobs. Shows how much demand there is for workers."],
  [/federal funds rate|fomc statement/i, "The Fed's interest-rate decision and its statement on the economy."],
  [/fomc press conference/i, "The Fed chair explains the rate decision and answers questions."],
  [/fomc meeting minutes/i, "Detailed notes from the last Fed meeting, showing how officials are leaning."],
  [/(fed )?chair .* speaks|powell speaks/i, "Speech by the Fed chair. Hints about future rates can move markets."],
  [/core retail sales/i, "Change in store and online sales, excluding cars."],
  [/retail sales/i, "Change in total store and online sales. Shows how much consumers are spending."],
  [/ism manufacturing pmi/i, "Survey of factory managers. Above 50 means manufacturing is growing."],
  [/ism services pmi/i, "Survey of service-company managers. Above 50 means services are growing."],
  [/flash .*pmi/i, "Early survey of purchasing managers. Above 50 means activity is growing."],
  [/prelim uom inflation expectations|inflation expectations/i, "What consumers expect inflation to be over the next year."],
  [/uom consumer sentiment|consumer sentiment/i, "Survey of how confident consumers feel about the economy."],
  [/consumer confidence/i, "Survey of how confident consumers feel about the economy and jobs."],
  [/personal spending/i, "Monthly change in how much consumers spent."],
  [/personal income/i, "Monthly change in how much people earned."],
  [/core durable goods/i, "Orders for long-lasting goods, excluding volatile transport orders."],
  [/durable goods/i, "Orders for long-lasting goods such as machines and planes."],
  [/new home sales/i, "Number of newly built homes sold, at an annual pace."],
  [/existing home sales/i, "Number of previously owned homes sold, at an annual pace."],
  [/crude oil inventories/i, "Weekly change in US crude oil stockpiles."],
];
function describe(title) {
  const hit = DESCRIPTIONS.find(([re]) => re.test(title));
  return hit ? hit[1] : "";
}

// Merge FF events with spec rows (including extras not in FF) for US releases.
function buildRows(ffEvents) {
  // High-impact (red) and medium-impact (orange) US releases.
  const us = ffEvents.filter((e) => e.country === "USD" && (e.impact === "High" || e.impact === "Medium"));
  const rows = [];
  const seen = new Set();
  for (const e of us) {
    const spec = SPECS.find((s) => s.match.test(e.title));
    if (spec) seen.add(spec.key);
    rows.push({ title: spec ? spec.label : e.title, ffTitle: e.title, desc: describe(e.title), date: e.date, impact: e.impact, forecast: e.forecast || "", previous: e.previous || "", spec });
  }
  rows.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || (a.impact === "Extra") - (b.impact === "Extra"));
  return rows;
}

// Decide what each row's actual is, and score it.
function finishRow(row, fred, now) {
  const out = { ...row, actual: "", surprise: null, effect: 0 };
  delete out.spec;
  const spec = row.spec;
  out.group = spec?.group || "Other";
  out.scored = !!(spec && spec.weight);
  if (!spec || !fred || !fred[spec.series]) return out;
  const { lastUpdated, obs } = fred[spec.series];
  const due = Date.parse(row.date);
  const released = now >= due && lastUpdated && lastUpdated >= due;
  const f0 = parseNum(row.forecast);
  const sfx = f0?.suffix || spec.suffix || (spec.calc === "level" ? "" : "%");
  const dec0 = f0 ? f0.decimals : 1;
  if (!out.previous) {
    // Feed had no previous (extra rows): take it from FRED.
    const prev = actualFromObs(spec, released ? obs.slice(1) : obs);
    if (prev != null) out.previous = fmtNum(prev, sfx, dec0);
  }
  if (!released) return out;
  const a = actualFromObs(spec, obs);
  if (a == null) return out;
  const f = parseNum(row.forecast);
  const suffix = f?.suffix || spec.suffix || (spec.calc === "level" ? "" : "%");
  const decimals = f ? f.decimals : 1;
  out.actual = fmtNum(a, suffix, decimals);
  if (!f) return out;
  const diff = parseFloat(a.toFixed(decimals)) - f.value;
  out.surprise = diff > 0 ? "above" : diff < 0 ? "below" : "inline";
  out.effect = Math.sign(diff) * spec.dir * spec.weight;
  return out;
}

const ZONE_SCORE = { "above-high": 2, "upper-half": 1, "lower-half": -1, "below-low": -2 };
const ZONE_TEXT = { "above-high": "above the high", "upper-half": "above the midpoint", "lower-half": "below the midpoint", "below-low": "below the low" };

function verdict(score) {
  if (score >= 1) return "bullish";
  if (score <= -1) return "bearish";
  return "neutral";
}

// One call (day/week/month) from price position plus data surprises.
function makeCall(label, levelPeriod, levels, rows) {
  const reasons = [];
  let score = 0;
  const p = levels?.[levelPeriod];
  if (p) {
    const s = ZONE_SCORE[p.zone];
    score += s;
    reasons.push({ text: `NQ is ${ZONE_TEXT[p.zone]} of the prior ${levelPeriod}`, effect: s });
  }
  for (const r of rows) {
    if (!r.effect) continue;
    score += r.effect;
    reasons.push({ text: `${r.title} ${r.surprise === "above" ? "above" : "below"} forecast (${r.actual} vs ${r.forecast})`, effect: r.effect });
  }
  const pending = rows.filter((r) => r.scored && r.forecast && !r.actual && Date.parse(r.date) > Date.now() - 6 * 3600e3).length;
  return { label, score, verdict: verdict(score), reasons, pending };
}

function etDay(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function buildCalls(rows, levels, now) {
  const today = etDay(new Date(now));
  const todayRows = rows.filter((r) => etDay(new Date(r.date)) === today);
  return {
    day: makeCall("Today", "day", levels, todayRows),
    week: makeCall("This week", "week", levels, rows),
    month: makeCall("This month", "month", levels, []),
  };
}

module.exports = { describe, SPECS, FF_URL, FRED, parseNum, actualFromObs, parseFredTime, buildRows, finishRow, buildCalls, etDay };
