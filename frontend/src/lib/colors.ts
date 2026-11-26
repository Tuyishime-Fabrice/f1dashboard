/**
 * Presentation colours. Team colours are identity encodings (the colour follows
 * the constructor, never its rank) and approximate each team's livery, tuned for
 * legibility on a white surface. Unknown constructors fall back to a fixed
 * categorical order keyed by id, so a team keeps its colour across filters.
 */

const TEAM: Record<string, string> = {
  mercedes: "#00A19C",
  ferrari: "#DC0000",
  red_bull: "#2B4FC4",
  mclaren: "#FF8000",
  aston_martin: "#00594F",
  alpine: "#F06EAA",
  williams: "#1AA3E8",
  rb: "#6692FF",
  alphatauri: "#2B4562",
  toro_rosso: "#469BFF",
  haas: "#7A8088",
  sauber: "#9B0000",
  kick_sauber: "#22B14C",
  alfa: "#900000",
  audi: "#7A1E2C",
  cadillac: "#3C4A5E",
  racing_point: "#F596C8",
  force_india: "#E66AA8",
  renault: "#E8B400",
  lotus_f1: "#B59A3B",
  team_lotus: "#1F5C3A",
  lotus: "#1F5C3A",
  brabham: "#8A6D1F",
  tyrrell: "#2E5C8A",
  benetton: "#00A651",
  brawn: "#8DBF00",
  toyota: "#CC1E2B",
  honda: "#8E8E8E",
  bmw_sauber: "#2F7FC1",
  jaguar: "#0B5C2E",
  jordan: "#D4AF00",
  minardi: "#4A4A4A",
  stewart: "#8A96A3",
  ligier: "#0055A5",
  prost: "#1F3B8A",
  bar: "#B8B8B8",
  vanwall: "#00563F",
  maserati: "#7A3B69",
  cooper: "#1F4E79",
  brm: "#2E7D32",
  matra: "#2C6DB5",
  march: "#E07A1F",
  alfa_romeo: "#900000",
  wolf: "#C7A600",
  shadow: "#333333",
  hesketh: "#6B6B6B",
  lancia: "#1F3F8A",
  kurtis_kraft: "#9A6B3F",
  watson: "#5A7D9A",
  epperly: "#7A5C3F",
};

/** Categorical fallback (validated default order from the dataviz palette). */
export const CATEGORICAL = ["#257de0", "#f47230", "#00b894", "#f2a600", "#ee7fac", "#008a17", "#6a4ce2", "#ec4647"];

export function teamColor(ref?: string | null, id?: number | null): string {
  if (ref && TEAM[ref]) return TEAM[ref];
  const key = id ?? (ref ? [...ref].reduce((a, c) => a + c.charCodeAt(0), 0) : 0);
  return CATEGORICAL[Math.abs(key) % CATEGORICAL.length];
}

export const COMPOUND: Record<string, { color: string; label: string; text: string }> = {
  SOFT: { color: "#E10600", label: "Soft", text: "#fff" },
  MEDIUM: { color: "#F2C200", label: "Medium", text: "#16181b" },
  HARD: { color: "#E9ECEF", label: "Hard", text: "#16181b" },
  INTERMEDIATE: { color: "#2E9E44", label: "Intermediate", text: "#fff" },
  WET: { color: "#1C6FD1", label: "Wet", text: "#fff" },
  UNKNOWN: { color: "#B9BEC4", label: "Unknown", text: "#16181b" },
};

export const INK = {
  text: "#16181b",
  muted: "#6b7178",
  faint: "#9aa1a8",
  grid: "#eceef0",
  axis: "#d9dde1",
  neutral: "#3a3f45",
  neutralLight: "#c4c9ce",
  accent: "#E10600",
  gain: "#257de0",
  loss: "#ec4647",
};

/** One-hue sequential ramp (light -> dark) for heatmaps. */
export const SEQ_BLUE = ["#cce3fd", "#9dc8f7", "#6aabf1", "#338ced", "#2370cd", "#1757ac", "#0e3d7e"];
