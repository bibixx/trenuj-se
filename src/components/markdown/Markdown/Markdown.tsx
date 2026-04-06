import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { MarkdownCheckbox } from "../../primitives/MarkdownCheckbox/MarkdownCheckbox.tsx";
import { MermaidBlock } from "./MermaidBlock.tsx";
import styles from "./Markdown.module.css";

interface MarkdownProps {
  children: string;
  className?: string;
}

const components: Components = {
  input(props) {
    if (props.type === "checkbox") {
      return <MarkdownCheckbox checked={!!props.checked} className={styles.taskCheckbox} />;
    }
    return <input {...props} />;
  },
  code(props) {
    const { children, className } = props;
    const match = className?.match(/language-(\w+)/);
    const lang = match?.[1];

    if (lang === "mermaid" && typeof children === "string") {
      return <MermaidBlock chart={children.trim()} />;
    }

    if (lang) {
      return <code className={className}>{children}</code>;
    }

    return <code>{children}</code>;
  },
};

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={clsx(styles.markdown, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
