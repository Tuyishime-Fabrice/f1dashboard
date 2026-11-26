import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFilters } from "@/state/filters";

/** Global season selector. `minYear` limits it on pages whose data starts later. */
export function SeasonSelect({ minYear, years: only, className }: { minYear?: number; years?: number[]; className?: string }) {
  const { seasons, season, setSeason } = useFilters();
  const list = seasons.filter((s) => (!minYear || s.year >= minYear) && (!only || only.includes(s.year)));
  const decades = new Map<number, typeof list>();
  for (const s of list) {
    const d = Math.floor(s.year / 10) * 10;
    decades.set(d, [...(decades.get(d) ?? []), s]);
  }
  const value = list.some((s) => s.year === season) ? String(season) : undefined;
  return (
    <Select value={value ?? ""} onValueChange={(v) => setSeason(Number(v))}>
      <SelectTrigger className={className ?? "w-[118px]"} aria-label="Season">
        <SelectValue placeholder="Season" />
      </SelectTrigger>
      <SelectContent>
        {[...decades.entries()].map(([d, items]) => (
          <SelectGroup key={d}>
            <SelectLabel>{d}s</SelectLabel>
            {items.map((s) => (
              <SelectItem key={s.year} value={String(s.year)}>
                {s.year}
                {s.in_progress ? " · live" : ""}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
