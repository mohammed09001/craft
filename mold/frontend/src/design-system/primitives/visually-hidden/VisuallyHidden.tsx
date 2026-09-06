import type { ReactNode } from "react";

import styles from "@/design-system/primitives/visually-hidden/VisuallyHidden.module.css";

type VisuallyHiddenProps = {
  children: ReactNode;
};

export function VisuallyHidden({ children }: VisuallyHiddenProps) {
  return <span className={styles.hidden}>{children}</span>;
}
