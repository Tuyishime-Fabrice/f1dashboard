import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RaceRef } from "@/lib/api";
import { shortRace } from "@/lib/format";

export function RaceSelect({ races, value, onChange, allowAll, className, disabledIds }: { races: RaceRef[]; value: number | null; onChange: (id: number | null) => void; allowAll?: string; className?: string; disabledIds?: Set<number> }) {
  return (
    <Select value={value ? String(value) : "all"} onValueChange={(v) => onChange(v === "all" ? null : Number(v))}>
      <SelectTrigger className={className ?? "w-[220px]"} aria-label="Race">
        <SelectValue placeholder="Select race" />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value="all">{allowAll}</SelectItem>}
        {[...races].sort((a, b) => b.round - a.round).map((r) => (
          <SelectItem key={r.race_id} value={String(r.race_id)} disabled={disabledIds?.has(r.race_id)}>
            R{r.round} · {shortRace(r.name)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
