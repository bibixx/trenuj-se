import { createFileRoute } from "@tanstack/react-router";
import { Card } from "../../../components/primitives/Card/Card.tsx";
import { Markdown } from "../../../components/markdown/Markdown/Markdown.tsx";
import styles from "../design-system.module.css";

export const Route = createFileRoute("/dev/design-system/markdown")({
  component: MarkdownSection,
});

const MARKDOWN_SPECIMEN = `# Heading 1
## Heading 2
### Heading 3
#### Heading 4

A paragraph with **bold**, *italic*, ~~strikethrough~~, and \`inline code\`.

[Link to Strava](https://strava.com) looks like this.

---

### Unordered List
- First item
- Second item with **bold**
- Third item

### Ordered List
1. Step one
2. Step two
3. Step three

### Task List
- [x] Warm up completed
- [x] Main set done
- [ ] Cool down
- [ ] Stretch

### Blockquote
> Keep your heart rate below 150 bpm during the easy segments.
> This is key for aerobic development.

### Table
| Zone | HR Range | Description |
|------|----------|-------------|
| Z1 | < 130 | Recovery |
| Z2 | 130–150 | Aerobic base |
| Z3 | 150–165 | Tempo |
| Z4 | 165–180 | Threshold |
| Z5 | 180+ | VO2max |

### Code Block
\`\`\`
Interval Plan:
  4 × 800m @ 3:15/km
  Recovery: 400m jog (2:00)
  Total volume: ~8km
\`\`\`

### Mermaid Chart (xychart-beta)
\`\`\`mermaid
xychart-beta
  title "Zone Distribution (min)"
  x-axis ["Z1", "Z2", "Z3", "Z4", "Z5"]
  y-axis "Minutes" 0 --> 60
  bar [10, 45, 25, 15, 5]
\`\`\`

### Nested Content
> #### Pro Tip
> When running intervals:
> 1. Start conservative
> 2. Build through the set
> 3. **Negative split** the last rep
`;

function MarkdownSection() {
  return (
    <div className={styles.section}>
      <h1 className={styles.sectionTitle}>Markdown Rendering</h1>
      <p className={styles.description}>Full specimen of all supported markdown features, rendered inside a card to verify real-world appearance.</p>
      <Card>
        <Markdown>{MARKDOWN_SPECIMEN}</Markdown>
      </Card>
    </div>
  );
}
