import type { CSSProperties, ReactNode, Ref } from "react";
import { ScrollArea } from "@base-ui/react/scroll-area";
import cn from "clsx";
import styles from "./ScrollArea.module.css";

// Fadeout style options
interface FadeoutStyleOptions {
  /** Size for all fadeout edges */
  size?: number;
  /** Size for top fadeout */
  sizeTop?: number;
  /** Size for bottom fadeout */
  sizeBottom?: number;
  /** Padding before top fadeout starts */
  paddingTop?: number;
  /** Padding before bottom fadeout starts */
  paddingBottom?: number;
  /** Size for left fadeout */
  sizeLeft?: number;
  /** Size for right fadeout */
  sizeRight?: number;
  /** Padding before left fadeout starts */
  paddingLeft?: number;
  /** Padding before right fadeout starts */
  paddingRight?: number;
}

function buildFadeoutStyle(options: FadeoutStyleOptions): CSSProperties {
  const style: Record<string, string> = {};

  if (options.sizeTop !== undefined || options.size !== undefined) {
    style["--fadeout-size-top"] = `${options.sizeTop ?? options.size ?? 72}px`;
  }
  if (options.sizeBottom !== undefined || options.size !== undefined) {
    style["--fadeout-size-bottom"] = `${options.sizeBottom ?? options.size ?? 72}px`;
  }
  if (options.paddingTop !== undefined) {
    style["--fadeout-padding-top"] = `${options.paddingTop}px`;
  }
  if (options.paddingBottom !== undefined) {
    style["--fadeout-padding-bottom"] = `${options.paddingBottom}px`;
  }
  if (options.sizeLeft !== undefined || options.size !== undefined) {
    style["--fadeout-size-left"] = `${options.sizeLeft ?? options.size ?? 72}px`;
  }
  if (options.sizeRight !== undefined || options.size !== undefined) {
    style["--fadeout-size-right"] = `${options.sizeRight ?? options.size ?? 72}px`;
  }
  if (options.paddingLeft !== undefined) {
    style["--fadeout-padding-left"] = `${options.paddingLeft}px`;
  }
  if (options.paddingRight !== undefined) {
    style["--fadeout-padding-right"] = `${options.paddingRight}px`;
  }

  return style as CSSProperties;
}

interface ScrollAreaRootProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const ScrollAreaRoot = ({ children, className, style }: ScrollAreaRootProps) => {
  return (
    <ScrollArea.Root className={cn(styles.root, className)} style={style}>
      {children}
    </ScrollArea.Root>
  );
};

interface VerticalFadeoutConfig extends FadeoutStyleOptions {
  direction?: "vertical";
}

interface HorizontalFadeoutConfig extends FadeoutStyleOptions {
  direction: "horizontal";
}

interface BothFadeoutConfig extends FadeoutStyleOptions {
  direction: "both";
}

type FadeoutConfig = VerticalFadeoutConfig | HorizontalFadeoutConfig | BothFadeoutConfig;

interface ScrollAreaViewportProps {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
  /** Enable fadeout masks at edges. Pass `true` for default vertical fadeout, or a config object. */
  fadeout?: boolean | FadeoutConfig;
}

const ScrollAreaViewport = ({ children, className, ref, fadeout }: ScrollAreaViewportProps) => {
  const fadeoutConfig: FadeoutConfig | null = fadeout === true ? { direction: "vertical" } : fadeout === false ? null : fadeout || null;
  const direction = fadeoutConfig?.direction ?? (fadeout === false ? null : "vertical");

  const enableVertical = direction === "vertical" || direction === "both";
  const enableHorizontal = direction === "horizontal" || direction === "both";

  return (
    <ScrollArea.Viewport
      ref={ref}
      className={cn(styles.viewport, className, enableVertical && styles.verticalFadeout, enableHorizontal && styles.horizontalFadeout)}
      style={fadeoutConfig ? buildFadeoutStyle(fadeoutConfig) : undefined}
    >
      {children}
    </ScrollArea.Viewport>
  );
};

interface ScrollAreaContentProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const ScrollAreaContent = ({ children, className, style }: ScrollAreaContentProps) => {
  return (
    <ScrollArea.Content className={cn(styles.content, className)} style={{ minWidth: undefined, ...style }}>
      {children}
    </ScrollArea.Content>
  );
};

interface ScrollAreaScrollbarProps {
  orientation?: "vertical" | "horizontal";
  className?: string;
}

const ScrollAreaScrollbar = ({ orientation = "vertical", className }: ScrollAreaScrollbarProps) => {
  return (
    <ScrollArea.Scrollbar orientation={orientation} className={cn(styles.scrollbar, className)}>
      <ScrollArea.Thumb className={styles.thumb} />
    </ScrollArea.Scrollbar>
  );
};

export const ScrollAreaComponent = {
  Root: ScrollAreaRoot,
  Viewport: ScrollAreaViewport,
  Content: ScrollAreaContent,
  Scrollbar: ScrollAreaScrollbar,
};
