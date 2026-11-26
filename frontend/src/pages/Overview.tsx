import { useMemo } from "react";
import { Link } from "react-router-dom";

import { progressionOption } from "@/charts/builders";
import { EChart } from "@/components/charts/EChart";
import { KpiCard, Stat } from "@/components/common/KpiCard";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { CreditBadge, Portrait } from "@/components/common/Portrait";
import { TeamLabel, TeamSwatch } from "@/components/common/Team";
import { RaceSelect } from "@/components/filters/RaceSelect";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, type DriverStats, type Kpis, type Progression, type RaceDetail, type Row, type SeasonEntities } from "@/lib/api";
import { teamColor } from "@/lib/colors";
import { driverCode, fmt, shortRace } from "@/lib/format";
import { useCredits } from "@/lib/images";
import { useFilters } from "@/state/filters";

import { ResultsTable } from "./parts/ResultsTable";

export default function Overview() {
  const { season, seasonInfo, get, set } = useFilters();
  const kpis = useApi<Kpis>("/overview/kpis", { season });
  const prog = useApi<Progression>("/overview/driver-progression", { season, top: 8 });
  const cprog = useApi<Progression>("/overview/constructor-progression", { season, top: 10 });
  const top = useApi<DriverStats[]>("/overview/top-drivers", { season, limit: 10 });
  const winners = useApi<Row[]>("/overview/winners", { season });
  const ents = useApi<SeasonEntities>("/meta/season-entities", { season });
  const raceId = Number(get("race")) || kpis.data?.last_race?.race_id || null;
  const race = useApi<RaceDetail>(raceId ? `/races/${raceId}` : null);

  const k = kpis.data;
  const inProgress = !!seasonInfo?.in_progress;
  const leaderWord = inProgress ? "leader" : "champion";
  const progOpt = useMemo(() => (prog.data ? progressionOption(prog.data, "driver") : null), [prog.data]);
  const cprogOpt = useMemo(() => (cprog.data ? progressionOption(cprog.data, "constructor", 5) : null), [cprog.data]);
  const lead = k?.driver_leader;
  const leadStats = top.data?.find((d) => d.driver_id === lead?.driver_id);

  return (
    <div className="space-y-4">
      <SeasonBanner season={season} inProgress={inProgress} kpis={k} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Races completed"
          loading={kpis.isLoading}
          value={k?.races_completed ?? "—"}
          sub={k ? `Last: ${shortRace(k.last_race.name)} · ${fmt.shortDate(k.last_race.date)}` : null}
        />
        <KpiCard
          label={`Drivers' ${leaderWord}`}
          loading={kpis.isLoading}
          accent={teamColor(lead?.constructor_ref)}
          value={lead ? lead.surname : "—"}
          sub={lead ? `${fmt.points(lead.points)} pts · ${k?.driver_gap != null ? `+${fmt.points(k.driver_gap)} over ${k.driver_runner_up?.surname}` : ""}` : null}
        />
        <KpiCard
          label={`Constructors' ${leaderWord}`}
          loading={kpis.isLoading}
          accent={teamColor(k?.constructor_leader?.constructor_ref)}
          value={k?.constructor_leader?.constructor_name ?? "—"}
          sub={
            k?.constructor_leader
              ? `${fmt.points(k.constructor_leader.points)} pts · +${fmt.points(k.constructor_gap)} over ${k.constructor_runner_up?.constructor_name}`
              : season < 1958
                ? "Title introduced in 1958"
                : null
          }
        />
        <KpiCard
          label="Most race wins"
          loading={kpis.isLoading}
          accent={teamColor(k?.most_wins[0]?.constructor_ref)}
          value={k?.most_wins.length ? k.most_wins[0].surname : "—"}
          unit={k?.most_wins.length ? `${k.most_wins[0].wins} wins` : undefined}
          sub={k && k.most_wins.length > 1 ? `Tied with ${k.most_wins.slice(1).map((w) => w.surname).join(", ")}` : k ? `${fmt.pct((100 * (k.most_wins[0]?.wins ?? 0)) / k.races_completed, 0)} of races` : null}
        />
        <KpiCard
          label="Race wins by team"
          loading={kpis.isLoading}
          value={k ? `${k.different_winners}` : "—"}
          unit="different winners"
          sub={k?.wins_by_constructor.slice(0, 3).map((w) => `${w.constructor_name} ${w.wins}`).join(" · ")}
          className="col-span-2 md:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-8"
          title="Drivers' championship battle"
          description={`Cumulative championship points after each round · top ${prog.data?.series.length ?? 8} drivers`}
          loading={prog.isLoading}
          height={330}
          footnote={`${season >= 2021 ? "Points include sprint races. " : season < 1991 ? "Points are counted championship points (dropped results excluded). " : ""}Dashed lines mark a team's second driver.`}
        >
          {progOpt && <EChart option={progOpt} height={330} ariaLabel="Cumulative points by round for the leading drivers" />}
        </Panel>

        <Card className="flex flex-col overflow-hidden xl:col-span-4">
          <div className="flex items-start justify-between px-4 pt-3.5">
            <div>
              <div className="label-caps">{inProgress ? "Championship leader" : "World champion"}</div>
              <div className="mt-1 font-display text-[26px] leading-tight font-semibold">{lead?.driver_name ?? "—"}</div>
              {lead && <TeamLabel name={lead.constructor_name} teamRef={lead.constructor_ref} className="text-[13px] text-muted-foreground" />}
            </div>
            {lead?.code && <div className="font-display text-3xl font-bold text-[#d5d9dd]">{lead.code}</div>}
          </div>
          <div className="flex flex-1 items-stretch gap-4 px-4 pt-4 pb-4">
            <Portrait
              kind="drivers"
              refKey={lead?.driver_ref}
              alt={lead?.driver_name ?? ""}
              fallback={lead ? driverCode(lead) : ""}
              teamRef={lead?.constructor_ref}
              className="min-h-[220px] w-[46%] text-4xl"
            />
            <div className="grid flex-1 grid-cols-2 content-between gap-x-3 gap-y-4 py-1">
              <Stat label="Points" value={fmt.points(leadStats?.points)} />
              <Stat label="Wins" value={leadStats?.wins ?? "—"} />
              <Stat label="Podiums" value={leadStats?.podiums ?? "—"} />
              <Stat label="Poles" value={leadStats?.poles ?? "—"} />
              <Stat label="Avg finish" value={fmt.num(leadStats?.avg_finish)} />
              <Stat label="DNFs" value={leadStats?.dnfs ?? "—"} />
              <Stat label="Fastest laps" value={season < 2004 ? "n/a" : (leadStats?.fastest_laps ?? "—")} hint="Fastest-lap data from 2004" />
              <Stat label="Avg grid" value={fmt.num(leadStats?.avg_grid)} />
            </div>
          </div>
          {lead && (
            <Link
              to={`/drivers?season=${season}&drivers=${lead.driver_id}`}
              className="border-t border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Open driver profile →
            </Link>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-6"
          title="Constructors' championship"
          description="Cumulative points after each round"
          loading={cprog.isLoading}
          empty={cprog.data && cprog.data.series.length === 0 ? "The constructors' championship was first held in 1958." : false}
          height={300}
        >
          {cprogOpt && <EChart option={cprogOpt} height={300} ariaLabel="Constructor points progression" />}
        </Panel>

        <Panel className="xl:col-span-6" title="Top drivers" description="Ranked by championship position" loading={top.isLoading} contentClassName="px-0 pb-1" height={300}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">Pos</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Pts</TableHead>
                <TableHead className="text-right">Wins</TableHead>
                <TableHead className="text-right">Podiums</TableHead>
                <TableHead className="text-right">Poles</TableHead>
                <TableHead className="text-right">DNF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.data?.map((d) => (
                <TableRow key={d.driver_id}>
                  <TableCell className="font-semibold">{d.championship_position}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <TeamSwatch teamRef={d.constructor_ref} />
                      <span className="font-medium">{d.driver_name}</span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{d.constructor_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{fmt.points(d.points)}</TableCell>
                  <TableCell className="text-right">{d.wins}</TableCell>
                  <TableCell className="text-right">{d.podiums}</TableCell>
                  <TableCell className="text-right">{d.poles}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{d.dnfs}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Race winners" description="Most recent first" loading={winners.isLoading} contentClassName="px-0 pb-1" height={420}>
          <ul className="max-h-[456px] divide-y divide-border overflow-y-auto scrollbar-thin">
            {winners.data?.map((w) => (
              <li key={w.race_id}>
                <button
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left hover:bg-[#f8f9fa]"
                  onClick={() => set({ race: w.race_id })}
                  aria-label={`Show results for ${w.race_name}`}
                >
                  <span className="w-7 shrink-0 font-display text-sm font-semibold text-muted-foreground">R{w.round}</span>
                  <Portrait kind="drivers" refKey={w.driver_ref} alt={w.driver_name} fallback={driverCode(w)} teamRef={w.constructor_ref} rounded="full" className="size-8 text-[11px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{shortRace(w.race_name)}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <TeamSwatch teamRef={w.constructor_ref} className="h-2.5" />
                      {w.driver_name} · {w.constructor_name}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground tabular">
                    <span className="block">{fmt.shortDate(w.date)}</span>
                    <span className="block">from P{w.grid ?? "–"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          className="xl:col-span-7"
          title={race.data ? `${race.data.race.name} · results` : "Race results"}
          description={race.data ? `Round ${race.data.race.round} · ${race.data.race.circuit_name} · ${fmt.date(race.data.race.date)}` : undefined}
          actions={ents.data && <RaceSelect races={ents.data.races} value={raceId} onChange={(id) => set({ race: id })} className="w-[190px]" />}
          loading={race.isLoading}
          contentClassName="px-0 pb-1"
          height={420}
        >
          {race.data && <ResultsTable rows={race.data.results} compact maxHeight={456} />}
        </Panel>
      </div>
    </div>
  );
}

function SeasonBanner({ season, inProgress, kpis }: { season: number; inProgress: boolean; kpis?: Kpis }) {
  const { data: credits } = useCredits();
  const hero = credits?.hero?.main;
  return (
    <Card className="relative flex min-h-[112px] overflow-hidden">
      <div className="relative z-10 flex flex-1 flex-col justify-center px-5 py-4">
        <PageHeader
          title={`${season} Season`}
          inProgress={inProgress}
          subtitle={
            kpis
              ? `${kpis.races_completed} Grands Prix${kpis.sprint_weekends ? ` · ${kpis.sprint_weekends} sprint weekends` : ""} · ${
                  inProgress ? `standings after round ${kpis.last_race.round}, ${shortRace(kpis.last_race.name)}` : `final standings`
                }`
              : undefined
          }
        />
      </div>
      {hero && (
        <div className="relative hidden w-[42%] max-w-[560px] md:block">
          <img src={hero.file} alt="Formula One cars on a starting grid" className="absolute inset-0 size-full object-cover" style={{ objectPosition: "50% 60%" }} />
          <CreditBadge credit={hero} />
        </div>
      )}
    </Card>
  );
}
