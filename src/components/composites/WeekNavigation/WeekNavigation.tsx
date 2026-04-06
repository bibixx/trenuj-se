import clsx from "clsx";
import { useRef, useEffect, useState, useLayoutEffect } from "react";
import { ScrollAreaComponent as ScrollArea } from "../../primitives/ScrollArea/ScrollArea.tsx";
import styles from "./WeekNavigation.module.css";

interface WeekNavigationProps {
  totalWeeks: number;
  currentWeek: number;
  onWeekChange: (week: number) => void;
  className?: string;
}

export function WeekNavigation({ totalWeeks, currentWeek, onWeekChange, className }: WeekNavigationProps) {
  const pillRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [dotStyle, setDotStyle] = useState<{ left: number; opacity: number }>({ left: 0, opacity: 0 });
  const [animationEnabled, setAnimationEnabled] = useState(false);

  useLayoutEffect(() => {
    const pill = pillRefs.current.get(currentWeek);
    if (pill) {
      setDotStyle({
        left: pill.offsetLeft + pill.offsetWidth / 2,
        opacity: 1,
      });

      requestAnimationFrame(() => {
        setAnimationEnabled(true);
      });
    }
  }, [currentWeek, totalWeeks]);

  useEffect(() => {
    const pill = pillRefs.current.get(currentWeek);
    if (pill) {
      pill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [currentWeek]);

  return (
    <div className={clsx(styles.root, className)}>
      <ScrollArea.Root className={styles.scrollRoot}>
        <ScrollArea.Viewport fadeout={{ direction: "horizontal", size: 40, paddingLeft: 4, paddingRight: 4 }}>
          <ScrollArea.Content className={styles.content}>
            {Array.from({ length: totalWeeks }, (_, i) => {
              const week = i + 1;
              const isActive = week === currentWeek;
              return (
                <button
                  key={week}
                  ref={(el) => {
                    if (el) pillRefs.current.set(week, el);
                  }}
                  className={clsx(styles.pill, isActive && styles.active)}
                  onClick={() => onWeekChange(week)}
                  aria-pressed={isActive}
                >
                  W{week}
                </button>
              );
            })}
            <span
              className={clsx(styles.dot, !animationEnabled && styles.dotNoTransition)}
              style={{
                insetInlineStart: dotStyle.left,
                opacity: dotStyle.opacity,
              }}
            />
          </ScrollArea.Content>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    </div>
  );
}
