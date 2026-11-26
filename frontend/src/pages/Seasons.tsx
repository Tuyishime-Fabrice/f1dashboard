import { CloudRain, Zap } from "lucide-react";
import { useMemo } from "react";

import { resultsHeatmapOption, type MatrixCell } from "@/charts/builders";
import { tipRow, tipTitle } from "@/charts/theme";
import { EChart } from "@/components/charts/EChart";
import { KpiCard } from "@/components/common/KpiCard";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { TeamLabel } from "@/components/common/Team";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, type Row } from "@/lib/api";
import { SEQ_BLUE, teamColor } from "@/lib/colors";
import { fmt, shortRace, uniqueDriverLabels } from "@/lib/format";
import { useFilters } from "@/state/filters";

interface Matrix {
  rounds: { race_id: number; round: number; name: string; date: string }[];
  drivers: Row[];
  cells: { round: number; driver_id: number; position: number | null; position_text: string; points: number; status: string; grid: number | null; started: boolean }[];
  sprint: { round: number; driver_id: number; points: number; position: number }[];
}

export default function Seasons() {
  const { season, seasonInfo } = useFilters();
  const summary = useApi<Row>("/seasons/summary", { season });
  const champs = useApi<Row[]>("/history/champions");
  const matrix = useApi<Matrix>("/seasons/matrix", { season });
  const calendar = useApi<Row[]>("/seasons/calendar", { season });
  const champ = champs.data?.find((c) => c.year === season);
  const inProgress = !!seasonInfo?.in_progress;

  const heat = useMemo(() => {
    const m = matrix.data;
    if (!m) return null;
    const drivers = m.drivers;
    const rowIdx = new Map(drivers.map((d, i) => [d.driver_id, i]));
    const colIdx = new Map(m.rounds.map((r, i) => [r.round, i]));
    const sprint = new Map(m.sprint.map((s) => [`${s.round}-${s.driver_id}`, s]));
    const cells: MatrixCell[] = [];
    for (const c of m.cells) {
      const y = rowIdx.get(c.driver_id);
      const x = colIdx.get(c.round);
      if (y == null || x == null) continue;
      const d = drivers[y];
      const r = m.rounds[x];
      const sp = sprint.get(`${c.round}-${c.driver_id}`);
      const text =
        c.position ??
        (c.started
          ? c.position_text === "D" ? "DSQ" : c.position_text === "E" ? "EX" : "R"
          : c.status === "Did not qualify" || c.status === "107% Rule" ? "DNQ"
          : c.status === "Did not prequalify" ? "DNPQ"
          : c.position_text === "W" || c.status === "Withdrew" ? "W"
          : "DNS");
      cells.push({
        x,
        y,
        position: c.position,
        text: String(text),
        tip:
          tipTitle(d.driver_name, `R${r.round} · ${shortRace(r.name)}`) +
          tipRow("Result", c.position ? `P${c.position}` : c.status) +
          tipRow("Grid", c.grid ? `P${c.grid}` : "Pit lane / n.a.") +
          tipRow("Points", fmt.points(c.points)) +
          (sp ? tipRow("Sprint", `P${sp.position} · ${sp.points} pts`) : ""),
      });
    }
    const cols = m.rounds.map((r) => `R${r.round}`);
    const tips = m.rounds.map((r) => `${shortRace(r.name)} · ${fmt.shortDate(r.date)}`);
    return { option: resultsHeatmapOption(cols, uniqueDriverLabels(drivers), cells, tips), height: drivers.length * 24 + 40 };
  }, [matrix.data]);

  const s = summary.data;
  return (
    <div className="space-y-4">
      <PageHeader
        title={`${season} Season`}
        inProgress={inProgress}
        subtitle={s ? `${s.races} rounds · ${fmt.date(s.first_date)} – ${fmt.date(s.last_date)}${s.sprint_weekends ? ` · ${s.sprint_weekends} sprint weekends` : ""}` : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard className="col-span-2 md:col-span-1 xl:col-span-2" label={inProgress ? "Championship leader" : "World champion"} loading={champs.isLoading} accent={teamColor(champ?.driver_team_ref)} value={champ?.driver_name ?? "—"} sub={champ ? `${fmt.points(champ.points)} pts · ${champ.wins} wins · ${champ.driver_team}` : null} />
        <KpiCard label={inProgress ? "Constructors' leader" : "Constructors' champion"} loading={champs.isLoading} accent={teamColor(champ?.constructor_ref)} value={champ?.constructor_name ?? "—"} sub={champ?.constructor_points != null ? `${fmt.points(champ.constructor_points)} pts` : "Not awarded before 1958"} />
        <KpiCard label="Different winners" loading={summary.isLoading} value={s?.winners ?? "—"} sub={s ? `${s.podium_finishers} podium finishers` : null} />
        <KpiCard label="Pole sitters" loading={summary.isLoading} value={s?.pole_sitters ?? "—"} sub="Different drivers on pole" />
        <KpiCard label="Drivers" loading={summary.isLoading} value={s?.drivers ?? "—"} sub={s ? `${s.constructors} constructors` : null} />
      </div>

      <Panel
        title="Results by round"
        description="Finishing position for every driver in every Grand Prix · darker = better result"
        loading={matrix.isLoading}
        height={heat?.height ?? 480}
        contentClassName="overflow-x-auto scrollbar-thin"
        footnote={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5">
              {[SEQ_BLUE[6], SEQ_BLUE[5], SEQ_BLUE[4], SEQ_BLUE[3], SEQ_BLUE[1], "#e8edf3"].map((c) => (
                <span key={c} className="inline-block size-2.5 rounded-[2px]" style={{ background: c }} />
              ))}
              <span className="ml-1">P1 · P2–3 · P4–5 · P6–10 · P11–15 · P16+</span>
            </span>
            <span>R = retired · DSQ = disqualified · DNQ / DNPQ = did not (pre-)qualify · DNS = did not start · W = withdrew. Rows ordered by championship position.</span>
          </span>
        }
      >
        {heat && (
          <div style={{ minWidth: Math.max(640, (matrix.data?.rounds.length ?? 0) * 40 + 80) }}>
            <EChart option={heat.option} height={heat.height} ariaLabel="Heatmap of finishing positions by driver and round" />
          </div>
        )}
      </Panel>

      <Panel title="Calendar & outcomes" description="Winner, pole sitter and fastest lap for each round" loading={calendar.isLoading} contentClassName="px-0 pb-1" height={300}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">Rd</TableHead>
              <TableHead>Grand Prix</TableHead>
              <TableHead className="hidden lg:table-cell">Circuit</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Winner</TableHead>
              <TableHead className="text-right">Grid</TableHead>
              <TableHead className="hidden md:table-cell">Pole</TableHead>
              <TableHead className="hidden md:table-cell">Fastest lap</TableHead>
              <TableHead className="text-right">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calendar.data?.map((r) => (
              <TableRow key={r.race_id}>
                <TableCell className="font-semibold text-muted-foreground">{r.round}</TableCell>
                <TableCell className="font-medium">{shortRace(r.race_name)}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{r.circuit_name}</TableCell>
                <TableCell className="text-muted-foreground">{fmt.shortDate(r.date)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <TeamLabel name={r.driver_name} teamRef={r.constructor_ref} className="font-medium" />
                    <span className="hidden text-xs text-muted-foreground xl:inline">{r.constructor_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">{r.grid ?? "PL"}</TableCell>
                <TableCell className="hidden md:table-cell">{r.pole_driver ?? "—"}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {r.fastest_driver ? (
                    <span>
                      {r.fastest_code ?? r.fastest_driver} <span className="text-xs text-muted-foreground">{r.fastest_lap_time}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">n/a</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    {r.has_sprint && (
                      <span className="inline-flex items-center gap-1 text-[11px]" title="Sprint weekend">
                        <Zap className="size-3" /> Sprint
                      </span>
                    )}
                    {r.rainfall && (
                      <span className="inline-flex items-center gap-1 text-[11px]" title="Rain recorded during the race">
                        <CloudRain className="size-3" /> Rain
                      </span>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
