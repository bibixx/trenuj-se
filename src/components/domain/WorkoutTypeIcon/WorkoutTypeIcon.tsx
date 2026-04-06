import clsx from "clsx";
import { resolveIcon, FALLBACK_ICON_NAME } from "../../../lib/icon-resolver.ts";
import { useTablerIcon } from "../../../lib/use-tabler-icon.ts";
import styles from "./WorkoutTypeIcon.module.css";

interface WorkoutTypeIconProps {
  icon: string | null | undefined;
  className?: string;
}

function TablerMaskIcon({ name, size }: { name: string; size: number }) {
  const url = useTablerIcon(name);
  if (!url) return null;

  return (
    <span
      className={styles.mask}
      style={{
        width: size,
        height: size,
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
      }}
    />
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
