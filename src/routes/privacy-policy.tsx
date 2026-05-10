import { createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "../components/composites/PageLayout/PageLayout.tsx";
import styles from "./privacy-policy.module.css";

export const Route = createFileRoute("/privacy-policy")({
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <PageLayout>
      <header className={styles.header}>
        <h1 className={styles.heading}>Privacy Policy</h1>
        <p className={styles.lastUpdate}>Last update: May 10, 2026</p>
      </header>

      <p className={styles.body}>This Privacy Policy describes how trenuj.se ("we", "us") collects, uses, and shares personal data when you use the service.</p>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>1. Data controller</h2>
        <p className={styles.body}>
          The operator of trenuj.se is the data controller for personal data processed through this service. For privacy inquiries, contact{" "}
          <a className={styles.link} href="mailto:help@trenuj.se">
            help@trenuj.se
          </a>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>2. Personal data we collect</h2>
        <p className={styles.body}>We collect and process the following categories of personal data:</p>
        <ul className={styles.list}>
          <li className={styles.body}>
            <strong className={styles.term}>Account data</strong> — email address, hashed password, and (optionally) the name you provide on registration.
          </li>
          <li className={styles.body}>
            <strong className={styles.term}>Training data</strong> — plans, phases, workouts, completion status, and notes you create within the service.
          </li>
          <li className={styles.body}>
            <strong className={styles.term}>Strava data</strong> (only if you connect Strava) — OAuth refresh token, Strava athlete identifier, and activity metadata (sport type,
            date, duration, distance, and similar metrics) for activities recorded on Strava.
          </li>
        </ul>
        <p className={styles.body}>We do not collect special categories of personal data, and we do not run third-party analytics, advertising, or behavioral tracking.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>3. Purposes of processing</h2>
        <p className={styles.body}>We use your personal data to:</p>
        <ul className={styles.list}>
          <li className={styles.body}>provide and operate the service (display your plans, sync activities, and let you share plans with recipients you nominate);</li>
          <li className={styles.body}>maintain account security and prevent abuse;</li>
          <li className={styles.body}>communicate with you about your account, when necessary.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>4. Subprocessors</h2>
        <p className={styles.body}>We rely on the following subprocessors to operate the service:</p>
        <ul className={styles.list}>
          <li className={styles.body}>
            <strong className={styles.term}>Supabase Inc.</strong> (United States) — authentication, transactional auth emails, and PostgreSQL database hosting. Your password is
            hashed and stored by Supabase and is not visible to us in plaintext.
          </li>
          <li className={styles.body}>
            <strong className={styles.term}>Cloudflare, Inc.</strong> (United States) — edge hosting (Cloudflare Pages and Workers) and content delivery.
          </li>
          <li className={styles.body}>
            <strong className={styles.term}>Strava, Inc.</strong> (United States) — third-party integration. Activated only with your explicit consent. When connected, activity
            data flows between Strava and trenuj.se on your behalf. You can revoke this access at any time from Settings.
          </li>
        </ul>
        <p className={styles.body}>
          These subprocessors process personal data outside the European Economic Area. Where applicable, transfers are protected by Standard Contractual Clauses or equivalent
          safeguards.
        </p>
        <p className={styles.body}>We do not sell or rent your personal data, and we do not share it with third parties beyond the subprocessors listed above.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>5. Cookies and local storage</h2>
        <p className={styles.body}>
          We use strictly necessary cookies and browser storage (localStorage, IndexedDB) to keep you signed in and to cache your data for offline use. We do not use cookies for
          analytics, advertising, or behavioral tracking.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>6. Data retention</h2>
        <p className={styles.body}>
          We retain your personal data for as long as your account is active. Upon account deletion, personal data is removed from our active systems and from backups in line with
          our standard backup rotation.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>7. Your rights</h2>
        <p className={styles.body}>
          Subject to applicable law, you have the right to access, rectify, erase, restrict processing of, port, and object to the processing of your personal data, and to lodge a
          complaint with a supervisory authority. To exercise any of these rights, contact{" "}
          <a className={styles.link} href="mailto:help@trenuj.se">
            help@trenuj.se
          </a>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>8. Changes to this policy</h2>
        <p className={styles.body}>
          We may update this Privacy Policy from time to time. The effective date is shown at the top of this page. Material changes will be communicated through the service.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>9. Contact</h2>
        <p className={styles.body}>
          For questions about this Privacy Policy or our data practices, contact{" "}
          <a className={styles.link} href="mailto:help@trenuj.se">
            help@trenuj.se
          </a>
          .
        </p>
      </section>
    </PageLayout>
  );
}
