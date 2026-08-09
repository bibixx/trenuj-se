import { Link } from "@tanstack/react-router";
import { useAuth } from "../../../lib/auth.ts";
import { Button } from "../../primitives/Button/Button.tsx";
import { Card } from "../../primitives/Card/Card.tsx";
import styles from "./ShareCta.module.css";

/** Sign-up band shown to logged-out visitors at the end of a shared plan. */
export function ShareCta() {
  const { user, loading } = useAuth();
  if (loading || user) return null;

  return (
    <Card className={styles.root}>
      <p className={styles.text}>Plan your own training with trenuj.se</p>
      <Button size="sm" nativeButton={false} render={<Link to="/signup" />}>
        Sign up
      </Button>
    </Card>
  );
}
