// Shared big arrow for bias calls (used on the home page and the calendar page).
const BIAS_WORD = { bullish: "Bullish", bearish: "Bearish", neutral: "Neutral" };
function biasArrow(verdict) {
  const color = verdict === "bullish" ? "#2fbf71" : verdict === "bearish" ? "#e5534b" : "#8a94a3";
  // Up arrow; rotated 180° for bearish, 90° (pointing right) for neutral.
  const rot = verdict === "bullish" ? 0 : verdict === "bearish" ? 180 : 90;
  return `<svg class="arrow" viewBox="0 0 100 100" role="img" aria-label="${BIAS_WORD[verdict]}">
    <g transform="rotate(${rot} 50 50)">
      <path d="M50 8 L90 52 L64 52 L64 92 L36 92 L36 52 L10 52 Z" fill="${color}" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>
    </g></svg>`;
}
