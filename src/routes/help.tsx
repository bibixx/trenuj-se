import { createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "../components/composites/PageLayout/PageLayout.tsx";
import { commitHash } from "../lib/commit-hash.ts";
import styles from "./help.module.css";

export const Route = createFileRoute("/help")({
  component: HelpPage,
});

function HelpPage() {
  return (
    <PageLayout>
      <h1 className={styles.heading}>Help</h1>
      <p className={styles.body}>Need a hand? Email us and we'll get back to you.</p>
      <a className={styles.link} href="mailto:help@trenuj.se">
        help@trenuj.se
      </a>
      <p className={styles.version}>
        Version <code>{commitHash}</code>
      </p>
    </PageLayout>
  );
}
