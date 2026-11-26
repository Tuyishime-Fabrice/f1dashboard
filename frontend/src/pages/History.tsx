import { useMemo, useState } from "react";

import { careerOption, rankingOption } from "@/charts/builders";
import { categoryAxis, legendBase, textStyle, tipRow, tipTitle, tooltipBase, valueAxis } from "@/charts/theme";
import { EChart } from "@/components/charts/EChart";
import { KpiCard } from "@/components/common/KpiCard";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { Portrait } from "@/components/common/Portrait";
import { Segmented } from "@/components/common/Segmented";
import { TeamLabel } from "@/components/common/Team";
import { EntityPicker } from "@/components/filters/EntityPicker";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, type ConstructorStats, type DriverStats, type Row } from "@/lib/api";
import { CATEGORICAL, INK, teamColor } from "@/lib/colors";
import { driverCode, fmt } from "@/lib/format";
import { useFilters } from "@/state/filters";

type DMetric = "wins" | "podiums" | "poles" | "starts";

export default function History() {
  const { getIds, set, seasons } = useFilters();
  const [dm, setDm] = useState<DMetric>("wins");
  const [cm, setCm] = useState<"wins" | "titles" | "poles">("wins");
  const [careerMetric, setCareerMetric] = useState<"wins" | "points">("wins");
  const drivers = useApi<DriverStats[]>("/drivers/leaderboard", { metric: dm, limit: 20 });
  const teams = useApi<ConstructorStats[]>("/constructors/leaderboard", { metric: cm, limit: 15 });
  const champions = useApi<Row[]>("/history/champions");
  const titles = useApi<{ drivers: Row[]; constructors: Row[] }>("/history/titles");
  const eras = useApi<{ seasons: Row[]; points_systems: Row[] }>("/history/eras");
  const circuits = useApi<Row[]>("/history/circuits", { limit: 15 });
  const allDrivers = useApi<Row[]>("/meta/drivers");
  const urlIds = getIds("legends");
  const defaultIds = useMemo(() => (allDrivers.data ?? []).slice(0, 5).map((d) => d.driver_id), [allDrivers.data]);
  const ids = urlIds.length ? urlIds : defaultIds;
  const careers = useApi<Row[]>(ids.length ? "/history/careers" : null, { ids });

  const totalRaces = seasons.reduce((a, s) => a + s.races, 0);
  const topTitle = titles.data?.drivers[0];

  const dOpt = useMemo(
    () =>
      drivers.data
        ? rankingOption(
            drivers.data.map((d) => ({ label: d.driver_name, sub: `${d.first_year}–${d.last_year} · ${fmt.pct(d.win_rate)} win rate`, value: d[dm] as number })),
            { valueLabel: dm[0].toUpperCase() + dm.slice(1), maxBars: 20 },
          )
        : null,
    [drivers.data, dm],
  );
  const cOpt = useMemo(
    () =>
      teams.data
        ? rankingOption(
            teams.data.map((c) => ({ label: c.constructor_name ?? "", sub: `${c.first_year}–${c.last_year}`, value: c[cm] as number, color: teamColor(c.constructor_ref, c.constructor_id) })),
            { valueLabel: cm[0].toUpperCase() + cm.slice(1), maxBars: 15 },
          )
        : null,
    [teams.data, cm],
  );

  const eraOpt = useMemo(() => {
    const e = eras.data?.seasons.filter((s) => !s.in_progress);
    if (!e) return null;
    const keys = [
      { k: "champion_win_rate", name: "Champion's win rate", color: INK.neutral },
      { k: "champion_share_modern", name: "Champion's share of points (re-scored)", color: CATEGORICAL[0] },
    ];
    return {
      textStyle,
      grid: { left: 8, right: 16, top: 34, bottom: 30, containLabel: true },
      legend: { ...legendBase, data: keys.map((k) => ({ name: k.name, itemStyle: { color: k.color } })) },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        formatter: (ps: { dataIndex: number; seriesIndex: number; value: number }[]) => {
          const s = e[ps[0].dataIndex];
          const champ = champions.data?.find((c) => c.year === s.year);
          return tipTitle(String(s.year), champ?.driver_name) + ps.map((p) => tipRow(keys[p.seriesIndex].name, fmt.pct(p.value), keys[p.seriesIndex].color)).join("") + tipRow("Margin (re-scored)", fmt.pct(s.margin_pct_modern));
        },
      },
      dataZoom: [{ type: "inside" }],
      xAxis: categoryAxis(e.map((s) => String(s.year)), { boundaryGap: false }),
      yAxis: valueAxis({ max: 100, axisLabel: { formatter: "{value}%", color: INK.muted, fontSize: 11 } }),
      series: keys.map((k) => ({ name: k.name, type: "line", data: e.map((s) => s[k.k]), symbol: "none", lineStyle: { width: 2, color: k.color }, itemStyle: { color: k.color } })),
    };
  }, [eras.data, champions.data]);

  const systemsOpt = useMemo(() => {
    const p = eras.data?.points_systems;
    if (!p) return null;
    return {
      textStyle,
      grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: "axis", formatter: (ps: { dataIndex: number }[]) => tipTitle(String(p[ps[0].dataIndex].year)) + tipRow("Points for a win", String(p[ps[0].dataIndex].win_points)) + tipRow("Scoring positions", `Top ${p[ps[0].dataIndex].scoring_positions}`) },
      xAxis: categoryAxis(p.map((r) => String(r.year)), { boundaryGap: false }),
      yAxis: valueAxis({ min: 0 }),
      series: [{ type: "line", step: "end", data: p.map((r) => r.win_points), symbol: "none", lineStyle: { width: 2, color: INK.neutral }, areaStyle: { color: "rgba(58,63,69,0.06)" } }],
    };
  }, [eras.data]);

  const careerOpt = useMemo(() => {
    const c = careers.data;
    if (!c?.length) return null;
    const ordered = ids.map((id) => c.find((x) => x.driver_id === id)).filter(Boolean) as Row[];
    return careerOption(
      ordered.map((d, i) => ({ name: `${d.driver_name} (${d.first_year}–${String(d.last_year).slice(2)})`, color: CATEGORICAL[i % CATEGORICAL.length], values: careerMetric === "wins" ? d.cum_wins : d.cum_modern_points })),
      careerMetric === "wins" ? "Cumulative wins" : "Cumulative points (2010+ scale)",
    );
  }, [careers.data, ids, careerMetric]);

  return (
    <div className="space-y-4">
      <PageHeader title="History" subtitle={`Every World Championship season since 1950`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Seasons" value={seasons.length} sub={`${seasons[seasons.length - 1]?.year}–${seasons[0]?.year}`} />
        <KpiCard label="Grands Prix" value={fmt.int(totalRaces)} sub="Championship races in the dataset" />
        <KpiCard
          label="Most drivers' titles"
          loading={titles.isLoading}
          value={topTitle ? `${topTitle.titles}` : "—"}
          unit="titles"
          sub={titles.data ? titles.data.drivers.filter((d) => d.titles === topTitle?.titles).map((d) => d.surname).join(" & ") : null}
          media={topTitle && <Portrait kind="drivers" refKey={topTitle.driver_ref} alt={topTitle.driver_name} fallback={driverCode(topTitle)} rounded="full" className="size-11 text-xs" />}
        />
        <KpiCard label="Most constructors' titles" loading={titles.isLoading} accent={teamColor(titles.data?.constructors[0]?.constructor_ref)} value={titles.data?.constructors[0]?.constructor_name ?? "—"} sub={titles.data ? `${titles.data.constructors[0].titles} titles since 1958` : null} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          title="All-time driver rankings"
          description="Top 20 · count metrics are not adjusted for season length"
          actions={
            <Segmented<DMetric>
              value={dm}
              onChange={setDm}
              options={[
                { value: "wins", label: "Wins" },
                { value: "podiums", label: "Podiums" },
                { value: "poles", label: "Poles" },
                { value: "starts", label: "Starts" },
              ]}
            />
          }
          loading={drivers.isLoading}
          height={520}
          footnote="Seasons have grown from 7 to 24 races, so modern drivers accumulate counts faster — see win rate in the tooltip."
        >
          {dOpt && <EChart option={dOpt} height={520} ariaLabel="All-time driver ranking" />}
        </Panel>
        <Panel
          className="xl:col-span-5"
          title="All-time constructor rankings"
          description="Top 15"
          actions={
            <Segmented
              value={cm}
              onChange={(v) => setCm(v as typeof cm)}
              options={[
                { value: "wins", label: "Wins" },
                { value: "titles", label: "Titles" },
                { value: "poles", label: "Poles" },
              ]}
            />
          }
          loading={teams.isLoading}
          height={520}
          footnote="Team identities follow the dataset: renamed entries (e.g. Toro Rosso → AlphaTauri → RB) are separate constructors."
        >
          {cOpt && <EChart option={cOpt} height={520} ariaLabel="All-time constructor ranking" />}
        </Panel>
      </div>

      <Panel
        title="Career trajectories"
        description={`Cumulative ${careerMetric === "wins" ? "wins" : "re-scored points"} by career start — aligns drivers from different eras on the same axis`}
        actions={
          <>
            <Segmented
              value={careerMetric}
              onChange={(v) => setCareerMetric(v as typeof careerMetric)}
              options={[
                { value: "wins", label: "Wins" },
                { value: "points", label: "Re-scored points" },
              ]}
            />
            <EntityPicker
              items={(allDrivers.data ?? []).filter((d) => d.starts > 0).map((d) => ({ id: d.driver_id, label: d.driver_name, short: driverCode(d), sub: `${d.wins} wins` }))}
              selected={ids}
              onChange={(v) => set({ legends: v })}
              placeholder="Choose drivers"
              max={6}
              className="w-[280px]"
            />
          </>
        }
        loading={careers.isLoading}
        height={360}
        footnote={
          careerMetric === "points"
            ? "Re-scored points apply the 2010+ scale (25-18-15-12-10-8-6-4-2-1) to every race result, without sprint or fastest-lap points, so totals are comparable across eras. They are not official championship points."
            : "Shared drives in the 1950s count as one start."
        }
      >
        {careerOpt && <EChart option={careerOpt} height={360} ariaLabel="Career trajectories" />}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-8"
          title="Champion dominance by season"
          description="Era-neutral measures: share of races won and share of all points under a single scale"
          loading={eras.isLoading}
          height={300}
          footnote="Raw championship points are not used here: the points for a win changed from 8 to 9, 10 and 25, and dropped-score rules applied until 1990."
        >
          {eraOpt && <EChart option={eraOpt} height={300} ariaLabel="Champion dominance by season" />}
        </Panel>
        <Panel className="xl:col-span-4" title="Points for a race win" description="Typical value per season — why raw points are not comparable" loading={eras.isLoading} height={300}>
          {systemsOpt && <EChart option={systemsOpt} height={300} ariaLabel="Points awarded for a win by season" />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="World champions" description="Drivers' and constructors' champions by year" loading={champions.isLoading} contentClassName="px-0 pb-1" height={480}>
          <div className="max-h-[520px] overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-[1] bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Year</TableHead>
                  <TableHead>Drivers' champion</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                  <TableHead className="text-right">Wins</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Margin</TableHead>
                  <TableHead>Constructors'</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {champions.data?.map((c) => (
                  <TableRow key={c.year}>
                    <TableCell className="font-semibold">
                      {c.year}
                      {c.in_progress && (
                        <Badge variant="live" className="ml-2">
                          Leader
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <TeamLabel name={c.driver_name} teamRef={c.driver_team_ref} className="font-medium" />
                      <span className="ml-2 hidden text-xs text-muted-foreground lg:inline">{c.driver_team}</span>
                    </TableCell>
                    <TableCell className="text-right">{fmt.points(c.points)}</TableCell>
                    <TableCell className="text-right">
                      {c.wins}
                      <span className="text-xs text-muted-foreground">/{c.races}</span>
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{c.margin != null ? `+${fmt.points(c.margin)}` : "—"}</TableCell>
                    <TableCell>{c.constructor_name ? <TeamLabel name={c.constructor_name} teamRef={c.constructor_ref} /> : <span className="text-xs text-muted-foreground">Not awarded</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
        <Panel className="xl:col-span-5" title="Most-raced circuits" description="Championship Grands Prix hosted, with the most successful driver at each" loading={circuits.isLoading} contentClassName="px-0 pb-1" height={480}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Circuit</TableHead>
                <TableHead className="text-right">Races</TableHead>
                <TableHead>Most wins</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {circuits.data?.map((c) => (
                <TableRow key={c.circuit_id}>
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.location}, {c.country} · {c.first_year}–{c.last_year}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{c.races}</TableCell>
                  <TableCell>
                    {c.top_winner}
                    <span className="ml-1 text-xs text-muted-foreground">×{c.top_winner_wins}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}
