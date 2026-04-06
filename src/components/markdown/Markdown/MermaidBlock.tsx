import { renderMermaidSync } from "beautiful-mermaid";
import { useMemo } from "react";

interface MermaidBlockProps {
  chart: string;
}

export function MermaidBlock({ chart }: MermaidBlockProps) {
  const svg = useMemo(() => {
    try {
      return renderMermaidSync(chart, {
        bg: "transparent",
        fg: "var(--text-primary)",
      });
    } catch {
      return null;
    }
  }, [chart]);

  if (!svg) {
    return (
      <pre style={{ color: "var(--destructive)", fontSize: "var(--text-xs)" }}>
        <code>Failed to render mermaid chart</code>
      </pre>
    );
  }

  return <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
