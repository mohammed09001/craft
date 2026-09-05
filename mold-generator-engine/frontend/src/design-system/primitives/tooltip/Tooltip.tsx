import type { ReactNode } from "react";

import styles from "@/design-system/primitives/tooltip/Tooltip.module.css";

type TooltipProps = {
  text: string;
  children: ReactNode;
};

export function Tooltip({ text, children }: TooltipProps) {
  return (
    <span className={styles.root}>
      {children}
      <span className={styles.tooltip} role="tooltip">
        {text}
      </span>
    </span>
  );
}
