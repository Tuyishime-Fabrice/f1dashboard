import { TeamSwatch } from "@/components/common/Team";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ResultRow } from "@/lib/api";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Race classification table. Grid 0 (pit lane / unknown) is shown as "PL". */
export function ResultsTable({ rows, compact, maxHeight }: { rows: ResultRow[]; compact?: boolean; maxHeight?: number }) {
  return (
    <div className="overflow-y-auto scrollbar-thin" style={{ maxHeight }}>
      <Table>
        <TableHeader className="sticky top-0 z-[1] bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">Pos</TableHead>
            <TableHead>Driver</TableHead>
            {!compact && <TableHead>Constructor</TableHead>}
            <TableHead className="text-right">Grid</TableHead>
            <TableHead className="text-right">+/−</TableHead>
            <TableHead className="text-right">Pts</TableHead>
            <TableHead className="text-right">Time / status</TableHead>
            {!compact && <TableHead className="text-right">Fastest lap</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const g = r.positions_gained;
            return (
              <TableRow key={`${r.driver_id}-${r.position_order}`} className={cn(!r.classified && "text-muted-foreground")}>
                <TableCell className="font-semibold">{r.classified ? r.position : r.position_text}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <TeamSwatch teamRef={r.constructor_ref} />
                    <span className={cn("font-medium", !r.classified && "font-normal")}>{r.driver_name}</span>
                    {compact && <span className="hidden text-xs text-muted-foreground md:inline">{r.constructor_name}</span>}
                    {r.fastest_lap_rank === 1 && (
                      <span className="rounded-sm bg-[#f1ebfb] px-1 text-[10px] font-semibold text-[#6a4ce2]" title="Fastest lap">
                        FL
                      </span>
                    )}
                  </div>
                </TableCell>
                {!compact && <TableCell className="text-muted-foreground">{r.constructor_name}</TableCell>}
                <TableCell className="text-right">{r.grid ?? "PL"}</TableCell>
                <TableCell className={cn("text-right font-medium", g != null && g > 0 && "text-[#1f6fd1]", g != null && g < 0 && "text-[#c4261d]")}>
                  {g == null ? "" : fmt.signed(g)}
                </TableCell>
                <TableCell className="text-right font-semibold">{r.points ? fmt.points(r.points) : ""}</TableCell>
                <TableCell className="text-right text-muted-foreground">{r.classified && r.race_time ? r.race_time : r.status}</TableCell>
                {!compact && <TableCell className="text-right text-muted-foreground">{r.fastest_lap_time ?? ""}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
