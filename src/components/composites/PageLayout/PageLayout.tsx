import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import type { ReactNode } from "react";
import { profileQueryOptions } from "../../../lib/queries/profile.ts";
import { Badge } from "../../primitives/Badge/Badge.tsx";
import { ScrollAreaComponent as ScrollArea } from "../../primitives/ScrollArea/ScrollArea.tsx";
import { ChromeHeader } from "../ChromeHeader/ChromeHeader.tsx";
import { Footer } from "../Footer/Footer.tsx";
import styles from "./PageLayout.module.css";

interface PageLayoutProps {
  children: ReactNode;
  headerActions?: ReactNode;
  centerHeader?: boolean;
}

export function PageLayout({ children, headerActions, centerHeader }: PageLayoutProps) {
  const { data: profile } = useQuery(profileQueryOptions);

  return (
    <ScrollArea.Root className={styles.scroll}>
      <ScrollArea.Viewport fadeout={{ sizeTop: 32, sizeBottom: 40 }}>
        <ScrollArea.Content className={clsx(styles.content, centerHeader && styles.centerHeader)}>
          <ChromeHeader.Root>
            <ChromeHeader.Actions>
              {profile?.isPremium && <Badge variant="premium">Premium</Badge>}
              {headerActions}
            </ChromeHeader.Actions>
          </ChromeHeader.Root>
          {children}
          <Footer />
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar />
    </ScrollArea.Root>
  );
}
