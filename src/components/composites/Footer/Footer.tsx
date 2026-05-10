import { Link } from "@tanstack/react-router";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.root}>
      <span className={styles.copy}>
        ©{" "}
        <a className={styles.link} href="https://legiec.io" target="_blank" rel="noopener noreferrer">
          bibixx
        </a>
      </span>
      <span className={styles.separator} aria-hidden="true">
        •
      </span>
      <Link className={styles.link} to="/privacy-policy">
        Privacy Policy
      </Link>
      <span className={styles.separator} aria-hidden="true">
        •
      </span>
      <Link className={styles.link} to="/help">
        Help
      </Link>
    </footer>
  );
}
