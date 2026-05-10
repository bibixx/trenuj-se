/**
 * Chart spec types for the `chart` markdown code block.
 *
 * Charts are rendered with Recharts under the hood, but the JSON shape is
 * project-specific: colors are resolved from `hue` (OKLCH recipes) and tick
 * formatters are a closed set of named presets plus a `{value}` template.
 */

export type FormatterSpec = "default" | "pace" | "duration" | "hr" | "distance" | "percent" | { format: "percent"; scale: "fraction" | "whole" } | string;

export type Tone = "accent" | "tint";

export type LegendPosition = false | "top" | "bottom";

export interface AxisSpec {
  dataKey?: string;
  label?: string;
  domain?: [AxisBound, AxisBound];
  format?: FormatterSpec;
  reversed?: boolean;
  hide?: boolean;
  ticks?: (string | number)[];
}

export type AxisBound = number | "auto" | "dataMin" | "dataMax";

export interface YAxisSpec extends AxisSpec {
  id?: string;
  orientation?: "left" | "right";
}

export interface SeriesBase {
  dataKey: string;
  name?: string;
  hue?: number;
  tone?: Tone;
  yAxisId?: string;
  fillOpacity?: number;
}

export interface LineSeriesSpec extends SeriesBase {
  type?: "line";
  dot?: boolean;
  strokeWidth?: number;
  strokeDasharray?: string;
  curve?: "linear" | "monotone" | "step" | "basis";
}

export interface BarSeriesSpec extends SeriesBase {
  type?: "bar";
  stackId?: string;
  radius?: number;
}

export interface AreaSeriesSpec extends SeriesBase {
  type?: "area";
  curve?: "linear" | "monotone" | "step" | "basis";
  stackId?: string;
}

export interface ScatterSeriesSpec extends SeriesBase {
  type?: "scatter";
  shape?: "circle" | "square" | "triangle" | "diamond" | "cross" | "star" | "wye";
}

export interface RadarSeriesSpec extends SeriesBase {
  type?: "radar";
  fillOpacity?: number;
}

export interface RadialBarSeriesSpec extends SeriesBase {
  type?: "radialBar";
}

export type ComposedSeriesSpec = LineSeriesSpec | BarSeriesSpec | AreaSeriesSpec;

export interface ReferenceLineSpec {
  yAxisId?: string;
  x?: number | string;
  y?: number;
  label?: string;
  hue?: number;
  strokeDasharray?: string;
}

export interface ReferenceAreaSpec {
  yAxisId?: string;
  x1?: number | string;
  x2?: number | string;
  y1?: number;
  y2?: number;
  label?: string;
  hue?: number;
  fillOpacity?: number;
}

export interface BaseChartSpec {
  title?: string;
  data: Record<string, unknown>[];
  legend?: LegendPosition;
  tooltip?: false | { format?: FormatterSpec };
  grid?: boolean;
  height?: number;
  stacked?: boolean;
}

export interface LineChartSpec extends BaseChartSpec {
  type: "line";
  xAxis: AxisSpec;
  yAxis?: YAxisSpec | YAxisSpec[];
  series: LineSeriesSpec[];
  referenceLines?: ReferenceLineSpec[];
  referenceAreas?: ReferenceAreaSpec[];
}

export interface BarChartSpec extends BaseChartSpec {
  type: "bar";
  xAxis: AxisSpec;
  yAxis?: YAxisSpec | YAxisSpec[];
  series: BarSeriesSpec[];
  referenceLines?: ReferenceLineSpec[];
  referenceAreas?: ReferenceAreaSpec[];
}

export interface AreaChartSpec extends BaseChartSpec {
  type: "area";
  xAxis: AxisSpec;
  yAxis?: YAxisSpec | YAxisSpec[];
  series: AreaSeriesSpec[];
  referenceLines?: ReferenceLineSpec[];
  referenceAreas?: ReferenceAreaSpec[];
}

export interface ComposedChartSpec extends BaseChartSpec {
  type: "composed";
  xAxis: AxisSpec;
  yAxis?: YAxisSpec | YAxisSpec[];
  series: ComposedSeriesSpec[];
  referenceLines?: ReferenceLineSpec[];
  referenceAreas?: ReferenceAreaSpec[];
}

export interface ScatterChartSpec extends BaseChartSpec {
  type: "scatter";
  xAxis: AxisSpec;
  yAxis?: YAxisSpec | YAxisSpec[];
  series: ScatterSeriesSpec[];
  referenceLines?: ReferenceLineSpec[];
  referenceAreas?: ReferenceAreaSpec[];
}

export interface RadarChartSpec extends BaseChartSpec {
  type: "radar";
  angleKey: string;
  series: RadarSeriesSpec[];
}

export interface RadialBarChartSpec extends BaseChartSpec {
  type: "radial-bar";
  angleKey?: string;
  series: RadialBarSeriesSpec[];
}

export type ChartSpec = LineChartSpec | BarChartSpec | AreaChartSpec | ComposedChartSpec | ScatterChartSpec | RadarChartSpec | RadialBarChartSpec;
