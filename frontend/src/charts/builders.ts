import type { Progression } from "@/lib/api";
import { COMPOUND, INK, SEQ_BLUE, teamColor } from "@/lib/colors";
import { driverCode, fmt, shortRace } from "@/lib/format";

import { categoryAxis, FONT, legendBase, textStyle, tipRow, tipTitle, tooltipBase, valueAxis } from "./theme";

type Opt = Record<string, unknown>;

/* ------------------------------------------------------------------ helpers */
/** Line style per entity: team colour; a team's second entry is dashed. */
export function teamStyles<T extends { constructor_ref: string | null; constructor_id: number | null }>(items: T[]) {
  const seen = new Map<string, number>();
  return items.map((it) => {
    const key = it.constructor_ref ?? String(it.constructor_id);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return { color: teamColor(it.constructor_ref, it.constructor_id), dashed: n > 0 };
  });
}

/* ------------------------------------------------------------------ championship progression */
export function progressionOption(prog: Progression, kind: "driver" | "constructor", endLabels = 8): Opt {
  const styles = teamStyles(prog.series);
  const names = prog.series.map((s) => (kind === "driver" ? driverCode(s as never) : (s.constructor_name ?? "")));
  const labels = prog.rounds.map((r) => `R${r.round}`);
  return {
    textStyle,
    animationDuration: 500,
    grid: { left: 8, right: kind === "driver" ? 48 : 104, top: 40, bottom: 8, containLabel: true },
    legend: { ...legendBase, type: "scroll", pageIconSize: 9, pageTextStyle: { color: INK.muted, fontSize: 10 }, data: names.map((n, i) => ({ name: n, itemStyle: { color: styles[i].color } })) },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: INK.faint } },
      formatter: (params: { dataIndex: number; seriesIndex: number; value: number | null }[]) => {
        const idx = params[0]?.dataIndex ?? 0;
        const r = prog.rounds[idx];
        const rows = [...params]
          .filter((p) => p.value != null)
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((p) => tipRow(names[p.seriesIndex], fmt.points(p.value), styles[p.seriesIndex].color, styles[p.seriesIndex].dashed));
        return tipTitle(`R${r.round} · ${shortRace(r.name)}`, fmt.shortDate(r.date)) + rows.join("");
      },
    },
    xAxis: categoryAxis(labels, { boundaryGap: false, axisLabel: { color: INK.muted, fontSize: 11, interval: labels.length > 16 ? 1 : 0 } }),
    yAxis: valueAxis(),
    series: prog.series.map((s, i) => ({
      name: names[i],
      type: "line",
      data: s.points,
      connectNulls: false,
      symbol: "circle",
      symbolSize: 5,
      showSymbol: false,
      lineStyle: { width: 2, color: styles[i].color, type: styles[i].dashed ? [5, 3] : "solid" },
      itemStyle: { color: styles[i].color, borderColor: "#fff", borderWidth: 1.5 },
      emphasis: { focus: "series", lineStyle: { width: 2.5 } },
      blur: { lineStyle: { opacity: 0.15 } },
      endLabel: {
        show: i < endLabels,
        formatter: names[i],
        color: INK.text,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: FONT,
        distance: 6,
      },
      labelLayout: { moveOverlap: "shiftY" },
    })),
  };
}

/* ------------------------------------------------------------------ horizontal ranking */
export interface BarItem {
  label: string;
  value: number;
  sub?: string;
  color?: string;
  highlight?: boolean;
}

export function rankingOption(items: BarItem[], opts: { valueLabel: string; format?: (v: number) => string; maxBars?: number } ): Opt {
  const data = items.slice(0, opts.maxBars ?? 15).reverse();
  const f = opts.format ?? ((v: number) => fmt.int(v));
  return {
    textStyle,
    animationDuration: 400,
    grid: { left: 4, right: 44, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: "item",
      formatter: (p: { dataIndex: number }) => {
        const d = data[p.dataIndex];
        return tipTitle(d.label, d.sub) + tipRow(opts.valueLabel, f(d.value));
      },
    },
    xAxis: valueAxis({ show: false }),
    yAxis: categoryAxis(
      data.map((d) => d.label),
      { axisLine: { show: false }, axisLabel: { color: INK.text, fontSize: 12, fontFamily: FONT, margin: 10 } },
    ),
    series: [
      {
        type: "bar",
        barWidth: 12,
        barCategoryGap: "40%",
        data: data.map((d) => ({
          value: d.value,
          itemStyle: { color: d.color ?? (d.highlight ? INK.accent : INK.neutral), borderRadius: [0, 4, 4, 0] },
        })),
        label: { show: true, position: "right", color: INK.text, fontSize: 11, fontWeight: 600, fontFamily: FONT, formatter: (p: { value: number }) => f(p.value) },
        emphasis: { itemStyle: { opacity: 0.85 } },
      },
    ],
  };
}

/* ------------------------------------------------------------------ grid vs finish scatter */
export interface ScatterPoint {
  x: number;
  y: number;
  label: string;
  sub: string;
  color?: string;
  group?: string;
}

export function startFinishOption(points: ScatterPoint[], opts: { xName: string; yName: string; max?: number; groups?: { name: string; color: string; symbol?: string; background?: boolean }[] }): Opt {
  const max = opts.max ?? Math.max(20, ...points.map((p) => Math.max(p.x, p.y)));
  const groups = opts.groups ?? [{ name: "Results", color: INK.neutral }];
  return {
    textStyle,
    grid: { left: 8, right: 16, top: groups.length > 1 ? 34 : 14, bottom: 26, containLabel: true },
    legend: groups.length > 1 ? { ...legendBase, icon: "circle", itemWidth: 8, itemHeight: 8 } : undefined,
    tooltip: {
      ...tooltipBase,
      trigger: "item",
      formatter: (p: { data: { raw: ScatterPoint } }) => {
        const d = p.data.raw;
        return tipTitle(d.label, d.sub) + tipRow(opts.xName, String(d.x)) + tipRow(opts.yName, String(d.y)) + tipRow("Change", fmt.signed(d.x - d.y));
      },
    },
    xAxis: valueAxis({ min: 1, max, interval: max > 24 ? 4 : 2, name: opts.xName, nameLocation: "middle", nameGap: 26, axisLine: { show: true, lineStyle: { color: INK.axis } } }),
    yAxis: valueAxis({ min: 1, max, inverse: true, interval: max > 24 ? 4 : 2, name: opts.yName, nameLocation: "middle", nameGap: 30 }),
    series: groups.map((g, gi) => ({
      name: g.name,
      type: "scatter",
      symbol: g.symbol ?? "circle",
      symbolSize: g.background ? 8 : 10,
      z: g.background ? 1 : 3,
      color: g.color,
      data: points.filter((p) => (p.group ?? groups[0].name) === g.name).map((p) => ({ value: [p.x, p.y], raw: p })),
      itemStyle: { color: g.color, opacity: g.background ? 0.7 : groups.length > 1 ? 0.95 : 0.55, borderColor: "#fff", borderWidth: 1 },
      emphasis: { itemStyle: { opacity: 1, borderColor: INK.text } },
      markLine:
        gi === 0
          ? {
              silent: true,
              symbol: "none",
              lineStyle: { color: INK.faint, type: "solid", width: 1 },
              label: { show: true, formatter: "Finished = started", position: "insideEndTop", color: INK.faint, fontSize: 10 },
              data: [[{ coord: [1, 1] }, { coord: [max, max] }]],
            }
          : undefined,
    })),
  };
}

/* ------------------------------------------------------------------ diverging bars (gain / loss) */
export function divergingOption(items: { label: string; value: number; sub?: string }[], valueLabel: string): Opt {
  const data = [...items].reverse();
  const ext = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const lo = Math.min(0, ...data.map((d) => d.value));
  const hi = Math.max(0, ...data.map((d) => d.value));
  return {
    textStyle,
    grid: { left: 4, right: 36, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipBase,
      formatter: (p: { dataIndex: number }) => {
        const d = data[p.dataIndex];
        return tipTitle(d.label, d.sub) + tipRow(valueLabel, fmt.signed(d.value));
      },
    },
    xAxis: valueAxis({ show: false, min: lo < 0 ? lo - ext * 0.22 : 0, max: hi > 0 ? hi + ext * 0.12 : 0 }),
    yAxis: categoryAxis(
      data.map((d) => d.label),
      { axisLine: { show: false }, axisLabel: { color: INK.text, fontSize: 12, fontFamily: FONT } },
    ),
    series: [
      {
        type: "bar",
        barWidth: 12,
        data: data.map((d) => ({
          value: d.value,
          itemStyle: { color: d.value >= 0 ? INK.gain : INK.loss, borderRadius: d.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] },
          label: { position: d.value >= 0 ? "right" : "left" },
        })),
        label: { show: true, color: INK.text, fontSize: 11, fontWeight: 600, formatter: (p: { value: number }) => fmt.signed(p.value) },
        markLine: { silent: true, symbol: "none", lineStyle: { color: INK.axis, type: "solid" }, label: { show: false }, data: [{ xAxis: 0 }] },
      },
    ],
  };
}

/* ------------------------------------------------------------------ results heatmap */
export interface MatrixCell {
  x: number; // column index
  y: number; // row index
  position: number | null;
  text: string;
  tip: string;
}

export function resultsHeatmapOption(cols: string[], rows: string[], cells: MatrixCell[], colTips: string[]): Opt {
  const steps = SEQ_BLUE.slice().reverse();
  return {
    textStyle,
    grid: { left: 4, right: 8, top: 26, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipBase,
      formatter: (p: { data: { tip: string } }) => p.data.tip,
    },
    xAxis: {
      type: "category",
      data: cols,
      position: "top",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: INK.muted, fontSize: 10, interval: 0, fontFamily: FONT },
      splitArea: { show: false },
      triggerEvent: true,
      tooltip: { show: true, formatter: (p: { value: string }) => colTips[cols.indexOf(p.value)] ?? p.value },
    },
    yAxis: {
      type: "category",
      data: rows,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: INK.text, fontSize: 11, fontWeight: 600, fontFamily: FONT },
    },
    visualMap: {
      show: false,
      type: "piecewise",
      dimension: 2,
      pieces: [
        { min: 1, max: 1, color: steps[0] },
        { min: 2, max: 3, color: steps[1] },
        { min: 4, max: 5, color: steps[2] },
        { min: 6, max: 10, color: steps[3] },
        { min: 11, max: 15, color: steps[5] },
        { min: 16, max: 99, color: "#e8edf3" },
        { value: 0, color: "#f1f2f4" },
      ],
    },
    series: [
      {
        type: "heatmap",
        data: cells.map((c) => {
          const dark = c.position != null && c.position <= 5;
          return {
            value: [c.x, c.y, c.position ?? 0],
            tip: c.tip,
            txt: c.text,
            label: { color: dark ? "#ffffff" : c.position ? "#16181b" : "#8a9096", fontWeight: c.position != null && c.position <= 3 ? 700 : 500 },
          };
        }),
        itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 3 },
        label: {
          show: true,
          fontSize: 10,
          fontFamily: FONT,
          formatter: (p: { data: { txt: string } }) => p.data.txt,
        },
        emphasis: { itemStyle: { borderColor: INK.text, borderWidth: 1 } },
      },
    ],
  };
}

/* ------------------------------------------------------------------ position-over-season lines */
export function seasonLinesOption(
  years: number[],
  series: { name: string; color: string; values: (number | null)[]; dashed?: boolean }[],
  opts: { yName: string; inverse?: boolean; format?: (v: number) => string; min?: number },
): Opt {
  const f = opts.format ?? ((v: number) => String(v));
  return {
    textStyle,
    grid: { left: 8, right: 20, top: 36, bottom: 8, containLabel: true },
    legend: { ...legendBase, data: series.map((s) => ({ name: s.name, itemStyle: { color: s.color } })) },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      formatter: (ps: { dataIndex: number; seriesIndex: number; value: number | null }[]) =>
        tipTitle(String(years[ps[0]?.dataIndex ?? 0])) +
        ps.filter((p) => p.value != null).map((p) => tipRow(series[p.seriesIndex].name, f(p.value as number), series[p.seriesIndex].color, series[p.seriesIndex].dashed)).join(""),
    },
    xAxis: categoryAxis(years.map(String), { boundaryGap: false }),
    yAxis: valueAxis({ inverse: opts.inverse, min: opts.min, axisLabel: { color: INK.muted, fontSize: 11, formatter: opts.inverse ? "P{value}" : "{value}" } }),
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      data: s.values,
      connectNulls: false,
      symbol: "circle",
      symbolSize: 7,
      lineStyle: { width: 2, color: s.color, type: s.dashed ? [5, 3] : "solid" },
      itemStyle: { color: s.color, borderColor: "#fff", borderWidth: 1.5 },
      emphasis: { focus: "series" },
    })),
  };
}

/* ------------------------------------------------------------------ boxplot */
export function boxplotOption(
  rows: { label: string; color: string; min: number; q1: number; median: number; q3: number; max: number; n: number }[],
  unit = "s",
): Opt {
  return {
    textStyle,
    grid: { left: 8, right: 16, top: 12, bottom: 28, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: "item",
      formatter: (p: { dataIndex: number }) => {
        const r = rows[p.dataIndex];
        return (
          tipTitle(r.label, `${r.n} stops`) +
          tipRow("Fastest", `${r.min.toFixed(2)}${unit}`) +
          tipRow("Lower quartile", `${r.q1.toFixed(2)}${unit}`) +
          tipRow("Median", `${r.median.toFixed(2)}${unit}`) +
          tipRow("Upper quartile", `${r.q3.toFixed(2)}${unit}`) +
          tipRow("Slowest", `${r.max.toFixed(2)}${unit}`)
        );
      },
    },
    xAxis: valueAxis({ name: `Pit-lane time (${unit})`, nameLocation: "middle", nameGap: 26, scale: true, axisLine: { show: true, lineStyle: { color: INK.axis } } }),
    yAxis: categoryAxis(
      rows.map((r) => r.label),
      { inverse: true, axisLine: { show: false }, axisLabel: { color: INK.text, fontSize: 12, fontFamily: FONT } },
    ),
    series: [
      {
        type: "boxplot",
        layout: "horizontal",
        boxWidth: [8, 14],
        data: rows.map((r) => ({
          value: [r.min, r.q1, r.median, r.q3, r.max],
          itemStyle: { color: r.color + "33", borderColor: r.color, borderWidth: 1.5 },
        })),
      },
    ],
  };
}

/* ------------------------------------------------------------------ stacked share bars (tyres) */
export function compoundShareOption(rounds: { round: number; race_name: string; share: Record<string, number> }[]): Opt {
  const compounds = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET", "UNKNOWN"].filter((c) => rounds.some((r) => (r.share[c] ?? 0) > 0));
  return {
    textStyle,
    grid: { left: 8, right: 8, top: 34, bottom: 8, containLabel: true },
    legend: {
      ...legendBase,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      data: compounds.map((c) => ({ name: COMPOUND[c].label, itemStyle: { color: COMPOUND[c].color, borderColor: "#c4c9ce", borderWidth: c === "HARD" ? 1 : 0 } })),
    },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(0,0,0,0.04)" } },
      formatter: (ps: { dataIndex: number; seriesIndex: number; value: number }[]) => {
        const r = rounds[ps[0].dataIndex];
        return tipTitle(`R${r.round} · ${shortRace(r.race_name)}`, "share of laps") +
          ps.filter((p) => p.value > 0).map((p) => tipRow(COMPOUND[compounds[p.seriesIndex]].label, `${p.value.toFixed(1)}%`, COMPOUND[compounds[p.seriesIndex]].color)).join("");
      },
    },
    xAxis: categoryAxis(rounds.map((r) => `R${r.round}`)),
    yAxis: valueAxis({ max: 100, axisLabel: { formatter: "{value}%", color: INK.muted, fontSize: 11 } }),
    series: compounds.map((c) => ({
      name: COMPOUND[c].label,
      type: "bar",
      stack: "s",
      barWidth: "62%",
      data: rounds.map((r) => r.share[c] ?? 0),
      itemStyle: { color: COMPOUND[c].color, borderColor: "#fff", borderWidth: 1 },
      emphasis: { focus: "series" },
    })),
  };
}

/* ------------------------------------------------------------------ tyre strategy gantt */
export interface StintRow {
  label: string;
  sub: string;
  stints: { compound: string; start: number; end: number; laps: number; stint: number }[];
}

export function strategyOption(rows: StintRow[], totalLaps: number): Opt {
  const data = rows.flatMap((r, ri) =>
    r.stints.map((s) => ({
      value: [ri, s.start - 1, s.end, s.laps],
      itemStyle: { color: COMPOUND[s.compound]?.color ?? COMPOUND.UNKNOWN.color },
      meta: { row: r, s },
    })),
  );
  return {
    textStyle,
    grid: { left: 8, right: 12, top: 8, bottom: 26, containLabel: true },
    tooltip: {
      ...tooltipBase,
      formatter: (p: { data: { meta: { row: StintRow; s: StintRow["stints"][number] } } }) => {
        const { row, s } = p.data.meta;
        return tipTitle(row.label, row.sub) + tipRow(`Stint ${s.stint}`, COMPOUND[s.compound]?.label ?? s.compound, COMPOUND[s.compound]?.color) + tipRow("Laps", `${s.start}–${s.end} (${s.laps})`);
      },
    },
    xAxis: valueAxis({ min: 0, max: totalLaps, name: "Lap", nameLocation: "middle", nameGap: 24, axisLine: { show: true, lineStyle: { color: INK.axis } } }),
    yAxis: categoryAxis(rows.map((r) => r.label), { inverse: true, axisLine: { show: false }, axisLabel: { color: INK.text, fontSize: 11, fontWeight: 600, fontFamily: FONT } }),
    series: [
      {
        type: "custom",
        renderItem: (_: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[]; visual: (k: string) => string }) => {
          const y = api.value(0);
          const start = api.coord([api.value(1), y]);
          const end = api.coord([api.value(2), y]);
          const h = Math.min(14, api.size([0, 1])[1] * 0.62);
          return {
            type: "rect",
            shape: { x: start[0] + 1, y: start[1] - h / 2, width: Math.max(end[0] - start[0] - 2, 1), height: h, r: 3 },
            style: { fill: api.visual("color"), stroke: "#c4c9ce", lineWidth: 0.5 },
          };
        },
        encode: { x: [1, 2], y: 0 },
        data,
      },
    ],
  };
}

/* ------------------------------------------------------------------ lap-by-lap positions */
export function lapChartOption(
  series: { code: string; name: string; team: string; color: string; dashed: boolean; positions: (number | null)[] }[],
  laps: number,
  highlight: string[],
): Opt {
  const hasHl = highlight.length > 0;
  return {
    textStyle,
    grid: { left: 8, right: 44, top: 12, bottom: 26, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      formatter: (ps: { dataIndex: number; seriesIndex: number; value: number | null }[]) => {
        const lap = (ps[0]?.dataIndex ?? 0) + 1;
        const rows = ps
          .filter((p) => p.value != null)
          .sort((a, b) => (a.value as number) - (b.value as number))
          .slice(0, 10)
          .map((p) => tipRow(`P${p.value} ${series[p.seriesIndex].code}`, series[p.seriesIndex].team, series[p.seriesIndex].color, series[p.seriesIndex].dashed));
        return tipTitle(`Lap ${lap}`, "top 10") + rows.join("");
      },
    },
    xAxis: categoryAxis(Array.from({ length: laps }, (_, i) => i + 1), { boundaryGap: false, name: "Lap", nameLocation: "middle", nameGap: 24, axisLabel: { interval: Math.ceil(laps / 12) - 1, color: INK.muted, fontSize: 11 } }),
    yAxis: valueAxis({ inverse: true, min: 1, max: Math.max(20, ...series.map((s) => Math.max(0, ...(s.positions.filter(Boolean) as number[])))), interval: 1, axisLabel: { formatter: "P{value}", color: INK.muted, fontSize: 10 }, splitLine: { show: false } }),
    series: series.map((s) => {
      const on = !hasHl || highlight.includes(s.code);
      return {
        name: s.code,
        type: "line",
        data: s.positions,
        symbol: "none",
        smooth: false,
        z: on ? 3 : 1,
        lineStyle: { width: on ? 2 : 1.2, color: on ? s.color : "#d5d9dd", type: s.dashed ? [5, 3] : "solid", opacity: on ? 1 : 0.9 },
        itemStyle: { color: s.color },
        emphasis: { focus: "series", lineStyle: { width: 2.5, color: s.color } },
        blur: { lineStyle: { opacity: 0.12 } },
        endLabel: { show: true, formatter: s.code, fontSize: 10, fontWeight: 600, color: on ? INK.text : INK.faint, distance: 4 },
      };
    }),
  };
}

/* ------------------------------------------------------------------ vertical bars */
export function columnOption(
  labels: string[],
  values: number[],
  opts: { valueName: string; color?: string; format?: (v: number) => string; tips?: string[]; colors?: string[]; yMax?: number },
): Opt {
  const f = opts.format ?? ((v: number) => fmt.int(v));
  return {
    textStyle,
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: "item",
      formatter: (p: { dataIndex: number }) => tipTitle(opts.tips?.[p.dataIndex] ?? labels[p.dataIndex]) + tipRow(opts.valueName, f(values[p.dataIndex])),
    },
    xAxis: categoryAxis(labels, { axisLabel: { color: INK.muted, fontSize: 11, interval: labels.length > 12 ? Math.ceil(labels.length / 10) - 1 : 0 } }),
    yAxis: valueAxis({ max: opts.yMax, axisLabel: { color: INK.muted, fontSize: 11, formatter: (v: number) => f(v) } }),
    series: [
      {
        type: "bar",
        barMaxWidth: 22,
        data: values.map((v, i) => ({ value: v, itemStyle: { color: opts.colors?.[i] ?? opts.color ?? INK.neutral, borderRadius: [4, 4, 0, 0] } })),
      },
    ],
  };
}

/* ------------------------------------------------------------------ stacked share by season (dominance) */
export function dominanceOption(years: number[], series: { name: string; color: string; share: number[]; wins: number[] }[], races: number[]): Opt {
  return {
    textStyle,
    grid: { left: 8, right: 8, top: 40, bottom: 34, containLabel: true },
    legend: { ...legendBase, itemWidth: 10, itemHeight: 10, data: series.map((s) => ({ name: s.name, itemStyle: { color: s.color } })) },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(0,0,0,0.04)" } },
      formatter: (ps: { dataIndex: number; seriesIndex: number }[]) => {
        const i = ps[0].dataIndex;
        const rows = series
          .map((s) => ({ s, w: s.wins[i] }))
          .filter((r) => r.w > 0)
          .sort((a, b) => b.w - a.w)
          .map((r) => tipRow(r.s.name, `${r.w} (${r.s.share[i].toFixed(0)}%)`, r.s.color));
        return tipTitle(String(years[i]), `${races[i]} races`) + rows.join("");
      },
    },
    dataZoom: [{ type: "slider", height: 16, bottom: 4, borderColor: "transparent", backgroundColor: "#f1f2f4", fillerColor: "rgba(22,24,27,0.08)", handleSize: 14, showDetail: false, brushSelect: false }],
    xAxis: categoryAxis(years.map(String)),
    yAxis: valueAxis({ max: 100, axisLabel: { formatter: "{value}%", color: INK.muted, fontSize: 11 } }),
    series: series.map((s) => ({
      name: s.name,
      type: "bar",
      stack: "wins",
      barCategoryGap: "18%",
      data: s.share,
      itemStyle: { color: s.color, borderColor: "#fff", borderWidth: 0.5 },
      emphasis: { focus: "series" },
    })),
  };
}

/* ------------------------------------------------------------------ cumulative career lines */
export function careerOption(series: { name: string; color: string; values: number[] }[], _yName: string): Opt {
  const maxLen = Math.max(0, ...series.map((s) => s.values.length));
  return {
    textStyle,
    grid: { left: 8, right: 52, top: 36, bottom: 26, containLabel: true },
    legend: { ...legendBase, data: series.map((s) => ({ name: s.name, itemStyle: { color: s.color } })) },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      formatter: (ps: { dataIndex: number; seriesIndex: number; value: number | null }[]) =>
        tipTitle(`Career start #${(ps[0]?.dataIndex ?? 0) + 1}`) +
        ps.filter((p) => p.value != null).map((p) => tipRow(series[p.seriesIndex].name, fmt.int(p.value as number), series[p.seriesIndex].color)).join(""),
    },
    xAxis: categoryAxis(Array.from({ length: maxLen }, (_, i) => i + 1), { boundaryGap: false, name: "Career start number", nameLocation: "middle", nameGap: 24, axisLabel: { interval: Math.ceil(maxLen / 10) - 1, color: INK.muted, fontSize: 11 } }),
    yAxis: valueAxis({ axisLabel: { color: INK.muted, fontSize: 11 } }),
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      data: s.values,
      symbol: "none",
      lineStyle: { width: 2, color: s.color },
      itemStyle: { color: s.color },
      emphasis: { focus: "series" },
      endLabel: { show: true, formatter: (p: { value: number }) => fmt.int(p.value), color: INK.text, fontSize: 11, fontWeight: 600 },
    })),
  };
}

/* ------------------------------------------------------------------ x/y scatter for correlations */
export function xyScatterOption(
  points: { x: number; y: number; label: string; sub?: string; color: string }[],
  opts: { xName: string; yName: string; xFmt?: (v: number) => string; yFmt?: (v: number) => string; legend?: { name: string; color: string }[] },
): Opt {
  const xf = opts.xFmt ?? ((v: number) => fmt.num(v, 1));
  const yf = opts.yFmt ?? ((v: number) => fmt.num(v, 1));
  return {
    textStyle,
    grid: { left: 8, right: 16, top: opts.legend ? 52 : 30, bottom: 28, containLabel: true },
    legend: opts.legend ? { ...legendBase, icon: "circle", itemWidth: 8, itemHeight: 8, data: opts.legend.map((l) => l.name) } : undefined,
    tooltip: {
      ...tooltipBase,
      trigger: "item",
      formatter: (p: { data: { raw: { x: number; y: number; label: string; sub?: string } } }) =>
        tipTitle(p.data.raw.label, p.data.raw.sub) + tipRow(opts.xName, xf(p.data.raw.x)) + tipRow(opts.yName, yf(p.data.raw.y)),
    },
    xAxis: valueAxis({ scale: true, name: opts.xName, nameLocation: "middle", nameGap: 26, axisLine: { show: true, lineStyle: { color: INK.axis } } }),
    yAxis: valueAxis({ scale: true, name: opts.yName, nameLocation: "end", nameGap: 10, nameTextStyle: { align: "left", color: INK.muted, fontSize: 11 } }),
    series: (opts.legend ?? [{ name: "Races", color: INK.neutral }]).map((g) => ({
      name: g.name,
      type: "scatter",
      symbolSize: 10,
      itemStyle: { color: g.color, borderColor: "#fff", borderWidth: 1.5, opacity: 0.9 },
      data: points.filter((p) => !opts.legend || p.color === g.color).map((p) => ({ value: [p.x, p.y], raw: p })),
    })),
  };
}
