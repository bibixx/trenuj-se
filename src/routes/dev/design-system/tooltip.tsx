import { IconInfoCircle, IconPlus, IconSettings, IconTrash } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "../../../components/primitives/Button/Button.tsx";
import { Tooltip } from "../../../components/primitives/Tooltip/Tooltip.tsx";
import styles from "../design-system.module.css";

export const Route = createFileRoute("/dev/design-system/tooltip")({
  component: TooltipSection,
});

function TooltipSection() {
  return (
    <Tooltip.Provider>
      <div className={styles.section}>
        <h1 className={styles.sectionTitle}>Tooltip</h1>
        <p className={styles.description}>Contextual labels that appear on hover or focus to describe an element.</p>

        <h2 className={styles.subTitle}>Basic</h2>
        <div className={styles.row}>
          <Tooltip label="This is a tooltip">
            <Button variant="secondary">Hover me</Button>
          </Tooltip>
        </div>

        <h2 className={styles.subTitle}>Placement</h2>
        <div className={styles.row}>
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <Tooltip key={side} label={`Tooltip on ${side}`} side={side}>
              <Button variant="secondary">{side}</Button>
            </Tooltip>
          ))}
        </div>

        <h2 className={styles.subTitle}>Cursor Tracking</h2>
        <div className={styles.row}>
          <Tooltip label="Following your cursor" trackCursorAxis="both">
            <Button variant="secondary">Move cursor over me</Button>
          </Tooltip>
        </div>

        <h2 className={styles.subTitle}>On Icon Buttons</h2>
        <p className={styles.description}>Common pattern — icon-only buttons should always have a tooltip for accessibility.</p>
        <div className={styles.row}>
          <Tooltip label="Add workout">
            <Button variant="primary" icon={<IconPlus />} />
          </Tooltip>
          <Tooltip label="Settings">
            <Button variant="secondary" icon={<IconSettings />} />
          </Tooltip>
          <Tooltip label="More info">
            <Button variant="ghost" icon={<IconInfoCircle />} />
          </Tooltip>
          <Tooltip label="Delete workout">
            <Button variant="destructive" icon={<IconTrash />} />
          </Tooltip>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
