import type { ReactNode } from "react";

import styles from "@/systems/engineering-workspace/EngineeringWorkspace.module.css";

type EngineeringWorkspaceProps = {
  children: ReactNode;
};

export const ENGINEERING_WORKSPACE_ID = "engineering-workspace";

export function EngineeringWorkspace({ children }: EngineeringWorkspaceProps) {
  return (
    <main
      aria-label="Engineering workspace"
      className={styles.workspace}
      id={ENGINEERING_WORKSPACE_ID}
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
