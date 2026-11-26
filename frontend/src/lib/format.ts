const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export const fmt = {
  int: (v: number | null | undefined) => (v == null ? "—" : nf0.format(v)),
  num: (v: number | null | undefined, digits = 1) =>
    v == null ? "—" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v),
  points: (v: number | null | undefined) => (v == null ? "—" : nf1.format(v)),
  pct: (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${v.toFixed(digits)}%`),
  secs: (ms: number | null | undefined, digits = 2) => (ms == null ? "—" : `${(ms / 1000).toFixed(digits)}s`),
  signed: (v: number | null | undefined, digits = 0) =>
    v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`,
  date: (iso: string | null | undefined) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—",
  shortDate: (iso: string | null | undefined) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—",
  ord: (n: number | null | undefined) => {
    if (n == null) return "—";
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  },
};

export const shortRace = (name: string) => name.replace(" Grand Prix", " GP");

/** Three-letter label: official code, or the first three letters of the surname. */
export const driverCode = (d: { code?: string | null; surname?: string | null; driver_name?: string | null }) =>
  d.code ?? (d.surname ?? d.driver_name?.split(" ").slice(-1)[0] ?? "???").slice(0, 3).toUpperCase();

/** Row labels that stay unique: official code, else surname (with initial when surnames repeat). */
export function uniqueDriverLabels(ds: { code?: string | null; surname?: string | null; driver_name?: string | null }[]): string[] {
  const base = ds.map((d) => d.code ?? d.surname ?? d.driver_name ?? "?");
  const counts = new Map<string, number>();
  base.forEach((b) => counts.set(b, (counts.get(b) ?? 0) + 1));
  return ds.map((d, i) => {
    if ((counts.get(base[i]) ?? 0) < 2) return base[i];
    const first = d.driver_name?.split(" ")[0] ?? "";
    return `${first.slice(0, 1)}. ${d.surname ?? base[i]}`;
  });
}
