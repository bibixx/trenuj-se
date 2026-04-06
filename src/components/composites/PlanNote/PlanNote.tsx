import clsx from "clsx";
import { Card } from "../../primitives/Card/Card.tsx";
import { Badge } from "../../primitives/Badge/Badge.tsx";
import type { PlanNote as PlanNoteType } from "../../../lib/types.ts";
import styles from "./PlanNote.module.css";

interface PlanNoteProps {
  note: PlanNoteType;
  renderContent?: (content: string) => React.ReactNode;
  className?: string;
}

const TYPE_HUE: Record<string, number> = {
  summary: 90,
  adjustment: 30,
  note: 220,
  recommendation: 150,
};

export function PlanNote({ note, renderContent, className }: PlanNoteProps) {
  const hue = TYPE_HUE[note.type] ?? 90;

  return (
    <Card className={clsx(styles.root, className)}>
      <div className={styles.header}>
        <Badge variant="phase" hue={hue}>
          {note.type}
        </Badge>
      </div>
      <div className={styles.content}>{renderContent ? renderContent(note.content) : note.content}</div>
    </Card>
  );
}
