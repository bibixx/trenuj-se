import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { resolveAreaFill, resolveColor, resolveReferenceFill, resolveStroke } from "./colors.ts";
import { getFormatter, type FormatterFn } from "./formatters.ts";
import type { AxisSpec, BarSeriesSpec, ChartSpec, ComposedSeriesSpec, LineSeriesSpec, ReferenceAreaSpec, ReferenceLineSpec, ScatterSeriesSpec, YAxisSpec } from "./types.ts";
import styles from "./Chart.module.css";

const DEFAULT_HEIGHT = 260;

function asYAxisArray(spec: YAxisSpec | YAxisSpec[] | undefined): YAxisSpec[] {
  if (!spec) return [{}];
  return Array.isArray(spec) ? spec : [spec];
}

function renderXAxis(axis: AxisSpec) {
  const formatter = getFormatter(axis.format);
  return (
    <XAxis
      dataKey={axis.dataKey}
      reversed={axis.reversed}
      hide={axis.hide}
      tickFormatter={(value: unknown) => formatter(value)}
      tickLine={false}
      ticks={axis.ticks as (string | number)[] | undefined}
      domain={axis.domain as [number | string, number | string] | undefined}
      label={axis.label ? { value: axis.label, position: "insideBottom", offset: -2, dy: 8 } : undefined}
    />
  );
}

function renderYAxes(axes: YAxisSpec[]) {
  return axes.map((axis, index) => {
    const formatter = getFormatter(axis.format);
    return (
      <YAxis
        key={axis.id ?? `y-${index}`}
        yAxisId={axis.id}
        orientation={axis.orientation}
        reversed={axis.reversed}
        hide={axis.hide}
        domain={axis.domain as [number | string, number | string] | undefined}
        tickFormatter={(value: unknown) => formatter(value)}
        tickLine={false}
        axisLine={false}
        ticks={axis.ticks as (string | number)[] | undefined}
        width={axis.label ? 80 : 64}
        tick={{ width: undefined }}
        label={axis.label ? { value: axis.label, angle: -90, position: axis.orientation === "right" ? "insideRight" : "insideLeft", offset: 8 } : undefined}
      />
    );
  });
}

function renderReferenceLines(lines?: ReferenceLineSpec[]) {
  if (!lines?.length) return null;
  return lines.map((line, index) => {
    const stroke = line.hue !== undefined ? resolveStroke({ hue: line.hue, fallbackKey: `ref-line-${index}` }) : "var(--text-muted)";
    return (
      <ReferenceLine
        key={`ref-line-${index}`}
        yAxisId={line.yAxisId}
        x={line.x}
        y={line.y}
        stroke={stroke}
        strokeDasharray={line.strokeDasharray ?? "4 3"}
        label={line.label ? { value: line.label, position: "insideTopRight", fill: "var(--text-muted)", fontSize: 10 } : undefined}
      />
    );
  });
}

function renderReferenceAreas(areas?: ReferenceAreaSpec[]) {
  if (!areas?.length) return null;
  return areas.map((area, index) => {
    const fill = resolveReferenceFill({ hue: area.hue, fallbackKey: `ref-area-${index}`, tone: "accent" });
    return (
      <ReferenceArea
        key={`ref-area-${index}`}
        yAxisId={area.yAxisId}
        x1={area.x1}
        x2={area.x2}
        y1={area.y1}
        y2={area.y2}
        fill={fill}
        fillOpacity={area.fillOpacity ?? 0.15}
        label={area.label ? { value: area.label, fill: "var(--text-muted)", fontSize: 10, position: "insideTopLeft" } : undefined}
      />
    );
  });
}

function renderLineSeries(series: LineSeriesSpec, index: number) {
  const stroke = resolveStroke({ hue: series.hue, tone: series.tone, fallbackKey: series.dataKey });
  return (
    <Line
      key={`line-${series.dataKey}-${index}`}
      type={series.curve ?? "monotone"}
      dataKey={series.dataKey}
      name={series.name ?? series.dataKey}
      stroke={stroke}
      strokeWidth={series.strokeWidth ?? 2}
      strokeDasharray={series.strokeDasharray}
      dot={series.dot ?? false}
      yAxisId={series.yAxisId}
      isAnimationActive={false}
    />
  );
}

function renderBarSeries(series: BarSeriesSpec, index: number, stacked: boolean | undefined, data?: Record<string, unknown>[]) {
  const fill = resolveStroke({ hue: series.hue, tone: series.tone, fallbackKey: series.dataKey });
  const stackId = series.stackId ?? (stacked ? "stack" : undefined);
  const hasPerRowHue = data?.some((row) => typeof row.hue === "number");
  return (
    <Bar
      key={`bar-${series.dataKey}-${index}`}
      dataKey={series.dataKey}
      name={series.name ?? series.dataKey}
      fill={fill}
      fillOpacity={series.fillOpacity ?? 1}
      yAxisId={series.yAxisId}
      stackId={stackId}
      radius={series.radius ?? 4}
      isAnimationActive={false}
    >
      {hasPerRowHue && data
        ? data.map((row, rowIndex) => {
            const hue = typeof row.hue === "number" ? row.hue : undefined;
            const cellFill = resolveStroke({ hue, fallbackKey: `cell-${rowIndex}` });
            return <Cell key={`cell-${rowIndex}`} fill={cellFill} />;
          })
        : null}
    </Bar>
  );
}

function renderAreaSeries(
  series: {
    type?: "area";
    dataKey: string;
    name?: string;
    hue?: number;
    tone?: "accent" | "tint";
    yAxisId?: string;
    curve?: "linear" | "monotone" | "step" | "basis";
    stackId?: string;
    fillOpacity?: number;
  },
  index: number,
  stacked: boolean | undefined,
) {
  const stroke = resolveStroke({ hue: series.hue, fallbackKey: series.dataKey });
  const fill = resolveAreaFill({ hue: series.hue, tone: series.tone, fallbackKey: series.dataKey });
  const stackId = series.stackId ?? (stacked ? "stack" : undefined);
  return (
    <Area
      key={`area-${series.dataKey}-${index}`}
      type={series.curve ?? "monotone"}
      dataKey={series.dataKey}
      name={series.name ?? series.dataKey}
      stroke={stroke}
      fill={fill}
      fillOpacity={series.fillOpacity ?? 0.6}
      yAxisId={series.yAxisId}
      stackId={stackId}
      isAnimationActive={false}
    />
  );
}

function renderScatterSeries(series: ScatterSeriesSpec, index: number) {
  const fill = resolveStroke({ hue: series.hue, tone: series.tone, fallbackKey: series.dataKey });
  return (
    <Scatter
      key={`scatter-${series.dataKey}-${index}`}
      dataKey={series.dataKey}
      name={series.name ?? series.dataKey}
      fill={fill}
      shape={series.shape ?? "circle"}
      isAnimationActive={false}
    />
  );
}

function renderComposedSeries(series: ComposedSeriesSpec[], stacked: boolean | undefined, data?: Record<string, unknown>[]) {
  return series.map((s, index) => {
    if (s.type === "bar") {
      return renderBarSeries(s, index, stacked, data);
    }
    if (s.type === "area") {
      return renderAreaSeries(s, index, stacked);
    }
    return renderLineSeries(s as LineSeriesSpec, index);
  });
}

interface ChartTooltipProps extends TooltipContentProps<number | string, string> {
  formatter: FormatterFn;
}

function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      {label !== undefined && label !== null && label !== "" ? <div className={styles.tooltipLabel}>{String(label)}</div> : null}
      {payload.map((entry, index) => (
        <div key={index} className={styles.tooltipRow}>
          <span className={styles.tooltipSwatch} style={{ background: entry.color ?? "var(--text-muted)" }} />
          <span className={styles.tooltipName}>{entry.name}</span>
          <span className={styles.tooltipValue}>{formatter(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartFrame({ title, height, children }: { title?: string; height: number; children: React.ReactNode }) {
  return (
    <div className={styles.chart}>
      {title ? <div className={styles.title}>{title}</div> : null}
      <div className={styles.canvas} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface CartesianTooltipBundleProps {
  spec: ChartSpec;
}

function CartesianTooltipBundle({ spec }: CartesianTooltipBundleProps) {
  if (spec.tooltip === false) return null;
  const formatSpec = spec.tooltip && typeof spec.tooltip === "object" ? spec.tooltip.format : undefined;
  const formatter = getFormatter(formatSpec);
  return (
    <Tooltip
      cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }}
      content={(props) => <ChartTooltip {...(props as TooltipContentProps<number | string, string>)} formatter={formatter} />}
    />
  );
}

function renderLegend(spec: ChartSpec) {
  if (spec.legend === false || spec.legend === undefined) return null;
  return <Legend verticalAlign={spec.legend === "top" ? "top" : "bottom"} height={28} iconType="circle" iconSize={8} />;
}

function renderGrid(spec: ChartSpec) {
  if (spec.grid === false) return null;
  return <CartesianGrid strokeDasharray="3 3" vertical={false} />;
}

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const height = spec.height ?? DEFAULT_HEIGHT;

  if (spec.type === "line") {
    const yAxes = asYAxisArray(spec.yAxis);
    return (
      <ChartFrame title={spec.title} height={height}>
        <LineChart data={spec.data}>
          {renderGrid(spec)}
          {renderXAxis(spec.xAxis)}
          {renderYAxes(yAxes)}
          <CartesianTooltipBundle spec={spec} />
          {renderLegend(spec)}
          {renderReferenceAreas(spec.referenceAreas)}
          {renderReferenceLines(spec.referenceLines)}
          {spec.series.map((series, index) => renderLineSeries(series, index))}
        </LineChart>
      </ChartFrame>
    );
  }

  if (spec.type === "bar") {
    const yAxes = asYAxisArray(spec.yAxis);
    return (
      <ChartFrame title={spec.title} height={height}>
        <BarChart data={spec.data}>
          {renderGrid(spec)}
          {renderXAxis(spec.xAxis)}
          {renderYAxes(yAxes)}
          <CartesianTooltipBundle spec={spec} />
          {renderLegend(spec)}
          {renderReferenceAreas(spec.referenceAreas)}
          {renderReferenceLines(spec.referenceLines)}
          {spec.series.map((series, index) => renderBarSeries(series, index, spec.stacked, spec.data))}
        </BarChart>
      </ChartFrame>
    );
  }

  if (spec.type === "area") {
    const yAxes = asYAxisArray(spec.yAxis);
    return (
      <ChartFrame title={spec.title} height={height}>
        <AreaChart data={spec.data}>
          {renderGrid(spec)}
          {renderXAxis(spec.xAxis)}
          {renderYAxes(yAxes)}
          <CartesianTooltipBundle spec={spec} />
          {renderLegend(spec)}
          {renderReferenceAreas(spec.referenceAreas)}
          {renderReferenceLines(spec.referenceLines)}
          {spec.series.map((series, index) => renderAreaSeries(series, index, spec.stacked))}
        </AreaChart>
      </ChartFrame>
    );
  }

  if (spec.type === "composed") {
    const yAxes = asYAxisArray(spec.yAxis);
    return (
      <ChartFrame title={spec.title} height={height}>
        <ComposedChart data={spec.data}>
          {renderGrid(spec)}
          {renderXAxis(spec.xAxis)}
          {renderYAxes(yAxes)}
          <CartesianTooltipBundle spec={spec} />
          {renderLegend(spec)}
          {renderReferenceAreas(spec.referenceAreas)}
          {renderReferenceLines(spec.referenceLines)}
          {renderComposedSeries(spec.series, spec.stacked, spec.data)}
        </ComposedChart>
      </ChartFrame>
    );
  }

  if (spec.type === "scatter") {
    const yAxes = asYAxisArray(spec.yAxis);
    return (
      <ChartFrame title={spec.title} height={height}>
        <ScatterChart data={spec.data}>
          {renderGrid(spec)}
          {renderXAxis(spec.xAxis)}
          {renderYAxes(yAxes)}
          <CartesianTooltipBundle spec={spec} />
          {renderLegend(spec)}
          {renderReferenceAreas(spec.referenceAreas)}
          {renderReferenceLines(spec.referenceLines)}
          {spec.series.map((series, index) => renderScatterSeries(series, index))}
        </ScatterChart>
      </ChartFrame>
    );
  }

  if (spec.type === "radar") {
    return (
      <ChartFrame title={spec.title} height={height}>
        <RadarChart data={spec.data} outerRadius="68%">
          <PolarGrid />
          <PolarAngleAxis dataKey={spec.angleKey} />
          <PolarRadiusAxis tick={false} axisLine={false} />
          <CartesianTooltipBundle spec={spec} />
          {renderLegend(spec)}
          {spec.series.map((series, index) => {
            const stroke = resolveStroke({ hue: series.hue, tone: series.tone, fallbackKey: series.dataKey });
            const fill = resolveAreaFill({ hue: series.hue, tone: series.tone, fallbackKey: series.dataKey });
            return (
              <Radar
                key={`radar-${series.dataKey}-${index}`}
                dataKey={series.dataKey}
                name={series.name ?? series.dataKey}
                stroke={stroke}
                fill={fill}
                fillOpacity={series.fillOpacity ?? 0.45}
                isAnimationActive={false}
              />
            );
          })}
        </RadarChart>
      </ChartFrame>
    );
  }

  if (spec.type === "radial-bar") {
    const dataWithFill = spec.data.map((row, index) => {
      const hue = typeof row.hue === "number" ? row.hue : undefined;
      const key = typeof row.name === "string" ? row.name : `radial-${index}`;
      return {
        ...row,
        fill: resolveColor({ hue, defaultTone: "accent", fallbackKey: key }),
      };
    });
    return (
      <ChartFrame title={spec.title} height={height}>
        <RadialBarChart data={dataWithFill} innerRadius="30%" outerRadius="90%">
          <CartesianTooltipBundle spec={spec} />
          {renderLegend(spec)}
          {spec.series.map((series, index) => (
            <RadialBar key={`radial-${series.dataKey}-${index}`} dataKey={series.dataKey} background={{ fill: "var(--bg-card)" }} cornerRadius={4} isAnimationActive={false} />
          ))}
        </RadialBarChart>
      </ChartFrame>
    );
  }

  throw new Error(`Unknown chart type: ${(spec as { type: string }).type}`);
}
