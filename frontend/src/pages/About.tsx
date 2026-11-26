import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader, SectionTitle } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { Segmented } from "@/components/common/Segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, type Row } from "@/lib/api";
import { fmt } from "@/lib/format";
import { isOwnerSupplied, useCredits, type ImageCredit } from "@/lib/images";

const DATASET_LABEL: Record<string, string> = {
  results: "Race results",
  qualifying: "Qualifying",
  lap_times: "Lap times",
  pit_stops: "Pit stops",
  sprint_results: "Sprint results",
  tyre_stints: "Tyre stints",
  weather: "Weather",
  practice: "Practice sessions",
  constructor_standings: "Constructors' standings",
};

const METHODS: [string, string][] = [
  ["Race start", "A result where the driver took the start. Did-not-qualify, did-not-prequalify, did-not-start, withdrawn and 107%-rule entries are excluded. Shared 1950s drives count once per race."],
  ["Win / podium", "A classified finish in P1 / P1–P3 of the Grand Prix. Sprint results are kept separate and never count as wins or podiums."],
  ["DNF", "Started but not classified (retired or not classified). Disqualifications are counted separately."],
  ["Pole position", "The driver starting from grid slot 1, matching the official record. For 2022 sprint weekends the Friday qualifying winner is credited, as officially recorded. Where no grid slot 1 exists, qualifying P1 is used."],
  ["Championship points", "Taken from the official standings tables, which include sprint points and historical dropped-score rules. Since 2010 they equal the sum of race and sprint points exactly (validated on every build)."],
  ["Positions gained", "Grid minus finishing position for classified drivers with a known grid slot. Pit-lane starts are excluded."],
  ["Pit-stop duration", "Pit-lane time from entry to exit. Zero-duration records (missing values) and stops above 60 s (red flags, long repairs) are excluded from timing statistics but still counted as stops."],
  ["Era comparison", "Historical comparisons use rates (win %, points share) or re-score every result with the 2010+ scale (25-18-15-12-10-8-6-4-2-1). Re-scored points are labelled as such and never presented as official."],
  ["Season in progress", "The latest season is flagged as in progress because its last recorded race is before November. Its leaders are shown as leaders, not champions, and it is excluded from title counts."],
];

export default function About() {
  const cov = useApi<{ coverage: Row[]; quality: Row[] }>("/meta/coverage");
  const { data: credits } = useCredits();
  const [kind, setKind] = useState<"drivers" | "constructors" | "circuits" | "hero">("drivers");
  const list = useMemo(() => Object.entries((credits?.[kind] ?? {}) as Record<string, ImageCredit>).sort(([a], [b]) => a.localeCompare(b)), [credits, kind]);
  const counts = {
    drivers: Object.keys(credits?.drivers ?? {}).length,
    constructors: Object.keys(credits?.constructors ?? {}).length,
    circuits: Object.keys(credits?.circuits ?? {}).length,
    hero: Object.keys(credits?.hero ?? {}).length,
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Data, methods & credits" subtitle="Where every number comes from, how it is calculated, and who took the photographs" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Data coverage" description="Historical coverage differs by table; analyses are only shown where data exist" loading={cov.isLoading} contentClassName="px-0 pb-1">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Dataset</TableHead>
                <TableHead>Seasons</TableHead>
                <TableHead className="text-right">Races</TableHead>
                <TableHead className="text-right">Rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cov.data?.coverage.map((c) => (
                <TableRow key={c.dataset}>
                  <TableCell className="font-medium">{DATASET_LABEL[c.dataset] ?? c.dataset}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.first_year}–{c.last_year}
                  </TableCell>
                  <TableCell className="text-right">{fmt.int(c.races)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt.int(c.rows)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel
          className="xl:col-span-7"
          title="Data-quality notes"
          description="Known quirks found by the validation checks that run on every database build"
          loading={cov.isLoading}
          contentClassName="px-0 pb-1"
          footnote="Source: Formula 1 World Championship dataset (1950–2026, CC0). Its README/SCHEMA are partly outdated; the CSV contents were treated as the source of truth."
        >
          <Table>
            <TableBody>
              {cov.data?.quality.map((q) => (
                <TableRow key={q.name}>
                  <TableCell className="font-medium whitespace-normal">{q.name}</TableCell>
                  <TableCell className="text-right whitespace-normal text-muted-foreground">{q.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <SectionTitle>Definitions</SectionTitle>
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-md border border-border bg-card p-4 md:grid-cols-2">
        {METHODS.map(([k, v]) => (
          <div key={k} className="text-[13px] leading-relaxed">
            <span className="font-semibold">{k}. </span>
            <span className="text-muted-foreground">{v}</span>
          </div>
        ))}
      </div>

      <Panel
        title="Image credits"
        description={credits?._meta ? `${credits._meta.source} · collected ${fmt.date(credits._meta.generated)}` : "Images are collected with scripts/fetch_images.py"}
        actions={
          <Segmented
            value={kind}
            onChange={(v) => setKind(v as typeof kind)}
            options={[
              { value: "drivers", label: `Drivers (${counts.drivers})` },
              { value: "constructors", label: `Teams (${counts.constructors})` },
              { value: "circuits", label: `Circuits (${counts.circuits})` },
              { value: "hero", label: "Header" },
            ]}
          />
        }
        contentClassName="px-0 pb-1"
        empty={list.length === 0 ? "No images have been collected for this category yet; a neutral placeholder is shown instead." : false}
        footnote={credits?._meta?.policy}
      >
        <div className="max-h-[520px] overflow-y-auto scrollbar-thin">
          <Table>
            <TableHeader className="sticky top-0 z-[1] bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14">Image</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Licence</TableHead>
                <TableHead className="text-right">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map(([ref, c]) => (
                <TableRow key={ref}>
                  <TableCell>
                    <img src={c.file} alt="" loading="lazy" className="h-9 w-12 rounded-sm object-cover" />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{c.wikipedia_article ?? ref}</div>
                    <div className="max-w-[320px] truncate text-[11px] text-muted-foreground">{c.title.replace(/^File:/, "")}</div>
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate whitespace-normal text-muted-foreground">{c.author}</TableCell>
                  <TableCell>
                    {c.license_url ? (
                      <a className="underline decoration-border underline-offset-2 hover:decoration-foreground" href={c.license_url} target="_blank" rel="noreferrer">
                        {c.license}
                      </a>
                    ) : (
                      c.license
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.source_url ? (
                      <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        Commons <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">{isOwnerSupplied(c) ? "Supplied by owner" : "—"}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
