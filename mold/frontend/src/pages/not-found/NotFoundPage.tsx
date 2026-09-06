import { Link } from "react-router-dom";

import { APP_ROUTES } from "@/app/router/routes";

import styles from "@/pages/not-found/NotFoundPage.module.css";

export function NotFoundPage() {
  return (
    <section className={styles.page} aria-labelledby="not-found-title">
      <div className={styles.panel}>
        <p className={styles.eyebrow}>Route unavailable</p>
        <h1 className={styles.title} id="not-found-title">
          Page not found
        </h1>
        <p className={styles.description}>
          This route is not part of the Stage 1 shell.
        </p>
        <Link className={styles.link} to={APP_ROUTES.workspace.path}>
          Return to workspace
        </Link>
      </div>
    </section>
  );
}
