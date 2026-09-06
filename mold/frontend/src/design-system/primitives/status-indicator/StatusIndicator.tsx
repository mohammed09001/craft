import type { StatusTone } from "@/contracts/status.contract";

import styles from "@/design-system/primitives/status-indicator/StatusIndicator.module.css";

type StatusIndicatorProps = {
  tone: StatusTone;
};

export function StatusIndicator({ tone }: StatusIndicatorProps) {
  return <span aria-hidden="true" className={styles[tone]} />;
}
