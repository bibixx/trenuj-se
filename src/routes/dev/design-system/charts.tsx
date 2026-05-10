import { createFileRoute } from "@tanstack/react-router";
import { Markdown } from "../../../components/markdown/Markdown/Markdown.tsx";
import type { ChartSpec } from "../../../components/composites/Chart/types.ts";
import styles from "../design-system.module.css";
import chartStyles from "./charts.module.css";

export const Route = createFileRoute("/dev/design-system/charts")({
  component: ChartsSection,
});

interface ChartExampleProps {
  index: number;
  title: string;
  description?: string;
  spec: ChartSpec;
}

function ChartExample({ index, title, description, spec }: ChartExampleProps) {
  const json = JSON.stringify(spec, null, 2);
  const block = "```chart\n" + json + "\n```";
  return (
    <section className={chartStyles.example}>
      <div className={chartStyles.exampleHeader}>
        <h3 className={chartStyles.exampleTitle}>
          <span className={chartStyles.exampleNumber}>{String(index).padStart(2, "0")}.</span>
          {title}
        </h3>
        {description ? <p className={chartStyles.exampleDescription}>{description}</p> : null}
      </div>
      <div className={chartStyles.exampleBody}>
        <Markdown>{block}</Markdown>
        <pre className={chartStyles.source}>{json}</pre>
      </div>
    </section>
  );
}

function RawExample({ index, title, description, source }: { index: number; title: string; description?: string; source: string }) {
  const block = "```chart\n" + source + "\n```";
  return (
    <section className={chartStyles.example}>
      <div className={chartStyles.exampleHeader}>
        <h3 className={chartStyles.exampleTitle}>
          <span className={chartStyles.exampleNumber}>{String(index).padStart(2, "0")}.</span>
          {title}
        </h3>
        {description ? <p className={chartStyles.exampleDescription}>{description}</p> : null}
      </div>
      <div className={chartStyles.exampleBody}>
        <Markdown>{block}</Markdown>
        <pre className={chartStyles.source}>{source}</pre>
      </div>
    </section>
  );
}

const WEEK_LABELS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"];

const ZONE_DISTRIBUTION: ChartSpec = {
  type: "bar",
  title: "Zone Distribution — Last 7 Days",
  data: [
    { zone: "Z1", minutes: 145 },
    { zone: "Z2", minutes: 230 },
    { zone: "Z3", minutes: 65 },
    { zone: "Z4", minutes: 30 },
    { zone: "Z5", minutes: 12 },
  ],
  xAxis: { dataKey: "zone" },
  yAxis: { label: "min" },
  series: [{ dataKey: "minutes", hue: 145, name: "Time in zone" }],
};

const VOLUME_BY_SPORT: ChartSpec = {
  type: "bar",
  title: "Weekly Volume by Sport",
  data: [
    { week: "W1", run: 45, bike: 90, swim: 5 },
    { week: "W2", run: 50, bike: 100, swim: 6 },
    { week: "W3", run: 55, bike: 120, swim: 7 },
    { week: "W4", run: 40, bike: 80, swim: 5 },
  ],
  xAxis: { dataKey: "week" },
  yAxis: { label: "km" },
  legend: "bottom",
  series: [
    { dataKey: "run", hue: 25, name: "Run" },
    { dataKey: "bike", hue: 200, name: "Bike" },
    { dataKey: "swim", hue: 260, name: "Swim" },
  ],
};

const STACKED_TIME_IN_ZONE: ChartSpec = {
  type: "bar",
  title: "Time in Zone by Week",
  data: WEEK_LABELS.slice(0, 6).map((week, i) => ({
    week,
    z1: 60 + i * 5,
    z2: 120 + i * 8,
    z3: 30 + i * 2,
    z4: 15 + i,
    z5: 5,
  })),
  xAxis: { dataKey: "week" },
  yAxis: { label: "min" },
  legend: "bottom",
  stacked: true,
  series: [
    { dataKey: "z1", hue: 200, name: "Z1" },
    { dataKey: "z2", hue: 145, name: "Z2" },
    { dataKey: "z3", hue: 80, name: "Z3" },
    { dataKey: "z4", hue: 40, name: "Z4" },
    { dataKey: "z5", hue: 5, name: "Z5" },
  ],
};

const TSS_TREND: ChartSpec = {
  type: "line",
  title: "Weekly TSS — 12 Week Block",
  data: WEEK_LABELS.map((week, i) => ({
    week,
    tss: 320 + Math.round(Math.sin(i / 1.6) * 80) + i * 18,
  })),
  xAxis: { dataKey: "week" },
  yAxis: { label: "TSS" },
  series: [{ dataKey: "tss", hue: 145, name: "TSS" }],
};

const VOLUME_BY_SPORT_LINE: ChartSpec = {
  type: "line",
  title: "Weekly Volume by Sport",
  data: WEEK_LABELS.map((week, i) => ({
    week,
    run: 35 + i * 3 + Math.round(Math.sin(i) * 5),
    bike: 70 + i * 6 + Math.round(Math.cos(i) * 8),
    swim: 4 + i * 0.4,
  })),
  xAxis: { dataKey: "week" },
  yAxis: { label: "km" },
  legend: "bottom",
  series: [
    { dataKey: "run", hue: 25, name: "Run" },
    { dataKey: "bike", hue: 200, name: "Bike" },
    { dataKey: "swim", hue: 260, name: "Swim" },
  ],
};

const RESTING_HR: ChartSpec = {
  type: "line",
  title: "Resting HR — 30 Days",
  data: Array.from({ length: 30 }, (_, i) => ({
    day: `D${i + 1}`,
    rhr: 48 + Math.round(Math.sin(i / 3) * 4) + (i > 22 ? 2 : 0),
  })),
  xAxis: { dataKey: "day", format: "default" },
  yAxis: { label: "bpm", domain: [40, 60] },
  series: [{ dataKey: "rhr", hue: 25, name: "Resting HR", dot: true }],
  referenceLines: [{ y: 50, label: "target", strokeDasharray: "4 3" }],
  tooltip: { format: "hr" },
};

const CTL_RAMP: ChartSpec = {
  type: "area",
  title: "Chronic Training Load (CTL)",
  data: WEEK_LABELS.map((week, i) => ({
    week,
    ctl: 35 + i * 4.5,
  })),
  xAxis: { dataKey: "week" },
  yAxis: { label: "CTL" },
  series: [{ dataKey: "ctl", hue: 200, name: "CTL" }],
};

const VOLUME_BY_INTENSITY: ChartSpec = {
  type: "area",
  title: "Volume by Intensity (Stacked)",
  data: WEEK_LABELS.slice(0, 8).map((week, i) => ({
    week,
    easy: 4 + i * 0.5,
    moderate: 1.5 + Math.sin(i / 2) * 0.5,
    hard: 0.5 + (i > 4 ? 0.5 : 0),
  })),
  xAxis: { dataKey: "week" },
  yAxis: { label: "hours" },
  legend: "bottom",
  stacked: true,
  series: [
    { dataKey: "easy", hue: 145, name: "Easy" },
    { dataKey: "moderate", hue: 60, name: "Moderate" },
    { dataKey: "hard", hue: 5, name: "Hard" },
  ],
};

const HR_VS_ELEVATION: ChartSpec = {
  type: "composed",
  title: "Long Run — HR vs Elevation",
  data: Array.from({ length: 25 }, (_, i) => {
    const km = i * 0.5;
    const elev = 120 + Math.sin(i / 3) * 40 + i * 2;
    const hr = 130 + i * 1.2 + Math.sin(i / 1.5) * 8;
    return { km, hr: Math.round(hr), elev: Math.round(elev) };
  }),
  xAxis: { dataKey: "km", label: "km" },
  yAxis: [
    { id: "hr", label: "HR", domain: [120, 175], orientation: "left" },
    { id: "elev", label: "Elev (m)", orientation: "right" },
  ],
  legend: "bottom",
  series: [
    { type: "area", dataKey: "elev", yAxisId: "elev", hue: 200, name: "Elevation", curve: "monotone" },
    { type: "line", dataKey: "hr", yAxisId: "hr", hue: 25, name: "HR", dot: false, strokeWidth: 2 },
  ],
  referenceAreas: [{ yAxisId: "hr", y1: 150, y2: 165, label: "Z3", hue: 80 }],
};

const VOLUME_WITH_AVG: ChartSpec = {
  type: "composed",
  title: "Weekly Volume with 4-Week Rolling Average",
  data: WEEK_LABELS.map((week, i) => ({
    week,
    volume: 50 + i * 3 + Math.round(Math.sin(i / 1.4) * 12),
    avg: 50 + i * 3,
  })),
  xAxis: { dataKey: "week" },
  yAxis: { label: "km" },
  legend: "bottom",
  series: [
    { type: "bar", dataKey: "volume", hue: 145, name: "Weekly km" },
    { type: "line", dataKey: "avg", hue: 25, name: "4-wk avg", strokeWidth: 2, dot: false },
  ],
};

const PACE_VS_HR: ChartSpec = {
  type: "scatter",
  title: "Easy Run Pace vs HR",
  data: Array.from({ length: 30 }, () => ({
    pace: 270 + Math.round(Math.random() * 60),
    hr: 130 + Math.round(Math.random() * 25),
  })),
  xAxis: { dataKey: "pace", label: "Pace", format: "pace" },
  yAxis: { label: "HR", format: "hr", domain: [120, 165] },
  series: [{ dataKey: "hr", hue: 145, name: "Run" }],
  tooltip: { format: "hr" },
};

const FITNESS_PROFILE: ChartSpec = {
  type: "radar",
  title: "Fitness Profile",
  angleKey: "trait",
  data: [
    { trait: "Endurance", current: 78, target: 85 },
    { trait: "Threshold", current: 65, target: 80 },
    { trait: "VO2max", current: 60, target: 75 },
    { trait: "Strength", current: 55, target: 70 },
    { trait: "Mobility", current: 70, target: 80 },
  ],
  legend: "bottom",
  series: [
    { dataKey: "current", hue: 145, name: "Current" },
    { dataKey: "target", hue: 25, name: "Target", fillOpacity: 0.15 },
  ],
};

const WEEKLY_GOAL: ChartSpec = {
  type: "radial-bar",
  title: "Weekly Goal Progress (% of target volume)",
  data: [
    { name: "Run", percent: 86, fill: "" },
    { name: "Bike", percent: 64, fill: "" },
    { name: "Swim", percent: 92, fill: "" },
  ].map((row, index) => ({ ...row, hue: [25, 200, 260][index] })),
  legend: "bottom",
  series: [{ dataKey: "percent", hue: 145, name: "% of target" }],
};

const HR_ZONES_OVERLAY: ChartSpec = {
  type: "line",
  title: "HR Trace — Tempo Workout",
  data: Array.from({ length: 60 }, (_, i) => {
    let hr = 110;
    if (i < 8) hr = 110 + i * 4;
    else if (i < 12) hr = 142 + (i - 8) * 3;
    else if (i < 50) hr = 158 + Math.sin(i / 4) * 4;
    else hr = 158 - (i - 50) * 4;
    return { min: i, hr: Math.round(hr) };
  }),
  xAxis: { dataKey: "min", label: "min" },
  yAxis: { label: "HR", domain: [100, 175] },
  series: [{ dataKey: "hr", hue: 25, name: "HR", dot: false, strokeWidth: 2 }],
  referenceAreas: [
    { y1: 100, y2: 130, label: "Z1", hue: 200 },
    { y1: 130, y2: 150, label: "Z2", hue: 145 },
    { y1: 150, y2: 165, label: "Z3", hue: 80 },
    { y1: 165, y2: 175, label: "Z4", hue: 25 },
  ],
};

const FORMATTER_PACE: ChartSpec = {
  type: "line",
  title: "Pace Over Distance",
  data: Array.from({ length: 10 }, (_, i) => ({ km: i + 1, pace: 270 + i * 4 })),
  xAxis: { dataKey: "km", label: "km" },
  yAxis: { label: "pace", format: "pace", reversed: true },
  tooltip: { format: "pace" },
  series: [{ dataKey: "pace", hue: 145, name: "Pace" }],
};

const FORMATTER_DURATION: ChartSpec = {
  type: "bar",
  title: "Workout Duration by Day",
  data: [
    { day: "Mon", seconds: 1800 },
    { day: "Tue", seconds: 3300 },
    { day: "Wed", seconds: 2700 },
    { day: "Thu", seconds: 4200 },
    { day: "Fri", seconds: 1500 },
    { day: "Sat", seconds: 7200 },
    { day: "Sun", seconds: 5400 },
  ],
  xAxis: { dataKey: "day" },
  yAxis: { label: "time", format: "duration" },
  tooltip: { format: "duration" },
  series: [{ dataKey: "seconds", hue: 145, name: "Duration" }],
};

const FORMATTER_HR: ChartSpec = {
  type: "line",
  title: "Heart Rate",
  data: Array.from({ length: 20 }, (_, i) => ({ min: i, hr: 130 + Math.round(Math.sin(i / 3) * 15) })),
  xAxis: { dataKey: "min", label: "min" },
  yAxis: { format: "hr", domain: [110, 160] },
  tooltip: { format: "hr" },
  series: [{ dataKey: "hr", hue: 25, name: "HR" }],
};

const FORMATTER_DISTANCE: ChartSpec = {
  type: "bar",
  title: "Distance per Workout",
  data: [
    { workout: "Easy", meters: 8000 },
    { workout: "Long", meters: 22000 },
    { workout: "Tempo", meters: 12000 },
    { workout: "Intervals", meters: 9500 },
    { workout: "Recovery", meters: 4000 },
  ],
  xAxis: { dataKey: "workout" },
  yAxis: { format: "distance" },
  tooltip: { format: "distance" },
  series: [{ dataKey: "meters", hue: 200, name: "Distance" }],
};

const FORMATTER_PERCENT: ChartSpec = {
  type: "bar",
  title: "Plan Completion %",
  data: WEEK_LABELS.slice(0, 8).map((week, i) => ({
    week,
    completion: 0.6 + (i % 4) * 0.1,
  })),
  xAxis: { dataKey: "week" },
  yAxis: { format: "percent", domain: [0, 1] },
  tooltip: { format: "percent" },
  series: [{ dataKey: "completion", hue: 145, name: "Completion" }],
};

const FORMATTER_TEMPLATE: ChartSpec = {
  type: "line",
  title: "Power Output (Template Formatter)",
  data: Array.from({ length: 20 }, (_, i) => ({ sec: i * 5, power: 220 + Math.round(Math.sin(i / 2) * 30) })),
  xAxis: { dataKey: "sec", label: "s" },
  yAxis: { format: "{value} W" },
  tooltip: { format: "{value} W" },
  series: [{ dataKey: "power", hue: 60, name: "Power" }],
};

const HUE_SPECTRUM: ChartSpec = {
  type: "bar",
  title: "Hue Spectrum (0–330° in 30° steps)",
  data: Array.from({ length: 12 }, (_, i) => ({
    label: `${i * 30}°`,
    value: 1,
    hue: i * 30,
  })),
  xAxis: { dataKey: "label" },
  yAxis: { hide: true },
  legend: false,
  tooltip: false,
  series: [{ dataKey: "value", name: "Hue" }],
};

const NO_HUE_FALLBACK: ChartSpec = {
  type: "line",
  title: "No Hue — Hash-from-DataKey Fallback",
  data: WEEK_LABELS.slice(0, 8).map((week, i) => ({
    week,
    alpha: 30 + i * 4,
    bravo: 25 + i * 3,
    charlie: 40 + i * 5,
    delta: 20 + i * 2,
  })),
  xAxis: { dataKey: "week" },
  legend: "bottom",
  series: [
    { dataKey: "alpha", name: "Alpha" },
    { dataKey: "bravo", name: "Bravo" },
    { dataKey: "charlie", name: "Charlie" },
    { dataKey: "delta", name: "Delta" },
  ],
};

function ChartsSection() {
  return (
    <div className={styles.section}>
      <h1 className={styles.sectionTitle}>Charts</h1>
      <p className={styles.description}>
        Charts are emitted by the agents as <code>chart</code> markdown code blocks. Renderer is Recharts under the hood; colors come from a single hue (0–360°) expanded to OKLCH
        via the same recipe used by <code>WorkoutCard</code>. Animations are disabled.
      </p>

      <ChartExample index={1} title="Bar — Single Series" description="Zone distribution. Single hue applied to every bar." spec={ZONE_DISTRIBUTION} />
      <ChartExample index={2} title="Bar — Multi Series, Grouped" description="Weekly volume split by sport, three hues." spec={VOLUME_BY_SPORT} />
      <ChartExample index={3} title="Bar — Stacked" description="Time-in-zone stacked across weeks. Cool → warm hue progression by zone intensity." spec={STACKED_TIME_IN_ZONE} />
      <ChartExample index={4} title="Line — Single Series" description="Weekly TSS over a 12-week block." spec={TSS_TREND} />
      <ChartExample index={5} title="Line — Multi Series" description="Run / bike / swim weekly km." spec={VOLUME_BY_SPORT_LINE} />
      <ChartExample index={6} title="Line — With Reference Line" description="Resting HR with a target line. Dot markers enabled." spec={RESTING_HR} />
      <ChartExample index={7} title="Area — Single Series" description="CTL ramp over a training block." spec={CTL_RAMP} />
      <ChartExample index={8} title="Area — Stacked" description="Volume split by intensity (easy / moderate / hard)." spec={VOLUME_BY_INTENSITY} />
      <ChartExample index={9} title="Composed — Dual Axis" description="HR + elevation over distance. Z3 reference area highlights threshold zone." spec={HR_VS_ELEVATION} />
      <ChartExample index={10} title="Composed — Bar + Line" description="Weekly volume bars with rolling average line overlay." spec={VOLUME_WITH_AVG} />
      <ChartExample index={11} title="Scatter" description="Pace vs HR for 30 easy runs. Pace formatter on x-axis." spec={PACE_VS_HR} />
      <ChartExample index={12} title="Radar" description="Fitness profile across five traits, current vs target." spec={FITNESS_PROFILE} />
      <ChartExample index={13} title="Radial Bar" description="Weekly goal progress." spec={WEEKLY_GOAL} />
      <ChartExample index={14} title="Reference Areas — HR Zones Overlay" description="HR trace from a tempo workout with all four zones overlaid." spec={HR_ZONES_OVERLAY} />

      <h2 className={styles.subTitle} style={{ marginTop: 32 }}>
        Formatters
      </h2>
      <ChartExample index={15} title="pace" description="270 → 4:30/km. Y-axis reversed (lower pace = better)." spec={FORMATTER_PACE} />
      <ChartExample index={16} title="duration" description="3600 → 1:00:00, 90 → 1:30." spec={FORMATTER_DURATION} />
      <ChartExample index={17} title="hr" description="150 → 150 bpm." spec={FORMATTER_HR} />
      <ChartExample index={18} title="distance" description="5000 → 5.0 km, 400 → 400 m." spec={FORMATTER_DISTANCE} />
      <ChartExample index={19} title="percent" description="0.5 → 50% (fraction scale by default)." spec={FORMATTER_PERCENT} />
      <ChartExample index={20} title="template — {value} W" description="Use a template string for one-off units." spec={FORMATTER_TEMPLATE} />

      <h2 className={styles.subTitle} style={{ marginTop: 32 }}>
        Color Behavior
      </h2>
      <ChartExample
        index={21}
        title="Hue Spectrum"
        description="Twelve series at hues 0/30/60/.../330° to verify OKLCH legibility across the wheel in dark and light mode."
        spec={HUE_SPECTRUM}
      />
      <ChartExample
        index={22}
        title="No Hue — Hash Fallback"
        description="When `hue` is omitted, color is derived deterministically from the dataKey via `hashToHue`."
        spec={NO_HUE_FALLBACK}
      />

      <h2 className={styles.subTitle} style={{ marginTop: 32 }}>
        Error States
      </h2>
      <RawExample
        index={23}
        title="Malformed JSON"
        description="A chart block with broken JSON renders the `Invalid Chart` notice."
        source={`{ "type": "bar", "data": [ // missing brackets`}
      />
      <RawExample
        index={24}
        title="Unknown Chart Type"
        description="An unknown `type` triggers the error boundary fallback."
        source={JSON.stringify({ type: "sankey", data: [] }, null, 2)}
      />
    </div>
  );
}
