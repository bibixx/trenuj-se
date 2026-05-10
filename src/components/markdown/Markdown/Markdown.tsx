import clsx from "clsx";
import { Children, isValidElement, lazy, Suspense } from "react";
import type { ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { MarkdownCheckbox } from "../../primitives/MarkdownCheckbox/MarkdownCheckbox.tsx";
import styles from "./Markdown.module.css";

const Chart = lazy(() => import("../../composites/Chart/Chart.tsx"));

interface MarkdownProps {
  children: string;
  className?: string;
}

function getCodeChild(node: unknown): ReactElement<{ className?: string }> | null {
  if (!isValidElement(node)) return null;
  if (node.type === "code" || (node.props as { className?: string } | undefined)?.className) {
    return node as ReactElement<{ className?: string }>;
  }
  return null;
}

const components: Components = {
  input(props) {
    if (props.type === "checkbox") {
      return <MarkdownCheckbox checked={!!props.checked} className={styles.taskCheckbox} />;
    }
    return <input {...props} />;
  },
  pre(props) {
    const onlyChild = Children.toArray(props.children).find(isValidElement);
    const codeChild = getCodeChild(onlyChild);
    if (codeChild?.props?.className?.includes("language-chart")) {
      return <>{props.children}</>;
    }
    return <pre>{props.children}</pre>;
  },
  code(props) {
    const { children, className } = props;
    const match = className?.match(/language-(\w+)/);
    const lang = match?.[1];

    if (lang === "chart" && typeof children === "string") {
      return (
        <Suspense fallback={null}>
          <Chart source={children.trim()} />
        </Suspense>
      );
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
