import { createFileRoute, Link } from "@tanstack/react-router";
import { PageLayout } from "../components/composites/PageLayout/PageLayout.tsx";
import { TextLink } from "../components/primitives/TextLink/TextLink.tsx";
import { commitHash } from "../lib/commit-hash.ts";
import styles from "./help.module.css";

export const Route = createFileRoute("/help")({
  component: HelpPage,
});

function HelpPage() {
  return (
    <PageLayout>
      <h1 className={styles.heading}>Help</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Getting started</h2>
        <ol className={styles.steps}>
          <li className={styles.body}>
            <strong className={styles.term}>Connect an AI agent.</strong> Go to{" "}
            <TextLink variant="accent" render={<Link to="/settings/agent" />}>
              Settings
            </TextLink>{" "}
            and follow the steps for your client — Claude, Claude Code, Cursor, or VS Code. Your agent is the one that creates and manages your training plan; the web app is where
            you follow it.
          </li>
          <li className={styles.body}>
            <strong className={styles.term}>Ask it to build your plan.</strong> The{" "}
            <TextLink variant="accent" render={<Link to="/" />}>
              home page
            </TextLink>{" "}
            has a ready-made prompt you can copy into your AI client — it will ask about your goals and put a personalised plan together. You can also just describe what you're
            training for in your own words.
          </li>
          <li className={styles.body}>
            <strong className={styles.term}>Connect Strava (optional).</strong> Also in{" "}
            <TextLink variant="accent" render={<Link to="/settings/strava" />}>
              Settings
            </TextLink>
            . Once connected, new activities sync automatically and are matched to the workouts in your plan. Activities recorded before you connect aren't imported — only new ones
            sync.
          </li>
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Frequently asked questions</h2>

        <h3 className={styles.question}>What is trenuj.se, and why is there no “add workout” button?</h3>
        <p className={styles.body}>
          trenuj.se is an agent-first training planner. Your AI assistant acts as your coach — it builds your plan, adjusts it when life gets in the way, and answers questions
          about your training. The web app is deliberately hands-off: it's where you follow the plan, tick off workouts, and review your progress. To add or change a workout, just
          ask your agent.
        </p>

        <h3 className={styles.question}>Claude fails when I try to sign in during setup</h3>
        <p className={styles.body}>
          The sign-in window can occasionally fail or hang partway through. Remove the connector and add it again from Settings — it usually works on the second attempt. If it
          keeps failing, email us at{" "}
          <TextLink variant="accent" href="mailto:help@trenuj.se">
            help@trenuj.se
          </TextLink>{" "}
          and we'll sort it out.
        </p>

        <h3 className={styles.question}>How does sharing work?</h3>
        <p className={styles.body}>
          Use the share button at the top of your plan to create a read-only link that anyone can open — no account needed. For each link you choose what's visible: workouts,
          activities, trainer notes, and plan notes. You can deactivate or delete a link at any time, and it stops working immediately.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Still stuck?</h2>
        <p className={styles.body}>
          Email us and we'll get back to you:{" "}
          <TextLink variant="accent" href="mailto:help@trenuj.se">
            help@trenuj.se
          </TextLink>
        </p>
      </section>

      <p className={styles.version}>
        Version <code>{commitHash}</code>
      </p>
    </PageLayout>
  );
}
