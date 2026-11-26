import { useMemo, useState } from "react";

import { dominanceOption, progressionOption, seasonLinesOption } from "@/charts/builders";
import { tipRow, tipTitle } from "@/charts/theme";
import { EChart } from "@/components/charts/EChart";
import { KpiCard } from "@/components/common/KpiCard";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { Portrait } from "@/components/common/Portrait";
import { Segmented } from "@/components/common/Segmented";
import { TeamSwatch } from "@/components/common/Team";
import { EntityPicker, type PickerItem } from "@/components/filters/EntityPicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, type ConstructorStats, type Progression, type Row } from "@/lib/api";
import { INK, SEQ_BLUE, teamColor } from "@/lib/colors";
import { fmt } from "@/lib/format";
import { useImage } from "@/lib/images";
import { useFilters } from "@/state/filters";

import { textStyle, tooltipBase } from "@/charts/theme";

export default function Constructors() {
  const { season, seasonInfo, getIds, set } = useFilters();
  const standings = useApi<ConstructorStats[]>("/constructors/standings", { season });
  const prog = useApi<Progression>("/overview/constructor-progression", { season, top: 11 });
  const allTeams = useApi<Row[]>("/meta/constructors");
  const urlIds = getIds("constructors");
  const ids = useMemo(() => (urlIds.length ? urlIds : (standings.data?.slice(0, 3).map((c) => c.constructor_id as number) ?? [])), [urlIds, standings.data]);
  const compare = useApi<{ stats: ConstructorStats[]; by_season: Row[] }>(ids.length ? "/constructors/compare" : null, { ids });
  const [era, setEra] = useState<"1958" | "1980" | "2000">("1980");
  const dominance = useApi<{ years: number[]; races: number[]; series: Row[] }>("/constructors/dominance", { year_from: Number(era), top: 8 });
  const heat = useApi<{ years: number[]; constructors: Row[]; cells: Row[] }>("/constructors/heatmap", { year_from: Math.max(1958, season - 19), year_to: season, top: 14 });
  const [trend, setTrend] = useState<"position" | "points" | "wins">("position");

  const preSeason = season < 1958;
  const st = standings.data ?? [];
  const leader = st[0];
  const leaderImg = useImage("constructors", leader?.constructor_ref);
  const mostWins = [...st].sort((a, b) => b.wins - a.wins)[0];
  const mostPoles = [...st].sort((a, b) => b.poles - a.poles)[0];
  const mostOneTwos = [...st].sort((a, b) => b.one_twos - a.one_twos)[0];

  const progOpt = useMemo(() => (prog.data && prog.data.series.length ? progressionOption(prog.data, "constructor", 6) : null), [prog.data]);
  const domOpt = useMemo(() => {
    const d = dominance.data;
    if (!d) return null;
    return dominanceOption(
      d.years,
      d.series.map((s) => ({ name: s.constructor_name, color: s.constructor_id === -1 ? "#d5d9dd" : teamColor(s.constructor_ref, s.constructor_id), share: s.share, wins: s.wins })),
      d.races,
    );
  }, [dominance.data]);

  const heatOpt = useMemo(() => {
    const h = heat.data;
    if (!h || !h.years.length) return null;
    const rows = h.constructors;
    const cells = h.cells.map((c) => [h.years.indexOf(c.year), rows.findIndex((r) => r.constructor_id === c.constructor_id), c.position, c.points]);
    return {
      option: {
        textStyle,
        grid: { left: 4, right: 8, top: 8, bottom: 4, containLabel: true },
        tooltip: {
          ...tooltipBase,
          formatter: (p: { data: number[] }) => {
            const [x, y, pos, pts] = p.data;
            return tipTitle(rows[y].constructor_name, String(h.years[x])) + tipRow("Championship", fmt.ord(pos)) + tipRow("Points", fmt.points(pts));
          },
        },
        xAxis: { type: "category", data: h.years.map(String), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK.muted, fontSize: 10, interval: 0, rotate: h.years.length > 14 ? 45 : 0 } },
        yAxis: { type: "category", data: rows.map((r) => r.constructor_name), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK.text, fontSize: 11 } },
        visualMap: {
          show: false,
          type: "piecewise",
          dimension: 2,
          pieces: [
            { min: 1, max: 1, color: SEQ_BLUE[6] },
            { min: 2, max: 2, color: SEQ_BLUE[5] },
            { min: 3, max: 3, color: SEQ_BLUE[4] },
            { min: 4, max: 5, color: SEQ_BLUE[3] },
            { min: 6, max: 8, color: SEQ_BLUE[1] },
            { min: 9, max: 99, color: "#e3e9f0" },
          ],
        },
        series: [
          {
            type: "heatmap",
            data: cells,
            itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 3 },
            label: { show: true, fontSize: 10, color: INK.text, formatter: (p: { data: number[] }) => String(p.data[2]) },
          },
        ],
      },
      height: rows.length * 26 + 50,
    };
  }, [heat.data]);

  const stats = useMemo(() => {
    const byId = new Map((compare.data?.stats ?? []).map((s) => [s.constructor_id, s]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as ConstructorStats[];
  }, [compare.data, ids]);

  const trendOpt = useMemo(() => {
    const rows = compare.data?.by_season;
    if (!rows?.length) return null;
    const ys = rows.map((r) => r.year as number);
    const from = Math.max(Math.min(...ys), trend === "position" ? 1958 : 1950);
    const years: number[] = [];
    for (let y = from; y <= Math.max(...ys); y++) years.push(y);
    return seasonLinesOption(
      years,
      stats.map((s) => ({
        name: s.constructor_name ?? "",
        color: teamColor(s.constructor_ref, s.constructor_id),
        values: years.map((y) => {
          const r = rows.find((x) => x.year === y && x.constructor_id === s.constructor_id);
          return r ? (trend === "position" ? r.position : trend === "points" ? r.points : r.wins) : null;
        }),
      })),
      { yName: trend === "position" ? "Championship position" : trend === "points" ? "Points" : "Wins", inverse: trend === "position", min: trend === "position" ? 1 : 0, format: trend === "points" ? (v) => fmt.points(v) : undefined },
    );
  }, [compare.data, stats, trend]);

  const picker: PickerItem[] = useMemo(() => {
    const inSeason = new Set(st.map((c) => c.constructor_id));
    return [
      ...st.map((c) => ({ id: c.constructor_id as number, label: c.constructor_name ?? "", teamRef: c.constructor_ref, group: `${season} entrants` })),
      ...(allTeams.data ?? [])
        .filter((c) => !inSeason.has(c.constructor_id) && c.wins > 0)
        .map((c) => ({ id: c.constructor_id, label: c.constructor_name, teamRef: c.constructor_ref, sub: `${c.wins} wins`, group: "Race-winning constructors" })),
    ];
  }, [st, allTeams.data, season]);

  return (
    <div className="space-y-4">
      <PageHeader title="Constructors" inProgress={seasonInfo?.in_progress} subtitle={`Team performance in ${season} and across championship history`}>
        <EntityPicker items={picker} selected={ids} onChange={(v) => set({ constructors: v })} placeholder="Compare constructors" max={4} className="w-[320px]" />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={seasonInfo?.in_progress ? "Championship leader" : "Constructors' champion"}
          loading={standings.isLoading}
          accent={teamColor(leader?.constructor_ref)}
          value={preSeason ? "—" : (leader?.constructor_name ?? "—")}
          sub={preSeason ? "Title introduced in 1958" : leader ? `${fmt.points(leader.points)} pts · ${fmt.num(leader.points_per_race, 1)} per race` : null}
          media={!preSeason && leader && leaderImg && <Portrait kind="constructors" refKey={leader.constructor_ref} alt={leader.constructor_name ?? ""} fallback="" className="hidden h-12 w-20 sm:block" showCredit={false} objectPosition="50% 50%" />}
        />
        <KpiCard label="Most wins" loading={standings.isLoading} accent={teamColor(mostWins?.constructor_ref)} value={mostWins?.constructor_name ?? "—"} sub={mostWins ? `${mostWins.wins} of ${seasonInfo?.races} races` : null} />
        <KpiCard label="Most poles" loading={standings.isLoading} accent={teamColor(mostPoles?.constructor_ref)} value={mostPoles?.poles ? mostPoles.constructor_name : "—"} sub={mostPoles?.poles ? `${mostPoles.poles} pole positions` : null} />
        <KpiCard label="Most 1–2 finishes" loading={standings.isLoading} accent={teamColor(mostOneTwos?.constructor_ref)} value={mostOneTwos?.one_twos ? mostOneTwos.constructor_name : "—"} sub={mostOneTwos?.one_twos ? `${mostOneTwos.one_twos} one-two results` : "No one-two finishes"} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title={`Championship standings · ${season}`} loading={standings.isLoading} contentClassName="px-0 pb-1" height={360}
          footnote="Points per race uses official championship points. Podiums count every car on the podium.">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">Pos</TableHead>
                <TableHead>Constructor</TableHead>
                <TableHead className="text-right">Pts</TableHead>
                <TableHead className="text-right">Wins</TableHead>
                <TableHead className="text-right">Podiums</TableHead>
                <TableHead className="text-right">Poles</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Pts / race</TableHead>
                <TableHead className="hidden text-right md:table-cell">Avg finish</TableHead>
                <TableHead className="hidden text-right md:table-cell">DNF rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {st.map((c) => (
                <TableRow key={c.constructor_id}>
                  <TableCell className="font-semibold">{c.championship_position ?? "–"}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <TeamSwatch teamRef={c.constructor_ref} id={c.constructor_id} />
                      {c.constructor_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{c.points != null ? fmt.points(c.points) : "–"}</TableCell>
                  <TableCell className="text-right">{c.wins}</TableCell>
                  <TableCell className="text-right">{c.podiums}</TableCell>
                  <TableCell className="text-right">{c.poles}</TableCell>
                  <TableCell className="hidden text-right sm:table-cell">{fmt.num(c.points_per_race, 1)}</TableCell>
                  <TableCell className="hidden text-right md:table-cell">{fmt.num(c.avg_finish, 1)}</TableCell>
                  <TableCell className="hidden text-right text-muted-foreground md:table-cell">{fmt.pct(c.dnf_rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel className="xl:col-span-5" title="Points progression" description="Cumulative constructors' points by round" loading={prog.isLoading} empty={preSeason ? "The constructors' championship was first held in 1958." : false} height={360}>
          {progOpt && <EChart option={progOpt} height={360} ariaLabel="Constructor points progression" />}
        </Panel>
      </div>

      <Panel
        title="Historical dominance"
        description="Share of each season's Grands Prix won · eight most successful teams of the period, the rest grouped"
        actions={
          <Segmented
            value={era}
            onChange={(v) => setEra(v as typeof era)}
            options={[
              { value: "1958", label: "Since 1958" },
              { value: "1980", label: "Since 1980" },
              { value: "2000", label: "Since 2000" },
            ]}
          />
        }
        loading={dominance.isLoading}
        height={340}
        footnote="Win share is comparable across eras because it does not depend on the points system. Shared drives in the 1950s can credit two constructors in one race."
      >
        {domOpt && <EChart option={domOpt} height={340} ariaLabel="Share of race wins by constructor per season" />}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-6"
          title="Constructor comparison"
          description="Selected constructors by season"
          actions={
            <Segmented
              value={trend}
              onChange={(v) => setTrend(v as typeof trend)}
              options={[
                { value: "position", label: "Position" },
                { value: "points", label: "Points" },
                { value: "wins", label: "Wins" },
              ]}
            />
          }
          loading={compare.isLoading}
          empty={!trendOpt ? "Select constructors to compare." : false}
          height={330}
          footnote={trend === "points" ? "Raw points are not comparable across scoring systems (e.g. 10 points per win before 2010, 25 since)." : undefined}
        >
          {trendOpt && <EChart option={trendOpt} height={330} ariaLabel="Constructor comparison by season" />}
        </Panel>
        <Panel
          className="xl:col-span-6"
          title="Championship position by season"
          description={heat.data?.years.length ? `${heat.data.years[0]}–${heat.data.years[heat.data.years.length - 1]} · darker = higher finish` : undefined}
          loading={heat.isLoading}
          empty={!heatOpt ? "No constructors' championship in this period." : false}
          height={heatOpt?.height ?? 330}
          contentClassName="overflow-x-auto scrollbar-thin"
        >
          {heatOpt && (
            <div style={{ minWidth: 560 }}>
              <EChart option={heatOpt.option} height={heatOpt.height} ariaLabel="Constructor championship positions heatmap" />
            </div>
          )}
        </Panel>
      </div>

      {stats.length > 0 && (
        <Panel title="Career totals" description="All seasons, selected constructors" contentClassName="px-0 pb-1">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Constructor</TableHead>
                <TableHead className="text-right">Seasons</TableHead>
                <TableHead className="text-right">Races</TableHead>
                <TableHead className="text-right">Wins</TableHead>
                <TableHead className="text-right">Win rate</TableHead>
                <TableHead className="text-right">Podiums</TableHead>
                <TableHead className="text-right">Poles</TableHead>
                <TableHead className="text-right">1–2s</TableHead>
                <TableHead className="text-right">Titles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((s) => (
                <TableRow key={s.constructor_id}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <TeamSwatch teamRef={s.constructor_ref} id={s.constructor_id} />
                      {s.constructor_name}
                      <span className="text-xs font-normal text-muted-foreground">
                        {s.first_year}–{s.last_year}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{s.seasons_raced}</TableCell>
                  <TableCell className="text-right">{fmt.int(s.races)}</TableCell>
                  <TableCell className="text-right font-semibold">{s.wins}</TableCell>
                  <TableCell className="text-right">{fmt.pct(s.win_rate)}</TableCell>
                  <TableCell className="text-right">{s.podiums}</TableCell>
                  <TableCell className="text-right">{s.poles}</TableCell>
                  <TableCell className="text-right">{s.one_twos}</TableCell>
                  <TableCell className="text-right font-semibold">{s.titles}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
