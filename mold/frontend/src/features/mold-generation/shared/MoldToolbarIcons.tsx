import type { ReactNode } from "react";

import styles from "./MoldToolbar.module.css";

/**
 * Neutral icon module shared across the mold-generation toolbars
 * (SplitFaceControls, CuttingSessionPanel). Owned by no
 * single feature. Icons used by only one toolbar (e.g. SplitFaceControls'
 * Minus/Plus/SplitMold) stay defined locally in that component -- only the
 * genuinely shared set lives here.
 */

interface ToolbarIconProps {
  readonly children: ReactNode;
}

export function ToolbarIcon({ children }: ToolbarIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={styles.icon}
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      {children}
    </svg>
  );
}

export function ConstructIcon() {
  return (
    <svg
      aria-hidden="true"
      className={`${styles.icon} ${styles.commandIcon}`}
      fill="none"
      viewBox="0 0 28 24"
    >
      <path
        d="M4.5 5.5 10.5 2v15.8l-6 3.5V5.5Z"
        fill="#4fb879"
        stroke="#d8f5e4"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />

      <path
        d="m4.5 5.5 6 2.5v9.8l-6 3.5"
        fill="#3c9462"
        stroke="#d8f5e4"
        strokeLinejoin="round"
        strokeWidth="1"
      />

      <path
        d="M17.5 6.2 23.5 2.7v15.8l-6 3.5V6.2Z"
        fill="#ed9a54"
        stroke="#ffe5cb"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />

      <path
        d="m17.5 6.2 6 2.5v9.8l-6 3.5"
        fill="#c97838"
        stroke="#ffe5cb"
        strokeLinejoin="round"
        strokeWidth="1"
      />

      <path
        d="M11.8 7.5h4.4M11.8 12h4.4M11.8 16.5h4.4"
        stroke="#bac8d8"
        strokeDasharray="1.5 1.5"
        strokeLinecap="round"
        strokeWidth="1"
      />
    </svg>
  );
}

export function PointerIcon() {
  return (
    <ToolbarIcon>
      <path
        d="M6 4.5 18.2 13l-6.1 1.2-3.2 5.3L6 4.5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </ToolbarIcon>
  );
}

export function EraserIcon() {
  return (
    <ToolbarIcon>
      <path
        d="m8.2 18.2-3.4-3.4a2 2 0 0 1 0-2.8l7.4-7.4a2 2 0 0 1 2.8 0l4.4 4.4a2 2 0 0 1 0 2.8l-6.4 6.4H8.2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="m9.5 8.5 6 6M12.8 18.2H20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </ToolbarIcon>
  );
}

export function FlipIcon() {
  return (
    <ToolbarIcon>
      <path
        d="M8 8.5h8v7H8z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M6 6.5c1.5-2.7 4.9-3.8 7.7-2.4 1.1.5 2 1.4 2.6 2.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="m14.4 5.2 2.2 1.5.8-2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </ToolbarIcon>
  );
}

/** A 2D envelope with a single outward arrow: resize the reference mold, not the part. */
export function MoldScaleIcon() {
  return (
    <ToolbarIcon>
      <path d="M5.5 5.5h8v8h-8z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.55" />
      <path d="M13 11 19 5m-4 0h4v4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.55" />
    </ToolbarIcon>
  );
}

export function SprueIcon() {
  return (
    <ToolbarIcon>
      <path
        d="M7 5.5h10l-3 5v7a2 2 0 0 1-4 0v-7l-3-5Z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M8.5 8h7M10 12h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
    </ToolbarIcon>
  );
}

export function MinusIcon() {
  return (
    <ToolbarIcon>
      <path
        d="M6 12h12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </ToolbarIcon>
  );
}

export function PlusIcon() {
  return (
    <ToolbarIcon>
      <path
        d="M12 6v12M6 12h12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </ToolbarIcon>
  );
}

export function UndoIcon() {
  return (
    <ToolbarIcon>
      <path
        d="M9 7 5 11l4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M6 11h7a5 5 0 0 1 5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </ToolbarIcon>
  );
}

export function RedoIcon() {
  return (
    <ToolbarIcon>
      <path
        d="m15 7 4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M18 11h-7a5 5 0 0 0-5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </ToolbarIcon>
  );
}

// Partitioning uses a wider 30x24 viewBox (not the 24x24 ToolbarIcon
// wrapper), so its rendered size is set explicitly via the svg's own
// width/height attributes rather than the generic .icon class.

export function CutByFaceIcon() {
  return (
    <ToolbarIcon>
      <path
        d="M5 8.5 12 5l7 3.5-7 3.5-7-3.5Z"
        fill="currentColor"
        fillOpacity="0.32"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path
        d="M5 8.5v7l7 3.5v-7L5 8.5ZM19 8.5v7l-7 3.5v-7l7-3.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </ToolbarIcon>
  );
}

export function SegmentationIcon() {
  return (
    <ToolbarIcon>
      <path
        d="M5 8.5 12 5l7 3.5v7L12 19l-7-3.5v-7Z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path
        d="M5 8.5 12 12l7-3.5M12 12v7"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
    </ToolbarIcon>
  );
}

export function DoneIcon() {
  return (
    <ToolbarIcon>
      <path
        d="m5 12.5 4.5 4.5L19 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </ToolbarIcon>
  );
}

export function CancelIcon() {
  return (
    <ToolbarIcon>
      <path
        d="M7 7l10 10M17 7 7 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </ToolbarIcon>
  );
}
