import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";
import styles from "./Tooltip.module.css";

type Side = "top" | "right" | "bottom" | "left";

interface TooltipProps {
  /** The element that triggers the tooltip on hover/focus. */
  children: ReactNode;
  /** Text shown inside the tooltip popup. */
  label: ReactNode;
  /** @default 'top' */
  side?: Side;
  /** @default 6 */
  sideOffset?: number;
  /** @default 'none' */
  trackCursorAxis?: "none" | "x" | "y" | "both";
  disabled?: boolean;
}

export function Tooltip({ children, label, side = "top", sideOffset = 6, trackCursorAxis, disabled }: TooltipProps) {
  return (
    <BaseTooltip.Root trackCursorAxis={trackCursorAxis} disabled={disabled}>
      <BaseTooltip.Trigger className={styles.trigger} render={<span />}>
        {children}
      </BaseTooltip.Trigger>
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={sideOffset} className={styles.positioner}>
          <BaseTooltip.Popup className={styles.popup}>{label}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

Tooltip.Provider = BaseTooltip.Provider;
