import { keepPreviousData, useQuery } from "@tanstack/react-query";

/* ------------------------------------------------------------------ types */
export interface DriverRef {
  driver_id: number;
  driver_ref: string;
  code: string | null;
  driver_name: string;
  surname: string;
  nationality?: string;
}
export interface TeamRef {
  constructor_id: number | null;
  constructor_ref: string | null;
  constructor_name: string | null;
}
export type DriverTeam = DriverRef & TeamRef;

export interface Season {
  year: number;
  races: number;
  last_round: number;
  first_date: string;
  last_date: string;
  in_progress: boolean;
  sprint_weekends: number;
  has_qualifying: boolean;
  has_lap_times: boolean;
  has_pit_stops: boolean;
  has_tyres: boolean;
  has_weather: boolean;
  has_constructor_standings: boolean;
}

export interface RaceRef {
  race_id: number;
  round: number;
  name: string;
  date: string;
  circuit_id: number;
  circuit_name: string;
  circuit_ref: string;
  country: string;
  has_sprint: boolean;
  driver_name: string | null;
  code: string | null;
}

export interface SeasonEntities {
  season: number;
  drivers: (DriverTeam & { standing: number | null; points: number | null })[];
  constructors: (TeamRef & { standing: number | null; points: number | null })[];
  races: RaceRef[];
}

export interface DriverStats extends DriverTeam {
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  dnfs: number;
  classified: number;
  avg_finish: number | null;
  avg_positions_gained: number | null;
  total_positions_gained: number | null;
  avg_grid: number | null;
  avg_quali: number | null;
  quali_sessions: number;
  fastest_laps: number;
  points: number;
  race_points: number;
  best_championship: number | null;
  titles: number;
  seasons: number | null;
  championship_position: number | null;
  dnf_rate: number | null;
  win_rate: number | null;
  podium_rate: number | null;
  first_year: number;
  last_year: number;
}

export interface ConstructorStats extends TeamRef {
  nationality: string;
  races: number;
  car_starts: number;
  wins: number;
  podiums: number;
  poles: number;
  one_twos: number;
  dnfs: number;
  avg_finish: number | null;
  points: number | null;
  race_points: number;
  points_per_race: number | null;
  best_championship: number | null;
  titles: number;
  championship_position: number | null;
  seasons: number | null;
  seasons_raced: number;
  win_rate: number | null;
  dnf_rate: number | null;
  first_year: number;
  last_year: number;
}

export interface Kpis {
  season: number;
  in_progress: boolean;
  races_completed: number;
  sprint_weekends: number;
  last_race: { race_id: number; round: number; name: string; date: string; circuit_name: string; country: string };
  driver_leader: (DriverTeam & { points: number; wins: number }) | null;
  driver_runner_up: (DriverTeam & { points: number }) | null;
  driver_gap: number | null;
  constructor_leader: (TeamRef & { points: number; wins: number }) | null;
  constructor_runner_up: (TeamRef & { points: number }) | null;
  constructor_gap: number | null;
  most_wins: (DriverTeam & { wins: number })[];
  different_winners: number;
  wins_by_constructor: (TeamRef & { wins: number })[];
  total_wins: number;
}

export interface RoundLabel {
  race_id: number;
  round: number;
  name: string;
  date: string;
  circuit_name: string;
  country: string;
  has_sprint: boolean;
}

export interface ProgressionSeries extends Partial<DriverRef>, TeamRef {
  final_position: number;
  points: (number | null)[];
  positions: (number | null)[];
}
export interface Progression {
  rounds: RoundLabel[];
  series: ProgressionSeries[];
}

export interface ResultRow extends DriverTeam {
  position: number | null;
  position_text: string;
  position_order: number;
  grid: number | null;
  points: number;
  laps: number;
  race_time: string | null;
  status: string;
  status_group: string;
  fastest_lap_time: string | null;
  fastest_lap_rank: number | null;
  positions_gained: number | null;
  is_dnf: boolean;
  classified: boolean;
}

export interface RaceInfo {
  race_id: number;
  year: number;
  round: number;
  name: string;
  date: string;
  circuit_id: number;
  circuit_name: string;
  location: string;
  country: string;
  has_sprint: boolean;
  url: string;
  circuit_ref: string;
}

export interface WeatherRow {
  air_temp_avg: number;
  air_temp_min: number;
  air_temp_max: number;
  track_temp_avg: number;
  track_temp_min: number;
  track_temp_max: number;
  humidity_avg: number;
  wind_speed_avg: number;
  wind_speed_max: number;
  rainfall: boolean;
}

export interface RaceDetail {
  race: RaceInfo;
  results: ResultRow[];
  pole: (DriverRef & { source: string }) | null;
  fastest_lap: (DriverTeam & { fastest_lap_time: string; fastest_lap_no: number }) | null;
  weather: WeatherRow | null;
  summary: { starters: number; classified: number; dnfs: number; laps: number; total_position_changes: number };
  pit: { stops: number; median_ms: number | null };
}

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/* ------------------------------------------------------------------ fetch */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | boolean | null | undefined | number[]>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v == null || (Array.isArray(v) && v.length === 0)) continue;
    qs.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const url = `/api${path}${qs.size ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export function useApi<T>(
  path: string | null,
  params?: Record<string, string | number | boolean | null | undefined | number[]>,
  opts?: { enabled?: boolean },
) {
  return useQuery<T, ApiError>({
    queryKey: [path, params],
    queryFn: () => apiGet<T>(path!, params),
    enabled: path != null && (opts?.enabled ?? true),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    retry: (count, err) => err.status >= 500 && count < 2,
  });
}
