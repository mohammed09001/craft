import { useCallback } from "react";

import { Viewport, type ViewportStatus } from "@/features/viewport";
import { useViewportStatusActions } from "@/state/ui-shell";

import styles from "@/pages/workspace/WorkspacePage.module.css";

export function WorkspacePage() {
  const { setViewportStatus } = useViewportStatusActions();
  const handleViewportStatusChange = useCallback(
    (status: ViewportStatus) => {
      setViewportStatus(status);
    },
    [setViewportStatus],
  );

  return (
    <section className={styles.page} aria-label="Engineering viewport">
      <Viewport onStatusChange={handleViewportStatusChange} />
    </section>
  );
}
