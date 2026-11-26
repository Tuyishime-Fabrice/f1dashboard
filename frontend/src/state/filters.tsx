import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { useApi, type Season } from "@/lib/api";

/**
 * Global filters live in the URL so every view is shareable and the season
 * survives navigation. `season` is global; `race`, `circuit`, `drivers`,
 * `constructors` are contextual and read by the pages that use them.
 */
interface Filters {
  seasons: Season[];
  season: number;
  seasonInfo: Season | undefined;
  setSeason: (y: number) => void;
  get: (key: string) => string | null;
  getIds: (key: string) => number[];
  set: (patch: Record<string, string | number | number[] | null>) => void;
  ready: boolean;
}

const Ctx = createContext<Filters | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const { data: seasons = [] } = useApi<Season[]>("/meta/seasons");
  const latest = seasons[0]?.year;
  const raw = Number(params.get("season"));
  const season = seasons.some((s) => s.year === raw) ? raw : latest ?? 0;

  const set = useCallback(
    (patch: Record<string, string | number | number[] | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) next.delete(k);
            else next.set(k, Array.isArray(v) ? v.join(",") : String(v));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const value = useMemo<Filters>(
    () => ({
      seasons,
      season,
      seasonInfo: seasons.find((s) => s.year === season),
      setSeason: (y) => set({ season: y, race: null, circuit: null }),
      get: (k) => params.get(k),
      getIds: (k) =>
        (params.get(k) ?? "")
          .split(",")
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0),
      set,
      ready: seasons.length > 0,
    }),
    [seasons, season, params, set],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilters() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFilters must be used inside FiltersProvider");
  return ctx;
}
