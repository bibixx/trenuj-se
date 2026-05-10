import clsx from "clsx";
import { resolveIcon, FALLBACK_ICON_NAME } from "../../../lib/icon-resolver.ts";
import { getTablerIconUrl } from "../../../lib/tabler-icon-url.ts";
import styles from "./WorkoutTypeIcon.module.css";
import { useId, useState } from "react";

interface WorkoutTypeIconProps {
  icon: string | null | undefined;
  className?: string;
}

function TablerMaskIcon({ name, size }: { name: string; size: number }) {
  const url = getTablerIconUrl(name);
  const id = useId();
  const maskId = `mask-${id}`;
  const [loadingState, setLoadingState] = useState<"loading" | "loaded" | "error">("loading");

  if (loadingState === "error") {
    return <TablerMaskIcon name={FALLBACK_ICON_NAME} size={18} />;
  }

  return (
    <svg
      viewBox="0 0 32 32"
      style={{
        width: size,
        height: size,
      }}
    >
      <mask id={maskId} mask-type="alpha">
        <image href={url} height="32" width="32" onError={() => setLoadingState("error")} onLoad={() => setLoadingState("loaded")} />
      </mask>

      <rect x="0" y="0" width="32" height="32" fill="currentcolor" mask={`url(#${maskId})`}></rect>
    </svg>
  );
}

export function WorkoutTypeIcon({ icon, className }: WorkoutTypeIconProps) {
  const resolution = resolveIcon(icon);

  return (
    <span className={clsx(styles.chip, className)}>
      {resolution.type === "tabler" && <TablerMaskIcon name={resolution.name} size={18} />}
      {resolution.type === "svg" && <span className={styles.svg} dangerouslySetInnerHTML={{ __html: resolution.svg }} />}
      {resolution.type === "emoji" && <span className={styles.emoji}>{resolution.emoji}</span>}
      {resolution.type === "fallback" && <TablerMaskIcon name={FALLBACK_ICON_NAME} size={18} />}
    </span>
  );
}
