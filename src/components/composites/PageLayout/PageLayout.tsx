import clsx from "clsx";
import type { ReactNode } from "react";
import { ScrollAreaComponent as ScrollArea } from "../../primitives/ScrollArea/ScrollArea.tsx";
import { ChromeHeader } from "../ChromeHeader/ChromeHeader.tsx";
import styles from "./PageLayout.module.css";

interface PageLayoutProps {
  children: ReactNode;
  headerActions?: ReactNode;
  centerHeader?: boolean;
}

export function PageLayout({ children, headerActions, centerHeader }: PageLayoutProps) {
  return (
    <ScrollArea.Root className={styles.scroll}>
      <ScrollArea.Viewport fadeout={{ sizeTop: 32, sizeBottom: 40 }}>
        <ScrollArea.Content className={clsx(styles.content, centerHeader && styles.centerHeader)}>
          <ChromeHeader.Root>{headerActions && <ChromeHeader.Actions>{headerActions}</ChromeHeader.Actions>}</ChromeHeader.Root>
          {children}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar />
    </ScrollArea.Root>
  );
}
