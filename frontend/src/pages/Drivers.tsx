import { useEffect, useMemo, useState } from "react";

import { rankingOption, seasonLinesOption, startFinishOption, teamStyles, type ScatterPoint } from "@/charts/builders";
import { EChart } from "@/components/charts/EChart";
import { Stat } from "@/components/common/KpiCard";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { Portrait } from "@/components/common/Portrait";
import { Segmented } from "@/components/common/Segmented";
import { TeamLabel, TeamSwatch } from "@/components/common/Team";
import { EntityPicker, type PickerItem } from "@/components/filters/EntityPicker";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, type DriverStats, type Row, type SeasonEntities } from "@/lib/api";
import { INK } from "@/lib/colors";
import { driverCode, fmt, shortRace } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFilters } from "@/state/filters";

type Scope = "season" | "career";
type Metric = "wins" | "points" | "podiums" | "poles";

const METRICS: { key: keyof DriverStats; label: string; fmt: (v: never) => string; better: "high" | "low"; hint?: string }[] = [
  { key: "starts", label: "Race starts", fmt: (v: number) => fmt.int(v), better: "high" },
  { key: "wins", label: "Wins", fmt: (v: number) => fmt.int(v), better: "high" },
  { key: "podiums", label: "Podiums", fmt: (v: number) => fmt.int(v), better: "high" },
  { key: "poles", label: "Pole positions", fmt: (v: number) => fmt.int(v), better: "high" },
  { key: "points", label: "Championship points", fmt: (v: number) => fmt.points(v), better: "high" },
  { key: "win_rate", label: "Win rate", fmt: (v: number) => fmt.pct(v), better: "high" },
  { key: "podium_rate", label: "Podium rate", fmt: (v: number) => fmt.pct(v), better: "high" },
  { key: "avg_finish", label: "Avg finish (classified)", fmt: (v: number) => fmt.num(v, 2), better: "low" },
  { key: "avg_grid", label: "Avg grid position", fmt: (v: number) => fmt.num(v, 2), better: "low" },
  { key: "avg_quali", label: "Avg qualifying position", fmt: (v: number) => fmt.num(v, 2), better: "low", hint: "Qualifying data from 1994" },
  { key: "avg_positions_gained", label: "Avg positions gained", fmt: (v: number) => fmt.signed(v, 2), better: "high" },
  { key: "dnf_rate", label: "DNF rate", fmt: (v: number) => fmt.pct(v), better: "low" },
  { key: "fastest_laps", label: "Fastest laps", fmt: (v: number) => fmt.int(v), better: "high", hint: "Fastest-lap data from 2004" },
];

export default function Drivers() {
  const { season, getIds, set, get } = useFilters();
  const scope = (get("scope") as Scope) ?? "season";
  const ents = useApi<SeasonEntities>("/meta/season-entities", { season });
  const allDrivers = useApi<Row[]>("/meta/drivers");
  const urlIds = getIds("drivers");
  const ids = useMemo(() => (urlIds.length ? urlIds : (ents.data?.drivers.slice(0, 2).map((d) => d.driver_id) ?? [])), [urlIds, ents.data]);
  const [metric, setMetric] = useState<Metric>("wins");
  const [trend, setTrend] = useState<"position" | "wins">("position");
  useEffect(() => setMetric(scope === "season" ? "points" : "wins"), [scope]);

  const sp = scope === "season" ? season : undefined;
  const compare = useApi<{ stats: DriverStats[]; by_season: Row[]; rounds: Row[]; head_to_head: Row | null }>(ids.length ? "/drivers/compare" : null, { ids, season: sp });
  const primary = useApi<Row>(ids[0] ? `/drivers/${ids[0]}` : null, { season: sp });
  const board = useApi<DriverStats[]>("/drivers/leaderboard", { metric, season: sp, limit: 15 });
  const qvr = useApi<{ points: Row[]; correlation: { r: number; n: number } }>("/drivers/quali-vs-race", { season });

  const pickerItems: PickerItem[] = useMemo(() => {
    const seasonIds = new Set(ents.data?.drivers.map((d) => d.driver_id));
    const fromSeason = (ents.data?.drivers ?? []).map((d) => ({ id: d.driver_id, label: d.driver_name, short: driverCode(d), sub: d.constructor_name ?? "", teamRef: d.constructor_ref, group: `${season} grid` }));
    const others = (allDrivers.data ?? [])
      .filter((d) => !seasonIds.has(d.driver_id))
      .map((d) => ({ id: d.driver_id, label: d.driver_name, short: driverCode(d), sub: `${d.first_year}–${d.last_year}`, group: "All drivers" }));
    return [...fromSeason, ...others];
  }, [ents.data, allDrivers.data, season]);

  const stats = useMemo(() => {
    const byId = new Map((compare.data?.stats ?? []).map((s) => [s.driver_id, s]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as DriverStats[];
  }, [compare.data, ids]);
  const styles = teamStyles(stats);

  const boardOpt = useMemo(() => {
    if (!board.data) return null;
    return rankingOption(
      board.data.map((d) => ({ label: d.driver_name, sub: d.constructor_name ?? "", value: Number(d[metric] ?? 0), highlight: ids.includes(d.driver_id) })),
      { valueLabel: metric === "points" ? "Points" : metric[0].toUpperCase() + metric.slice(1), format: metric === "points" ? (v) => fmt.points(v) : undefined },
    );
  }, [board.data, metric, ids]);

  const trendOpt = useMemo(() => {
    const rows = compare.data?.by_season;
    if (!rows?.length) return null;
    const years = [...new Set(rows.map((r) => r.year as number))].sort((a, b) => a - b);
    const full: number[] = [];
    for (let y = years[0]; y <= years[years.length - 1]; y++) full.push(y);
    return seasonLinesOption(
      full,
      stats.map((s, i) => ({
        name: driverCode(s),
        color: styles[i].color,
        dashed: styles[i].dashed,
        values: full.map((y) => {
          const r = rows.find((x) => x.year === y && x.driver_id === s.driver_id);
          return r ? (trend === "position" ? r.position : r.wins) : null;
        }),
      })),
      { yName: trend === "position" ? "Championship position" : "Wins", inverse: trend === "position", min: trend === "position" ? 1 : 0 },
    );
  }, [compare.data, stats, styles, trend]);

  const scatterOpt = useMemo(() => {
    if (!qvr.data) return null;
    const sel = new Set(ids);
    const pts: ScatterPoint[] = qvr.data.points
      .filter((p) => p.classified && (p.quali_position ?? p.grid))
      .map((p) => {
        const i = stats.findIndex((s) => s.driver_id === p.driver_id);
        const on = sel.has(p.driver_id) && i >= 0;
        return {
          x: p.quali_position ?? p.grid,
          y: p.position,
          label: p.driver_name,
          sub: `R${p.round} · ${shortRace(p.race_name)}`,
          color: on ? styles[i].color : undefined,
          group: on ? driverCode(p) : "Other drivers",
        };
      });
    const groups = [
      ...stats.map((s, i) => ({ name: driverCode(s), color: styles[i].color, symbol: styles[i].dashed ? "diamond" : "circle" })),
      { name: "Other drivers", color: "#c9cdd2", background: true },
    ];
    return startFinishOption(pts, { xName: "Qualifying position", yName: "Finishing position", groups });
  }, [qvr.data, ids, stats, styles]);

  const p = primary.data;
  const pd = p?.driver;
  const ps: DriverStats | undefined = p?.stats ?? undefined;
  const h2h = compare.data?.head_to_head;

  return (
    <div className="space-y-4">
      <PageHeader title="Drivers" subtitle={scope === "season" ? `Performance in the ${season} season` : "Career performance, all seasons"}>
        <Segmented<Scope>
          size="md"
          value={scope}
          onChange={(v) => set({ scope: v === "season" ? null : v })}
          options={[
            { value: "season", label: `${season} season` },
            { value: "career", label: "Career" },
          ]}
        />
        <EntityPicker items={pickerItems} selected={ids} onChange={(v) => set({ drivers: v })} placeholder="Compare drivers" max={4} className="w-[300px]" />
      </PageHeader>

      {/* Profile */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-4 md:flex-row">
          <Portrait kind="drivers" refKey={pd?.driver_ref} alt={pd?.full_name ?? ""} fallback={pd ? driverCode(pd) : ""} teamRef={ps?.constructor_ref} className="h-[176px] w-full text-4xl md:w-[148px]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="flex items-baseline gap-3">
                  <h2 className="font-display text-[28px] leading-none font-semibold">{pd?.full_name ?? "—"}</h2>
                  {pd?.permanent_number && <span className="font-display text-2xl font-bold text-[#c9cdd2]">#{pd.permanent_number}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                  {ps?.constructor_name && <TeamLabel name={ps.constructor_name} teamRef={ps.constructor_ref} className="text-foreground" />}
                  {pd?.nationality && <span>{pd.nationality}</span>}
                  {pd?.dob && <span>Born {fmt.date(pd.dob)}</span>}
                  {p?.debut && (
                    <span>
                      Debut {p.debut.year} {shortRace(p.debut.name)}
                    </span>
                  )}
                </div>
              </div>
              {p?.career && (
                <div className="text-right text-xs text-muted-foreground">
                  <div className="font-display text-lg font-semibold text-foreground">{p.career.titles ? `${p.career.titles}× World Champion` : p.career.best_championship ? `Best championship: ${fmt.ord(p.career.best_championship)}` : ""}</div>
                  {p.career.first_year}–{p.career.last_year} · {p.teams?.length} team{p.teams?.length === 1 ? "" : "s"}
                </div>
              )}
            </div>
            {ps ? (
              <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-5 xl:grid-cols-9">
                <Stat label="Starts" value={ps.starts} />
                <Stat label="Wins" value={ps.wins} />
                <Stat label="Podiums" value={ps.podiums} />
                <Stat label="Poles" value={ps.poles} />
                <Stat label="Points" value={fmt.points(ps.points)} />
                <Stat label="Avg finish" value={fmt.num(ps.avg_finish)} />
                <Stat label="DNF rate" value={fmt.pct(ps.dnf_rate)} />
                <Stat label="Avg +/− pos." value={fmt.signed(ps.avg_positions_gained, 1)} hint="Grid minus finish, classified results" />
                <Stat label="Avg quali" value={fmt.num(ps.avg_quali)} hint="Qualifying data available from 1994" />
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">{ids[0] && !primary.isLoading ? `No race starts in ${season}. Switch to Career to see all seasons.` : ""}</div>
            )}
            {p?.teams && p.teams.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.teams.map((t: Row) => (
                  <span key={t.constructor_id} className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-0.5 text-[11px]">
                    <TeamSwatch teamRef={t.constructor_ref} className="h-2.5" />
                    {t.constructor_name}
                    <span className="text-muted-foreground">{t.first_year === t.last_year ? t.first_year : `${t.first_year}–${String(t.last_year).slice(2)}`}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-5"
          title={scope === "season" ? `Top drivers · ${season}` : "Top drivers · all time"}
          description="Selected drivers highlighted"
          actions={
            <Segmented<Metric>
              value={metric}
              onChange={setMetric}
              options={[
                { value: "points", label: "Points" },
                { value: "wins", label: "Wins" },
                { value: "podiums", label: "Podiums" },
                { value: "poles", label: "Poles" },
              ]}
            />
          }
          loading={board.isLoading}
          empty={board.data && board.data.length === 0 ? "No driver recorded this metric in the selected scope." : false}
          height={420}
          footnote={scope === "career" && metric === "points" ? "Career points are summed championship points; scoring systems changed over time, so compare across eras with care." : undefined}
        >
          {boardOpt && <EChart option={boardOpt} height={420} ariaLabel="Driver ranking" />}
        </Panel>

        <Panel
          className="xl:col-span-7"
          title="Head-to-head comparison"
          description={scope === "season" ? `${season} season` : "Career totals"}
          loading={compare.isLoading}
          empty={stats.length === 0 ? "Select up to four drivers to compare." : false}
          contentClassName="px-0 pb-1"
          height={420}
          footnote={
            h2h && stats.length === 2 && h2h.shared_races > 0
              ? `In ${h2h.shared_races} races together: ${driverCode(stats[0])} finished ahead ${h2h.a_ahead}×, ${driverCode(stats[1])} ${h2h.b_ahead}× · started ahead ${h2h.a_grid_ahead}–${h2h.b_grid_ahead}.`
              : "Best value in each row is shown in bold."
          }
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Metric</TableHead>
                {stats.map((s, i) => (
                  <TableHead key={s.driver_id} className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-[3px] w-3 rounded-full" style={{ background: styles[i].color, opacity: styles[i].dashed ? 0.55 : 1 }} />
                      {driverCode(s)}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {METRICS.map((m) => {
                const vals = stats.map((s) => s[m.key] as number | null);
                const valid = vals.filter((v): v is number => v != null);
                const best = valid.length > 1 ? (m.better === "high" ? Math.max(...valid) : Math.min(...valid)) : null;
                return (
                  <TableRow key={m.key}>
                    <TableCell className="text-muted-foreground" title={m.hint}>
                      {m.label}
                    </TableCell>
                    {vals.map((v, i) => (
                      <TableCell key={i} className={cn("text-right", v != null && v === best && "font-semibold")}>
                        {(m.fmt as (v: number | null) => string)(v)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-6"
          title="Performance over seasons"
          description={trend === "position" ? "Final championship position per season (current standing for an in-progress season)" : "Race wins per season"}
          actions={
            <Segmented
              value={trend}
              onChange={(v) => setTrend(v as "position" | "wins")}
              options={[
                { value: "position", label: "Position" },
                { value: "wins", label: "Wins" },
              ]}
            />
          }
          loading={compare.isLoading}
          empty={!trendOpt ? "Select drivers to plot their seasons." : false}
          height={320}
        >
          {trendOpt && <EChart option={trendOpt} height={320} ariaLabel="Championship position by season" />}
        </Panel>

        <Panel
          className="xl:col-span-6"
          title={`Qualifying vs race finish · ${season}`}
          description="Each dot is one classified result; points below the line gained places"
          loading={qvr.isLoading}
          height={320}
          footnote={
            qvr.data?.correlation?.r != null
              ? `Correlation between start and finish position: r = ${qvr.data.correlation.r.toFixed(2)} (n = ${qvr.data.correlation.n}). ${season < 1994 ? "Grid position used before 1994 (no qualifying data)." : ""}`
              : undefined
          }
        >
          {scatterOpt && <EChart option={scatterOpt} height={320} ariaLabel="Qualifying position versus finishing position" />}
        </Panel>
      </div>

      {scope === "season" && compare.data?.rounds && compare.data.rounds.length > 0 && (
        <Panel title={`Round by round · ${season}`} description="Qualifying, grid and finish for the selected drivers" contentClassName="px-0 pb-1">
          <RoundTable rows={compare.data.rounds} stats={stats} colors={styles.map((s) => s.color)} />
        </Panel>
      )}
    </div>
  );
}

function RoundTable({ rows, stats, colors }: { rows: Row[]; stats: DriverStats[]; colors: string[] }) {
  const rounds = [...new Map(rows.map((r) => [r.round, r.race_name])).entries()];
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Round</TableHead>
          {stats.map((s, i) => (
            <TableHead key={s.driver_id} className="text-right">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-[3px] w-3 rounded-full" style={{ background: colors[i] }} />
                {driverCode(s)} <span className="font-normal normal-case">Q / G / F</span>
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rounds.map(([round, name]) => (
          <TableRow key={round}>
            <TableCell>
              <span className="mr-2 font-semibold text-muted-foreground">R{round}</span>
              {shortRace(name)}
            </TableCell>
            {stats.map((s) => {
              const r = rows.find((x) => x.round === round && x.driver_id === s.driver_id);
              if (!r) return <TableCell key={s.driver_id} className="text-right text-muted-foreground">—</TableCell>;
              const fin = r.position ? `P${r.position}` : r.position_text === "R" ? "DNF" : r.position_text;
              return (
                <TableCell key={s.driver_id} className="text-right">
                  <span className="text-muted-foreground">
                    {r.quali_position ?? "–"} / {r.grid ?? "PL"} /{" "}
                  </span>
                  <span className={cn("font-semibold", r.position === 1 && "text-racing", !r.position && "font-normal text-muted-foreground")} style={r.position === 1 ? { color: INK.accent } : undefined}>
                    {fin}
                  </span>
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
