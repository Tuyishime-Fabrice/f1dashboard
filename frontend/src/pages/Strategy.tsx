import { CloudRain } from "lucide-react";
import { useMemo } from "react";

import { boxplotOption, columnOption, compoundShareOption, rankingOption, strategyOption, xyScatterOption, type StintRow } from "@/charts/builders";
import { categoryAxis, legendBase, textStyle, tipRow, tipTitle, tooltipBase, valueAxis } from "@/charts/theme";
import { EChart } from "@/components/charts/EChart";
import { KpiCard } from "@/components/common/KpiCard";
import { PageHeader } from "@/components/common/PageHeader";
import { Notice, Panel } from "@/components/common/Panel";
import { TeamLabel } from "@/components/common/Team";
import { EntityPicker } from "@/components/filters/EntityPicker";
import { RaceSelect } from "@/components/filters/RaceSelect";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, type Row, type SeasonEntities } from "@/lib/api";
import { CATEGORICAL, COMPOUND, INK, teamColor } from "@/lib/colors";
import { driverCode, fmt, shortRace } from "@/lib/format";
import { useFilters } from "@/state/filters";

type Tab = "pit" | "tyres" | "weather";

export default function Strategy() {
  const { season, seasons, get, set, setSeason } = useFilters();
  const tab = (get("tab") as Tab) ?? "pit";
  const info = seasons.find((s) => s.year === season);
  const pitYears = seasons.filter((s) => s.has_pit_stops).map((s) => s.year);
  const tyreYears = seasons.filter((s) => s.has_tyres).map((s) => s.year);
  const wxYears = seasons.filter((s) => s.has_weather).map((s) => s.year);

  return (
    <div className="space-y-4">
      <PageHeader title="Strategy & weather" subtitle="Pit stops, tyre strategy and race-day conditions">
        <Tabs value={tab} onValueChange={(v) => set({ tab: v === "pit" ? null : v })}>
          <TabsList>
            <TabsTrigger value="pit">Pit stops</TabsTrigger>
            <TabsTrigger value="tyres">Tyres</TabsTrigger>
            <TabsTrigger value="weather">Weather</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      <Tabs value={tab}>
        <TabsContent value="pit">
          {info?.has_pit_stops ? <PitStops /> : <Coverage what="Pit-stop data" years={pitYears} onPick={setSeason} />}
        </TabsContent>
        <TabsContent value="tyres">{info?.has_tyres ? <Tyres /> : <Coverage what="Tyre-stint data" years={tyreYears} onPick={setSeason} />}</TabsContent>
        <TabsContent value="weather">
          <Weather inSeason={info?.has_weather ? season : null} years={wxYears} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Coverage({ what, years, onPick }: { what: string; years: number[]; onPick: (y: number) => void }) {
  const from = Math.min(...years);
  const to = Math.max(...years);
  return (
    <Notice height={260}>
      <div className="text-sm font-medium text-foreground">
        {what} is available for {from === to ? from : `${from}–${to}`} only.
      </div>
      <div className="mt-1">The selected season is outside this range, so the analysis is hidden rather than estimated.</div>
      <div className="mt-4 flex justify-center gap-2">
        {[...years].sort((a, b) => b - a).slice(0, 2).map((y) => (
          <Button key={y} variant="outline" size="sm" onClick={() => onPick(y)}>
            View {y}
          </Button>
        ))}
      </div>
    </Notice>
  );
}

/* ================================================================ pit stops */
function PitStops() {
  const { season, get, set } = useFilters();
  const ents = useApi<SeasonEntities>("/meta/season-entities", { season });
  const raceId = Number(get("race")) || null;
  const p = { season, race_id: raceId };
  const summary = useApi<Row>("/strategy/pit-summary", p);
  const box = useApi<Row[]>("/strategy/pit-by-constructor", p);
  const perDriver = useApi<Row[]>("/strategy/stops-per-driver", p);
  const timing = useApi<{ mode: string; bins: Row[] }>("/strategy/stop-timing", p);
  const trend = useApi<Row[]>("/strategy/pit-trend");
  const s = summary.data;
  const fastest = s?.fastest?.[0];

  const boxOpt = useMemo(
    () =>
      box.data?.length
        ? boxplotOption(
            box.data.map((b) => ({ label: b.constructor_name, color: teamColor(b.constructor_ref, b.constructor_id), min: b.min_ms / 1000, q1: b.q1_ms / 1000, median: b.median_ms / 1000, q3: b.q3_ms / 1000, max: b.max_ms / 1000, n: b.n })),
          )
        : null,
    [box.data],
  );
  const driverOpt = useMemo(
    () =>
      perDriver.data?.length
        ? rankingOption(
            [...perDriver.data]
              .sort((a, b) => (raceId ? b.stops - a.stops : b.stops_per_race - a.stops_per_race))
              .slice(0, 15)
              .map((d) => ({ label: d.driver_name, sub: `${d.constructor_name} · ${d.races} races`, value: raceId ? d.stops : d.stops_per_race })),
            { valueLabel: raceId ? "Stops" : "Stops per race", format: raceId ? undefined : (v) => v.toFixed(2) },
          )
        : null,
    [perDriver.data, raceId],
  );
  const timingOpt = useMemo(() => {
    const t = timing.data;
    if (!t?.bins.length) return null;
    const labels = t.mode === "pct" ? t.bins.map((b) => `${b.pct}%`) : t.bins.map((b) => String(b.lap));
    return columnOption(labels, t.bins.map((b) => b.stops), {
      valueName: "Stops",
      tips: t.mode === "pct" ? t.bins.map((b) => `${b.pct}–${b.pct + 5}% of race distance`) : labels.map((l) => `Lap ${l}`),
    });
  }, [timing.data]);
  const trendOpt = useMemo(() => {
    const t = trend.data;
    if (!t) return null;
    return {
      textStyle,
      grid: { left: 8, right: 16, top: 34, bottom: 8, containLabel: true },
      legend: { ...legendBase, data: [{ name: "Median", itemStyle: { color: INK.neutral } }, { name: "10th percentile", itemStyle: { color: CATEGORICAL[0] } }] },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        formatter: (ps: { dataIndex: number; seriesIndex: number; value: number }[]) =>
          tipTitle(String(t[ps[0].dataIndex].year), `${t[ps[0].dataIndex].stops_per_driver_race} stops per driver/race`) +
          ps.map((x) => tipRow(x.seriesIndex === 0 ? "Median" : "10th percentile", `${x.value.toFixed(2)}s`, x.seriesIndex === 0 ? INK.neutral : CATEGORICAL[0])).join(""),
      },
      xAxis: categoryAxis(t.map((r) => String(r.year)), { boundaryGap: false }),
      yAxis: valueAxis({ scale: true, axisLabel: { formatter: "{value}s", color: INK.muted, fontSize: 11 } }),
      series: [
        { name: "Median", type: "line", data: t.map((r) => +(r.median_ms / 1000).toFixed(2)), symbolSize: 6, lineStyle: { width: 2, color: INK.neutral }, itemStyle: { color: INK.neutral } },
        { name: "10th percentile", type: "line", data: t.map((r) => +(r.p10_ms / 1000).toFixed(2)), symbolSize: 6, lineStyle: { width: 2, color: CATEGORICAL[0] }, itemStyle: { color: CATEGORICAL[0] } },
      ],
    };
  }, [trend.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Durations are pit-lane times (entry to exit), not stationary times.</p>
        {ents.data && <RaceSelect races={ents.data.races} value={raceId} onChange={(id) => set({ race: id })} allowAll={`All ${season} races`} />}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Pit stops" loading={summary.isLoading} value={fmt.int(s?.stops)} sub={s ? `${s.races} race${s.races === 1 ? "" : "s"}` : null} />
        <KpiCard label="Median pit-lane time" loading={summary.isLoading} value={s?.median_ms ? (s.median_ms / 1000).toFixed(2) : "—"} unit="s" sub={s?.mean_ms ? `Mean ${(s.mean_ms / 1000).toFixed(2)} s` : null} />
        <KpiCard label="Fastest stop" loading={summary.isLoading} accent={teamColor(fastest?.constructor_ref)} value={fastest ? (fastest.duration_ms / 1000).toFixed(2) : "—"} unit="s" sub={fastest ? `${fastest.driver_name} · ${shortRace(fastest.race_name)}` : null} />
        <KpiCard label="Stops per driver" loading={summary.isLoading} value={s?.avg_stops_per_driver ? s.avg_stops_per_driver.toFixed(2) : "—"} sub="Average per race" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          title="Pit-lane time by constructor"
          description="Distribution of timed stops · sorted by median"
          loading={box.isLoading}
          empty={box.data && !box.data.length ? "Not enough timed stops for this selection." : false}
          height={380}
          footnote={s?.excluded_stops ? `${s.excluded_stops} stop${s.excluded_stops === 1 ? "" : "s"} excluded from timing (missing duration or over 60 s, e.g. red-flag stoppages).` : "Box spans the middle 50% of stops; whiskers show the fastest and slowest."}
        >
          {boxOpt && <EChart option={boxOpt} height={Math.max(380, (box.data?.length ?? 0) * 32)} ariaLabel="Pit stop durations by constructor" />}
        </Panel>
        <Panel className="xl:col-span-5" title={raceId ? "Stops per driver" : "Stops per driver per race"} description="Top 15" loading={perDriver.isLoading} height={380}>
          {driverOpt && <EChart option={driverOpt} height={380} ariaLabel="Stops per driver" />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="When teams pit" description={raceId ? "Stops by lap" : "Stops by share of race distance (5% bins)"} loading={timing.isLoading} height={280}>
          {timingOpt && <EChart option={timingOpt} height={280} ariaLabel="Pit stop timing distribution" />}
        </Panel>
        <Panel className="xl:col-span-7" title="Fastest stops" description="Ten quickest pit-lane times" loading={summary.isLoading} contentClassName="px-0 pb-1" height={280}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8">#</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="hidden sm:table-cell">Race</TableHead>
                <TableHead className="text-right">Lap</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s?.fastest?.map((f: Row, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <TeamLabel name={f.driver_name} teamRef={f.constructor_ref} className="font-medium" />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    R{f.round} · {shortRace(f.race_name)}
                  </TableCell>
                  <TableCell className="text-right">{f.lap}</TableCell>
                  <TableCell className="text-right font-semibold">{(f.duration_ms / 1000).toFixed(3)}s</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <Panel title="Pit-lane time since 2011" description="Season median and 10th percentile of timed stops" loading={trend.isLoading} height={240} footnote="Pit-lane length and speed limits differ by circuit, so season values also reflect the calendar.">
        {trendOpt && <EChart option={trendOpt} height={240} ariaLabel="Pit-lane time trend" />}
      </Panel>
    </div>
  );
}

/* ================================================================ tyres */
function Tyres() {
  const { season, get, set, getIds } = useFilters();
  const ents = useApi<SeasonEntities>("/meta/season-entities", { season });
  const races = ents.data?.races ?? [];
  const raceId = Number(get("race")) || (races.length ? races[races.length - 1].race_id : null);
  const overview = useApi<{ by_compound: Row[]; rounds: { round: number; race_name: string; share: Record<string, number> }[]; avg_stops_from_stints: number }>("/strategy/tyres", { season });
  const race = useApi<{ stints: Row[]; laps: number }>(raceId ? `/strategy/tyres/race/${raceId}` : null);
  const urlIds = getIds("drivers");
  const ids = urlIds.length ? urlIds : (ents.data?.drivers.slice(0, 4).map((d) => d.driver_id) ?? []);
  const usage = useApi<Row[]>("/strategy/tyres/drivers", { season, ids });

  const shareOpt = useMemo(() => (overview.data?.rounds.length ? compoundShareOption(overview.data.rounds) : null), [overview.data]);
  const stintOpt = useMemo(() => {
    const c = overview.data?.by_compound.filter((x) => x.compound !== "UNKNOWN");
    if (!c?.length) return null;
    return columnOption(
      c.map((x) => COMPOUND[x.compound]?.label ?? x.compound),
      c.map((x) => x.avg_stint),
      { valueName: "Average stint (laps)", format: (v) => v.toFixed(1), colors: c.map((x) => (x.compound === "HARD" ? "#b9bec4" : COMPOUND[x.compound]?.color)), tips: c.map((x) => `${COMPOUND[x.compound]?.label} · ${x.stints} stints · median ${x.median_stint} · longest ${x.max_stint}`) },
    );
  }, [overview.data]);
  const gantt = useMemo(() => {
    const r = race.data;
    if (!r?.stints.length) return null;
    const by = new Map<number, StintRow>();
    for (const s of r.stints) {
      const row = by.get(s.driver_id) ?? { label: driverCode(s), sub: `${s.position_text === "R" ? "DNF" : `P${s.position_text}`} · ${s.constructor_name}`, stints: [] };
      row.stints.push({ compound: s.compound, start: s.start_lap, end: s.end_lap, laps: s.laps, stint: s.stint });
      by.set(s.driver_id, row);
    }
    const rows = [...by.values()];
    return { opt: strategyOption(rows, r.laps ?? Math.max(...r.stints.map((s) => s.end_lap))), h: rows.length * 22 + 40 };
  }, [race.data]);
  const usageOpt = useMemo(() => {
    const u = usage.data;
    if (!u?.length) return null;
    const drivers = [...new Map(u.map((r) => [r.driver_id, r])).values()];
    const comps = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].filter((c) => u.some((r) => r.compound === c));
    return {
      textStyle,
      grid: { left: 8, right: 16, top: 34, bottom: 26, containLabel: true },
      legend: { ...legendBase, itemWidth: 10, itemHeight: 10, data: comps.map((c) => ({ name: COMPOUND[c].label, itemStyle: { color: COMPOUND[c].color, borderColor: "#c4c9ce", borderWidth: c === "HARD" ? 1 : 0 } })) },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: "rgba(0,0,0,0.04)" } },
        formatter: (ps: { dataIndex: number; seriesIndex: number; value: number }[]) => {
          const d = drivers[ps[0].dataIndex];
          return tipTitle(d.driver_name, d.constructor_name) + ps.filter((p) => p.value).map((p) => {
            const r = u.find((x) => x.driver_id === d.driver_id && x.compound === comps[p.seriesIndex]);
            return tipRow(COMPOUND[comps[p.seriesIndex]].label, `${p.value} laps · avg stint ${r?.avg_stint}`, COMPOUND[comps[p.seriesIndex]].color);
          }).join("");
        },
      },
      xAxis: valueAxis({ name: "Laps", nameLocation: "middle", nameGap: 22 }),
      yAxis: categoryAxis(drivers.map((d) => driverCode(d)), { inverse: true, axisLine: { show: false }, axisLabel: { color: INK.text, fontSize: 12, fontWeight: 600 } }),
      series: comps.map((c) => ({
        name: COMPOUND[c].label,
        type: "bar",
        stack: "l",
        barWidth: 14,
        data: drivers.map((d) => u.find((r) => r.driver_id === d.driver_id && r.compound === c)?.laps ?? 0),
        itemStyle: { color: COMPOUND[c].color, borderColor: c === "HARD" ? "#b9bec4" : "#fff", borderWidth: 1 },
      })),
    };
  }, [usage.data]);

  const bc = overview.data?.by_compound ?? [];
  const totalLaps = bc.reduce((a, b) => a + b.laps, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {["SOFT", "MEDIUM", "HARD", "INTERMEDIATE"].map((c) => {
          const r = bc.find((x) => x.compound === c);
          return (
            <KpiCard key={c} label={`${COMPOUND[c].label} · avg stint`} loading={overview.isLoading} accent={c === "HARD" ? "#b9bec4" : COMPOUND[c].color} value={r ? r.avg_stint.toFixed(1) : "—"} unit={r ? "laps" : undefined} sub={r ? `${fmt.pct((100 * r.laps) / totalLaps)} of race laps · ${r.stints} stints` : "Not used"} />
          );
        })}
        <KpiCard label="Stops per driver" loading={overview.isLoading} value={overview.data?.avg_stops_from_stints?.toFixed(2) ?? "—"} sub="Stints minus one, per race" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8" title="Compound usage by round" description="Share of all race laps on each compound" loading={overview.isLoading} height={300}>
          {shareOpt && <EChart option={shareOpt} height={300} ariaLabel="Compound share per race" />}
        </Panel>
        <Panel className="xl:col-span-4" title="Average stint length" description={`${season} · laps per set of tyres`} loading={overview.isLoading} height={300} footnote={bc.some((x) => x.compound === "UNKNOWN") ? "Stints with an unrecorded compound are excluded." : undefined}>
          {stintOpt && <EChart option={stintOpt} height={300} ariaLabel="Average stint length by compound" />}
        </Panel>
      </div>

      <Panel
        title={race.data ? `Race strategy · ${shortRace(races.find((r) => r.race_id === raceId)?.name ?? "")}` : "Race strategy"}
        description="Stints for every driver, in finishing order"
        actions={races.length > 0 && <RaceSelect races={races} value={raceId} onChange={(id) => set({ race: id })} />}
        loading={race.isLoading}
        empty={race.data && !race.data.stints.length ? "No stint data for this race." : false}
        height={gantt?.h ?? 460}
        footnote={
          <span className="flex flex-wrap gap-3">
            {["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-[2px] border border-[#c4c9ce]" style={{ background: COMPOUND[c].color }} />
                {COMPOUND[c].label}
              </span>
            ))}
          </span>
        }
      >
        {gantt && <EChart option={gantt.opt} height={gantt.h} ariaLabel="Tyre strategy chart" />}
      </Panel>

      <Panel
        title="Compound usage by driver"
        description={`Laps per compound across ${season}`}
        actions={
          ents.data && (
            <EntityPicker
              items={ents.data.drivers.map((d) => ({ id: d.driver_id, label: d.driver_name, short: driverCode(d), teamRef: d.constructor_ref, sub: d.constructor_name ?? "" }))}
              selected={ids}
              onChange={(v) => set({ drivers: v })}
              placeholder="Choose drivers"
              max={8}
              className="w-[280px]"
            />
          )
        }
        loading={usage.isLoading}
        height={Math.max(200, ids.length * 34 + 60)}
      >
        {usageOpt && <EChart option={usageOpt} height={Math.max(200, ids.length * 34 + 60)} ariaLabel="Compound usage by driver" />}
      </Panel>
    </div>
  );
}

/* ================================================================ weather */
function Weather({ inSeason, years }: { inSeason: number | null; years: number[] }) {
  const races = useApi<Row[]>("/weather/races", { season: inSeason });
  const summary = useApi<{ summary: Row; wet_vs_dry: Row[]; correlations: Row[] }>("/weather/summary", { season: inSeason });
  const s = summary.data?.summary;
  const label = inSeason ? String(inSeason) : `${Math.min(...years)}–${Math.max(...years)}`;

  const tempOpt = useMemo(() => {
    const r = races.data;
    if (!r?.length) return null;
    const names = r.map((x) => `${String(x.year).slice(2)}·R${x.round}`);
    const keys = [
      { k: "track_temp_avg", name: "Track temperature", color: CATEGORICAL[1] },
      { k: "air_temp_avg", name: "Air temperature", color: CATEGORICAL[0] },
    ];
    return {
      textStyle,
      grid: { left: 8, right: 16, top: 34, bottom: 8, containLabel: true },
      legend: { ...legendBase, data: keys.map((k) => ({ name: k.name, itemStyle: { color: k.color } })) },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        formatter: (ps: { dataIndex: number }[]) => {
          const x = r[ps[0].dataIndex];
          return (
            tipTitle(`${x.year} ${shortRace(x.race_name)}`, x.rainfall ? "rain recorded" : "dry") +
            tipRow("Track", `${x.track_temp_avg.toFixed(1)}°C (${x.track_temp_min}–${x.track_temp_max})`, CATEGORICAL[1]) +
            tipRow("Air", `${x.air_temp_avg.toFixed(1)}°C`, CATEGORICAL[0]) +
            tipRow("Humidity", `${x.humidity_avg.toFixed(0)}%`) +
            tipRow("Wind", `${x.wind_speed_avg.toFixed(1)} m/s`)
          );
        },
      },
      xAxis: categoryAxis(names, { axisLabel: { color: INK.muted, fontSize: 10, interval: names.length > 26 ? 2 : 0, rotate: names.length > 20 ? 45 : 0 } }),
      yAxis: valueAxis({ axisLabel: { formatter: "{value}°", color: INK.muted, fontSize: 11 } }),
      series: keys.map((k, ki) => ({
        name: k.name,
        type: "line",
        data: r.map((x) => x[k.k]),
        symbolSize: 6,
        lineStyle: { width: 2, color: k.color },
        itemStyle: { color: k.color },
        markLine:
          ki === 0
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { color: "rgba(28,111,209,0.45)", type: "solid", width: 6, cap: "round" },
                label: { show: true, formatter: "Rain", position: "end", color: "#1c6fd1", fontSize: 10 },
                data: r.flatMap((x, i) => (x.rainfall ? [{ xAxis: names[i] }] : [])),
              }
            : undefined,
      })),
    };
  }, [races.data]);

  const scatterOpt = useMemo(() => {
    const r = races.data?.filter((x) => x.avg_dry_stint != null);
    if (!r?.length) return null;
    return xyScatterOption(
      r.map((x) => ({ x: x.track_temp_avg, y: x.avg_dry_stint, label: `${x.year} ${shortRace(x.race_name)}`, sub: x.rainfall ? "rain recorded" : "dry", color: x.rainfall ? CATEGORICAL[0] : INK.neutral })),
      { xName: "Average track temperature (°C)", yName: "Avg dry-tyre stint (laps)", legend: [{ name: "Dry", color: INK.neutral }, { name: "Rain recorded", color: CATEGORICAL[0] }] },
    );
  }, [races.data]);

  const wvd = summary.data?.wet_vs_dry ?? [];
  const dry = wvd.find((x) => x.condition === "Dry");
  const wet = wvd.find((x) => x.condition !== "Dry");
  const compareRows: { label: string; key: string; f: (v: number) => string }[] = [
    { label: "Races", key: "races", f: (v) => fmt.int(v) },
    { label: "Retirements per race", key: "avg_dnfs", f: (v) => v.toFixed(2) },
    { label: "Avg places changed per driver", key: "avg_abs_change", f: (v) => v.toFixed(2) },
    { label: "Pit stops per driver", key: "stops_per_driver", f: (v) => v.toFixed(2) },
    { label: "Winner's average grid slot", key: "avg_winner_grid", f: (v) => v.toFixed(2) },
    { label: "Won from pole", key: "pole_win_rate", f: (v) => `${v.toFixed(0)}%` },
    { label: "Average track temperature", key: "track_temp", f: (v) => `${v.toFixed(1)}°C` },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Weather is recorded for {Math.min(...years)}–{Math.max(...years)} races only ({inSeason ? `showing ${inSeason}` : "showing every covered race; pick 2025 or 2026 to narrow"}).
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Air temperature" loading={summary.isLoading} value={s?.air_temp != null ? s.air_temp.toFixed(1) : "—"} unit="°C" sub={`Race average · ${label}`} />
        <KpiCard label="Track temperature" loading={summary.isLoading} value={s?.track_temp != null ? s.track_temp.toFixed(1) : "—"} unit="°C" sub={s ? `Peak ${s.hottest_track}°C` : null} />
        <KpiCard label="Humidity" loading={summary.isLoading} value={s?.humidity != null ? s.humidity.toFixed(0) : "—"} unit="%" sub="Average relative humidity" />
        <KpiCard label="Wind speed" loading={summary.isLoading} value={s?.wind_speed != null ? s.wind_speed.toFixed(1) : "—"} unit="m/s" sub="Average during races" />
        <KpiCard label="Rain recorded" loading={summary.isLoading} value={s ? `${s.wet_races}` : "—"} unit={s ? `of ${s.races} races` : undefined} sub="At any point in the race" className="col-span-2 md:col-span-1" />
      </div>

      <Panel title="Race-day temperatures" description="Average air and track temperature per race · blue rules mark races with rain recorded" loading={races.isLoading} height={290}>
        {tempOpt && <EChart option={tempOpt} height={290} ariaLabel="Air and track temperature by race" />}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-5"
          title="Rain vs dry races"
          description="Average outcomes per race"
          loading={summary.isLoading}
          contentClassName="px-0 pb-1"
          footnote={wet ? `Only ${wet.races} races had rain recorded, so differences can arise by chance. "Rain recorded" means rain at any point, not a fully wet race.` : undefined}
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Dry</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <CloudRain className="size-3" /> Rain
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compareRows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="text-muted-foreground">{r.label}</TableCell>
                  <TableCell className="text-right font-medium">{dry?.[r.key] != null ? r.f(dry[r.key]) : "—"}</TableCell>
                  <TableCell className="text-right font-medium">{wet?.[r.key] != null ? r.f(wet[r.key]) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel className="xl:col-span-4" title="Track temperature vs stint length" description="Average dry-compound stint per race" loading={races.isLoading} height={300}>
          {scatterOpt && <EChart option={scatterOpt} height={300} ariaLabel="Track temperature versus stint length" />}
        </Panel>
        <Panel
          className="xl:col-span-3"
          title="Associations"
          description="Pearson correlation across races"
          loading={summary.isLoading}
          footnote="Correlation is not causation: circuit layout, tyre allocation and calendar timing all vary with weather."
        >
          <ul className="space-y-3">
            {summary.data?.correlations.map((c) => (
              <li key={c.label}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="font-semibold whitespace-nowrap tabular">{c.r != null ? `r = ${c.r.toFixed(2)}` : "n/a"}</span>
                </div>
                <div className="relative mt-1.5 h-1.5 rounded-full bg-secondary">
                  <span className="absolute top-[-2px] left-1/2 h-2.5 w-px bg-[#c4c9ce]" />
                  {c.r != null && (
                    <span
                      className="absolute top-0 h-1.5 rounded-full"
                      style={{ background: c.r >= 0 ? INK.gain : INK.loss, left: c.r >= 0 ? "50%" : `${50 + c.r * 50}%`, width: `${Math.abs(c.r) * 50}%` }}
                    />
                  )}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  n = {c.n} · {c.r == null ? "" : Math.abs(c.r) < 0.2 ? "negligible" : Math.abs(c.r) < 0.4 ? "weak" : Math.abs(c.r) < 0.6 ? "moderate" : "strong"}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
