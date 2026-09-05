import { useEffect, useState } from "react";

import { MoldOrientationCube } from "./MoldOrientationCube";
import "./MoldGenerationSketchOverlay.css";

export type MoldGenerationSketchOverlayMode = "ready" | "warning" | "idle";

export type MoldGenerationSketchOverlayProps = {
  mode?: MoldGenerationSketchOverlayMode;
};

type OverlayPlacement = {
  visible: boolean;
  leftPercent: number;
  topPercent: number;
  scale: number;
  side: "right" | "left";
};

const overlayCopy: Record<
  MoldGenerationSketchOverlayMode,
  {
    label: string;
    note: string;
  }
> = {
  ready: {
    label: "Ready",
    note: "Ready to move",
  },
  warning: {
    label: "Warning",
    note: "Can continue",
  },
  idle: {
    label: "",
    note: "",
  },
};

const hiddenPlacement: OverlayPlacement = {
  visible: false,
  leftPercent: 62,
  topPercent: 22,
  scale: 1,
  side: "right",
};

function pageHasLoadedModel() {
  const bodyText = document.body.innerText;

  if (bodyText.includes("No model loaded")) {
    return false;
  }

  if (bodyText.includes("Model Ready:")) {
    return true;
  }

  if (
    bodyText.includes("Status") &&
    bodyText.includes("Ready") &&
    bodyText.includes("Triangles")
  ) {
    return true;
  }

  return false;
}

function getViewerRect() {
  const canvas = document.querySelector("canvas");

  if (canvas) {
    return canvas.getBoundingClientRect();
  }

  const possibleViewer = document.querySelector(
    '[data-testid*="viewer"], [class*="viewer"], [class*="viewport"], main',
  );

  if (possibleViewer instanceof HTMLElement) {
    return possibleViewer.getBoundingClientRect();
  }

  return null;
}

function computePlacement(): OverlayPlacement {
  if (!pageHasLoadedModel()) {
    return hiddenPlacement;
  }

  const rect = getViewerRect();

  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return hiddenPlacement;
  }

  const viewportWidth = window.innerWidth || 1;
  const viewportHeight = window.innerHeight || 1;

  const viewerLeftPercent = (rect.left / viewportWidth) * 100;
  const viewerTopPercent = (rect.top / viewportHeight) * 100;
  const viewerWidthPercent = (rect.width / viewportWidth) * 100;
  const viewerHeightPercent = (rect.height / viewportHeight) * 100;

  /*
    Stage 2N-E2:
    Keep the red callout outside the model visual area.
    The annotation is intentionally placed near the outer right boundary
    of the visible model zone. The arrow no longer crosses the part.
  */
  const isWideViewer = rect.width > rect.height * 1.3;
  const isCompactViewer = rect.width < 980;

  const leftPercent =
    viewerLeftPercent +
    viewerWidthPercent * (isCompactViewer ? 0.69 : isWideViewer ? 0.66 : 0.68);

  const topPercent =
    viewerTopPercent +
    viewerHeightPercent * (isWideViewer ? 0.23 : 0.20);

  const scale = Math.max(0.72, Math.min(1.08, rect.width / 1380));

  return {
    visible: true,
    leftPercent,
    topPercent,
    scale,
    side: "right",
  };
}

export function MoldGenerationSketchOverlay({
  mode = "ready",
}: MoldGenerationSketchOverlayProps) {
  const copy = overlayCopy[mode];
  const [placement, setPlacement] = useState<OverlayPlacement>(hiddenPlacement);

  useEffect(() => {
    if (mode === "idle") {
      setPlacement(hiddenPlacement);
      return;
    }

    let frameId = 0;

    const update = () => {
      setPlacement(computePlacement());
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(update);
    };

    update();

    const intervalId = window.setInterval(update, 220);

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("pointerdown", scheduleUpdate);
    window.addEventListener("pointermove", scheduleUpdate);
    window.addEventListener("pointerup", scheduleUpdate);
    window.addEventListener("wheel", scheduleUpdate, { passive: true });

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("pointerdown", scheduleUpdate);
      window.removeEventListener("pointermove", scheduleUpdate);
      window.removeEventListener("pointerup", scheduleUpdate);
      window.removeEventListener("wheel", scheduleUpdate);
      observer.disconnect();
    };
  }, [mode]);

  if (mode === "idle" || !placement.visible) {
    return null;
  }

  return (
    <div
      className={`mold-generation-sketch-overlay mold-generation-sketch-overlay--${mode} mold-generation-sketch-overlay--${placement.side}`}
      aria-label={`Mold generation ${copy.note}`}
      data-testid="mold-generation-sketch-overlay"
      style={
        {
          "--mold-overlay-left": `${placement.leftPercent}%`,
          "--mold-overlay-top": `${placement.topPercent}%`,
          "--mold-overlay-scale": placement.scale,
        } as React.CSSProperties
      }
    >
      <MoldOrientationCube
        confidence="low"
        requiresManualReview={true}
      />
      <div className="mold-generation-sketch-overlay__text">
        <span className="mold-generation-sketch-overlay__label">
          {copy.label}
        </span>
        <span className="mold-generation-sketch-overlay__note">
          {copy.note}
        </span>
      </div>

      <svg
        className="mold-generation-sketch-overlay__arrow"
        viewBox="0 0 300 190"
        role="img"
        aria-hidden="true"
      >
        <path
          className="mold-generation-sketch-overlay__arrow-line"
          d="M 34 142 C 72 116, 112 98, 156 92 C 194 86, 220 64, 247 38"
        />
        <path
          className="mold-generation-sketch-overlay__arrow-head"
          d="M 222 41 L 250 36 L 242 64"
        />
      </svg>
    </div>
  );
}

