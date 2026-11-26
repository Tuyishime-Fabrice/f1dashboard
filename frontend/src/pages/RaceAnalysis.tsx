import { CloudRain, Sun, Timer } from "lucide-react";
import { useMemo, useState } from "react";

import { divergingOption, lapChartOption, rankingOption, startFinishOption, teamStyles } from "@/charts/builders";
import { textStyle, tipRow, tipTitle, tooltipBase, valueAxis, categoryAxis, legendBase } from "@/charts/theme";
import { EChart } from "@/components/charts/EChart";
import { Stat } from "@/components/common/KpiCard";
import { PageHeader, SectionTitle } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { Portrait } from "@/components/common/Portrait";
import { Segmented } from "@/components/common/Segmented";
import { TeamLabel } from "@/components/common/Team";
import { EntityPicker } from "@/components/filters/EntityPicker";
import { RaceSelect } from "@/components/filters/RaceSelect";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, type RaceDetail, type Row, type SeasonEntities } from "@/lib/api";
import { CATEGORICAL, INK } from "@/lib/colors";
import { driverCode, fmt, shortRace } from "@/lib/format";
import { useFilters } from "@/state/filters";

import { ResultsTable } from "./parts/ResultsTable";

const STATUS_ORDER = ["Finished", "Lapped", "Mechanical", "Accident / collision", "Retired (unspecified)", "Disqualified", "Driver / safety"];

export default function RaceAnalysis() {
  const { season, get, set } = useFilters();
  const ents = useApi<SeasonEntities>("/meta/season-entities", { season });
  const races = ents.data?.races ?? [];
  const raceId = Number(get("race")) || (races.length ? races[races.length - 1].race_id : null);
  const detail = useApi<RaceDetail>(raceId ? `/races/${raceId}` : null);
  const laps = useApi<{ laps: number; series: Row[] }>(raceId ? `/races/${raceId}/laps` : null);
  const raceFl = useApi<Row[]>(raceId ? `/races/${raceId}/fastest-laps` : null);
  const gvf = useApi<{ points: Row[]; stats: Row }>("/races/grid-vs-finish", { season });
  const gained = useApi<{ gainers: Row[]; losers: Row[] }>("/races/positions-gained", { season });
  const status = useApi<{ groups: Row[]; detail: Row[] }>("/races/status", { season });
  const trend = useApi<Row[]>("/races/retirement-trend");
  const fl = useApi<{ counts: Row[]; per_race: Row[] }>("/races/fastest-laps", { season });
  const traits = useApi<Row[]>("/races/circuit-traits", { season });
  const circuitId = Number(get("circuit")) || detail.data?.race.circuit_id || null;
  const circuit = useApi<Row>(circuitId ? `/races/circuit/${circuitId}` : null);
  const circuits = useApi<Row[]>("/meta/circuits");
  const [hl, setHl] = useState<number[] | null>(null);
  const [gainScope, setGainScope] = useState<"race" | "season">("race");

  const d = detail.data;
  const highlightIds = hl ?? d?.results.filter((r) => r.position && r.position <= 3).map((r) => r.driver_id) ?? [];

  const lapOpt = useMemo(() => {
    const l = laps.data;
    if (!l || !l.series.length) return null;
    const styles = teamStyles(l.series as never);
    const hlCodes = l.series.filter((s) => highlightIds.includes(s.driver_id)).map((s) => s.code ?? driverCode(s));
    return lapChartOption(
      l.series.map((s, i) => ({ code: s.code ?? driverCode(s), name: s.driver_name, team: s.constructor_name, color: styles[i].color, dashed: styles[i].dashed, positions: s.positions })),
      l.laps,
      hlCodes,
    );
  }, [laps.data, highlightIds]);

  const raceGainOpt = useMemo(() => {
    if (gainScope === "race") {
      if (!d) return null;
      const rows = d.results.filter((r) => r.positions_gained != null).sort((a, b) => (b.positions_gained ?? 0) - (a.positions_gained ?? 0));
      return { opt: divergingOption(rows.map((r) => ({ label: driverCode(r), value: r.positions_gained ?? 0, sub: `P${r.grid} → P${r.position}` })), "Places"), n: rows.length };
    }
    if (!gained.data) return null;
    const rows = [...gained.data.gainers.slice(0, 8), ...gained.data.losers.slice(0, 8).reverse()].filter((r, i, a) => a.findIndex((x) => x.driver_id === r.driver_id) === i);
    rows.sort((a, b) => b.total - a.total);
    return { opt: divergingOption(rows.map((r) => ({ label: driverCode(r), value: r.total, sub: `${r.races} classified finishes · avg ${fmt.signed(r.avg, 1)}` })), "Total places"), n: rows.length };
  }, [d, gained.data, gainScope]);

  const scatterOpt = useMemo(() => {
    if (!gvf.data) return null;
    return startFinishOption(
      gvf.data.points.map((p) => ({ x: p.grid, y: p.position, label: p.driver_name, sub: `R${p.round} · ${p.constructor_name}` })),
      { xName: "Grid position", yName: "Finishing position" },
    );
  }, [gvf.data]);

  const statusOpt = useMemo(() => {
    if (!status.data) return null;
    const g = [...status.data.groups].sort((a, b) => STATUS_ORDER.indexOf(a.status_group) - STATUS_ORDER.indexOf(b.status_group));
    const total = g.reduce((s, r) => s + r.n, 0);
    return rankingOption(
      g.map((r) => ({ label: r.status_group, value: r.n, sub: fmt.pct((100 * r.n) / total), color: r.status_group === "Finished" || r.status_group === "Lapped" ? INK.neutral : INK.loss })),
      { valueLabel: "Results", maxBars: 10 },
    );
  }, [status.data]);

  const trendOpt = useMemo(() => {
    const t = trend.data;
    if (!t) return null;
    const keys = [
      { k: "dnf_rate", name: "All retirements", color: INK.neutral },
      { k: "mechanical_rate", name: "Mechanical", color: CATEGORICAL[0] },
      { k: "accident_rate", name: "Accident / collision", color: CATEGORICAL[1] },
    ];
    return {
      textStyle,
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      legend: { ...legendBase, data: keys.map((k) => ({ name: k.name, itemStyle: { color: k.color } })) },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        formatter: (ps: { dataIndex: number; seriesIndex: number; value: number }[]) =>
          tipTitle(String(t[ps[0].dataIndex].year), `${t[ps[0].dataIndex].starts} starts`) + ps.map((p) => tipRow(keys[p.seriesIndex].name, fmt.pct(p.value), keys[p.seriesIndex].color)).join(""),
      },
      xAxis: categoryAxis(t.map((r) => String(r.year)), { boundaryGap: false }),
      yAxis: valueAxis({ axisLabel: { formatter: "{value}%", color: INK.muted, fontSize: 11 } }),
      series: keys.map((k) => ({
        name: k.name,
        type: "line",
        data: t.map((r) => r[k.k]),
        symbol: "none",
        lineStyle: { width: k.k === "dnf_rate" ? 2 : 1.5, color: k.color },
        itemStyle: { color: k.color },
        markLine:
          k.k === "dnf_rate"
            ? { silent: true, symbol: "none", lineStyle: { color: INK.faint, type: "solid" }, label: { formatter: String(season), color: INK.muted, fontSize: 10 }, data: [{ xAxis: String(season) }] }
            : undefined,
      })),
    };
  }, [trend.data, season]);

  const flOpt = useMemo(() => {
    if (!fl.data?.counts.length) return null;
    return rankingOption(
      fl.data.counts.map((c) => ({ label: c.driver_name, sub: c.constructor_name, value: c.fastest_laps })),
      { valueLabel: "Fastest laps", maxBars: 10 },
    );
  }, [fl.data]);

  const circuitOpt = useMemo(() => {
    const c = circuit.data;
    if (!c?.top_drivers?.length) return null;
    return rankingOption(c.top_drivers.slice(0, 8).map((r: Row) => ({ label: r.driver_name, value: r.wins })), { valueLabel: "Wins", maxBars: 8 });
  }, [circuit.data]);

  const fastestTimes = useMemo(() => {
    const rows = raceFl.data ?? [];
    if (!rows.length) return null;
    const best = rows[0].fastest_lap_ms;
    const top = rows.slice(0, 12);
    return rankingOption(
      top.map((r, i) => ({ label: `${driverCode(r)}  ${r.fastest_lap_time}`, sub: `${r.driver_name} · lap ${r.fastest_lap_no}`, value: (r.fastest_lap_ms - best) / 1000, color: i === 0 ? CATEGORICAL[6] : INK.neutral })),
      { valueLabel: "Gap to fastest", format: (v) => (v === 0 ? "fastest" : `+${v.toFixed(3)}s`), maxBars: 12 },
    );
  }, [raceFl.data]);

  const w = d?.results.find((r) => r.position === 1);

  return (
    <div className="space-y-4">
      <PageHeader title="Race analysis" subtitle="Race outcomes, overtaking, reliability and circuit history">
        {races.length > 0 && <RaceSelect races={races} value={raceId} onChange={(id) => set({ race: id, circuit: null })} />}
      </PageHeader>

      {/* Race header */}
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <Portrait kind="circuits" refKey={d?.race.circuit_ref} alt={d?.race.circuit_name ?? ""} fallback={d ? d.race.country.slice(0, 3).toUpperCase() : ""} className="h-44 w-full rounded-none text-2xl md:h-auto md:w-[260px]" objectPosition="50% 50%" />
          <div className="flex-1 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="label-caps">
                  Round {d?.race.round} · {d?.race.year}
                </div>
                <h2 className="mt-1 font-display text-[26px] leading-none font-semibold">{d?.race.name ?? "—"}</h2>
                <div className="mt-1.5 text-[13px] text-muted-foreground">
                  {d?.race.circuit_name} · {d?.race.location}, {d?.race.country} · {fmt.date(d?.race.date)}
                </div>
              </div>
              {d?.weather && (
                <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-xs">
                  {d.weather.rainfall ? <CloudRain className="size-4 text-[#1c6fd1]" /> : <Sun className="size-4 text-[#d28e05]" />}
                  <div className="tabular">
                    <div className="font-medium">{d.weather.rainfall ? "Rain recorded" : "Dry"}</div>
                    <div className="text-muted-foreground">
                      Air {d.weather.air_temp_avg.toFixed(1)}°C · Track {d.weather.track_temp_avg.toFixed(1)}°C
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 xl:grid-cols-7">
              <Stat label="Winner" value={w ? <TeamLabel name={w.surname} teamRef={w.constructor_ref} /> : "—"} />
              <Stat label="Pole" value={d?.pole ? d.pole.surname : "—"} />
              <Stat label="Fastest lap" value={d?.fastest_lap ? `${d.fastest_lap.code ?? d.fastest_lap.surname}` : "n/a"} hint={d?.fastest_lap?.fastest_lap_time} />
              <Stat label="Starters" value={d?.summary.starters ?? "—"} />
              <Stat label="Classified" value={d?.summary.classified ?? "—"} />
              <Stat label="Retirements" value={d?.summary.dnfs ?? "—"} />
              <Stat label="Pit stops" value={d?.pit.stops ? d.pit.stops : "n/a"} hint={d?.pit.median_ms ? `Median pit-lane time ${fmt.secs(d.pit.median_ms)}` : "Pit data from 2011"} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-8"
          title="Race history"
          description="Running position at the end of every lap"
          actions={
            laps.data?.series.length ? (
              <EntityPicker
                items={(d?.results ?? []).map((r) => ({ id: r.driver_id, label: r.driver_name, short: driverCode(r), teamRef: r.constructor_ref, sub: r.classified ? `P${r.position}` : r.position_text }))}
                selected={highlightIds}
                onChange={setHl}
                placeholder="Highlight drivers"
                max={6}
                className="w-[220px]"
              />
            ) : undefined
          }
          loading={laps.isLoading}
          empty={laps.data && !laps.data.series.length ? "Lap-by-lap timing is available from 1996 onwards." : false}
          height={400}
          footnote="Hover a line to isolate it. Podium finishers are highlighted by default."
        >
          {lapOpt && <EChart option={lapOpt} height={400} ariaLabel="Lap by lap positions" />}
        </Panel>
        <Panel
          className="xl:col-span-4"
          title="Positions gained / lost"
          description={gainScope === "race" ? "Grid to finish, classified drivers" : `Season total, ${season}`}
          actions={
            <Segmented
              value={gainScope}
              onChange={(v) => setGainScope(v as "race" | "season")}
              options={[
                { value: "race", label: "Race" },
                { value: "season", label: "Season" },
              ]}
            />
          }
          loading={detail.isLoading || gained.isLoading}
          height={400}
        >
          {raceGainOpt && <EChart option={raceGainOpt.opt} height={Math.max(400, raceGainOpt.n * 19)} ariaLabel="Positions gained or lost" />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8" title="Classification" loading={detail.isLoading} contentClassName="px-0 pb-1" height={400}>
          {d && <ResultsTable rows={d.results} maxHeight={520} />}
        </Panel>
        <Panel
          className="xl:col-span-4"
          title="Fastest laps"
          description="Gap to the race's fastest lap · top 12"
          loading={raceFl.isLoading}
          empty={raceFl.data && !raceFl.data.length ? "Fastest-lap times are recorded from 2004." : false}
          height={400}
        >
          {fastestTimes && <EChart option={fastestTimes} height={400} ariaLabel="Fastest lap gaps" />}
        </Panel>
      </div>

      <SectionTitle aside={<span className="text-xs text-muted-foreground">{season} season</span>}>Season patterns</SectionTitle>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-6"
          title="Grid vs finishing position"
          description="Every classified result of the season"
          loading={gvf.isLoading}
          height={340}
          footnote={
            gvf.data?.stats
              ? `r = ${gvf.data.stats.r?.toFixed(2)} across ${gvf.data.stats.n} results · ${gvf.data.stats.pole_wins} of ${gvf.data.stats.races} races won from pole · winners started P${fmt.num(gvf.data.stats.avg_winner_grid, 1)} on average (lowest: P${gvf.data.stats.worst_winning_grid}).`
              : undefined
          }
        >
          {scatterOpt && <EChart option={scatterOpt} height={340} ariaLabel="Grid versus finish scatter" />}
        </Panel>
        <Panel
          className="xl:col-span-3"
          title="How races ended"
          description="All starters, grouped by finishing status"
          loading={status.isLoading}
          height={340}
          footnote={season >= 2025 ? "From 2025 the source reports retirements without a cause." : undefined}
        >
          {statusOpt && <EChart option={statusOpt} height={340} ariaLabel="Finishing status distribution" />}
        </Panel>
        <Panel className="xl:col-span-3" title="Fastest-lap leaders" description="Count of race fastest laps" loading={fl.isLoading} empty={fl.data && !fl.data.counts.length ? "No fastest-lap data for this season (recorded from 2004)." : false} height={340}>
          {flOpt && <EChart option={flOpt} height={340} ariaLabel="Fastest lap counts" />}
        </Panel>
      </div>

      <Panel
        title="Retirement trends, 1950 – present"
        description="Share of race starters who did not finish (unclassified)"
        loading={trend.isLoading}
        height={280}
        footnote="Cause categories rely on status text; from 2025 causes are not reported, so the mechanical and accident lines drop to zero while the total remains valid."
      >
        {trendOpt && <EChart option={trendOpt} height={280} ariaLabel="Retirement rate per season" />}
      </Panel>

      <SectionTitle>Circuits</SectionTitle>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          title={circuit.data ? `Winners at ${circuit.data.circuit.name}` : "Winners by circuit"}
          description={circuit.data ? `${circuit.data.circuit.races} Grands Prix · ${circuit.data.circuit.first_year}–${circuit.data.circuit.last_year}` : undefined}
          actions={
            <EntityPicker
              multiple={false}
              items={(circuits.data ?? []).map((c) => ({ id: c.circuit_id, label: c.name, sub: `${c.races} races` }))}
              selected={circuitId ? [circuitId] : []}
              onChange={(v) => set({ circuit: v[0] ?? null })}
              placeholder="Choose circuit"
              className="w-[240px]"
            />
          }
          loading={circuit.isLoading}
          contentClassName="px-0 pb-1"
          height={360}
          footnote={
            circuit.data?.traits
              ? `Pole converted to victory in ${fmt.pct(circuit.data.traits.pole_win_rate)} of races · average winning grid slot ${fmt.num(circuit.data.traits.avg_winner_grid)} · retirement rate ${fmt.pct(circuit.data.traits.dnf_rate)}.`
              : undefined
          }
        >
          <div className="grid gap-0 md:grid-cols-2">
            <div className="max-h-[380px] overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Year</TableHead>
                    <TableHead>Winner</TableHead>
                    <TableHead className="text-right">Grid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {circuit.data?.winners.map((r: Row) => (
                    <TableRow key={`${r.year}-${r.driver_id}-${r.race_name}`}>
                      <TableCell className="text-muted-foreground">{r.year}</TableCell>
                      <TableCell>
                        <TeamLabel name={r.driver_name} teamRef={r.constructor_ref} />
                        <div className="pl-[9px] text-[11px] text-muted-foreground">{r.constructor_name}</div>
                      </TableCell>
                      <TableCell className="text-right">{r.grid ?? "PL"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="px-4 pt-2">
              <div className="label-caps mb-1">Most wins here</div>
              {circuitOpt && <EChart option={circuitOpt} height={300} ariaLabel="Most wins at this circuit" />}
            </div>
          </div>
        </Panel>

        <Panel
          className="xl:col-span-5"
          title={`Circuit characteristics · ${season} calendar`}
          description="Historical race outcomes at each venue, 2000 onwards"
          loading={traits.isLoading}
          contentClassName="px-0 pb-1"
          height={360}
          footnote="Pole→win: share of races won from pole. Avg change: mean absolute places gained or lost per classified driver — a rough proxy for overtaking."
        >
          <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Circuit</TableHead>
                  <TableHead className="text-right">Races</TableHead>
                  <TableHead className="text-right">Pole→win</TableHead>
                  <TableHead className="text-right">Avg change</TableHead>
                  <TableHead className="text-right">DNF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traits.data?.map((t) => (
                  <TableRow key={t.circuit_id} className="cursor-pointer" onClick={() => set({ circuit: t.circuit_id })}>
                    <TableCell>
                      <span className="mr-2 text-xs text-muted-foreground">R{t.round}</span>
                      <span className="font-medium">{t.name}</span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{t.races}</TableCell>
                    <TableCell className="text-right">{fmt.pct(t.pole_win_rate, 0)}</TableCell>
                    <TableCell className="text-right">{fmt.num(t.avg_abs_position_change, 1)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt.pct(t.dnf_rate, 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Timer className="size-3" /> Lap and fastest-lap times come from official timing records in the dataset; {shortRace(d?.race.name ?? "")} pit data appear on the Strategy page.
      </p>
    </div>
  );
}
