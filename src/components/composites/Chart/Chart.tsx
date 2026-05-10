import { useMemo } from "react";
import { ChartErrorBoundary } from "./ChartErrorBoundary.tsx";
import { ChartRenderer } from "./ChartRenderer.tsx";
import type { ChartSpec } from "./types.ts";
import styles from "./Chart.module.css";

interface ChartProps {
  source: string;
}

function InvalidChart() {
  return <div className={styles.invalid}>Invalid Chart</div>;
}

function parseSpec(source: string): ChartSpec | null {
  try {
    const parsed = JSON.parse(source) as unknown;
    if (parsed && typeof parsed === "object" && "type" in parsed) {
      return parsed as ChartSpec;
    }
    return null;
  } catch {
    return null;
  }
}

export default function Chart({ source }: ChartProps) {
  const spec = useMemo(() => parseSpec(source), [source]);

  if (!spec) {
    return <InvalidChart />;
  }

  return (
    <ChartErrorBoundary fallback={<InvalidChart />}>
      <ChartRenderer spec={spec} />
    </ChartErrorBoundary>
  );
}
