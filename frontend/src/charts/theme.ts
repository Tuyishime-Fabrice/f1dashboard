import { INK } from "@/lib/colors";

/** Shared ECharts building blocks: recessive axes, hairline grid, readable tooltip. */
export const FONT = '"Inter Variable", ui-sans-serif, system-ui, sans-serif';

export const textStyle = { fontFamily: FONT, color: INK.muted, fontSize: 11 };

export const tooltipBase = {
  backgroundColor: "#16181b",
  borderWidth: 0,
  padding: [8, 10],
  textStyle: { color: "#fff", fontSize: 12, fontFamily: FONT },
  extraCssText: "border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.18);",
  confine: true,
};

export const axisCommon = {
  axisLine: { lineStyle: { color: INK.axis } },
  axisTick: { show: false },
  axisLabel: { color: INK.muted, fontSize: 11, fontFamily: FONT },
  splitLine: { lineStyle: { color: INK.grid, type: "solid" as const } },
  nameTextStyle: { color: INK.muted, fontSize: 11, fontFamily: FONT },
};

export const valueAxis = (extra: Record<string, unknown> = {}) => ({
  type: "value" as const,
  ...axisCommon,
  axisLine: { show: false },
  ...extra,
});

export const categoryAxis = (data: (string | number)[], extra: Record<string, unknown> = {}) => ({
  type: "category" as const,
  data,
  ...axisCommon,
  splitLine: { show: false },
  ...extra,
});

export const legendBase = {
  top: 0,
  left: 0,
  icon: "roundRect",
  itemWidth: 10,
  itemHeight: 3,
  itemGap: 14,
  textStyle: { color: INK.text, fontSize: 11, fontFamily: FONT },
  inactiveColor: "#c9cdd2",
};

export const swatch = (color: string, dashed = false) =>
  `<span style="display:inline-block;width:10px;height:${dashed ? 0 : 3}px;${
    dashed ? `border-top:2px dashed ${color};` : `background:${color};`
  }border-radius:2px;margin-right:6px;vertical-align:middle"></span>`;

export const tipRow = (label: string, value: string, color?: string, dashed = false) =>
  `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.6"><span>${
    color ? swatch(color, dashed) : ""
  }${label}</span><span style="font-variant-numeric:tabular-nums;font-weight:600">${value}</span></div>`;

export const tipTitle = (t: string, sub?: string) =>
  `<div style="font-weight:600;margin-bottom:4px">${t}${sub ? `<span style="color:#9aa1a8;font-weight:400;margin-left:6px">${sub}</span>` : ""}</div>`;
