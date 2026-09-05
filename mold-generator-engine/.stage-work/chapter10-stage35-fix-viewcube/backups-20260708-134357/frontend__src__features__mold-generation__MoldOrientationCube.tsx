import "./MoldOrientationCube.css";

export type MoldOrientationCubeConfidence = "none" | "low" | "medium" | "high";

export interface MoldOrientationCubeProps {
  readonly pullLabel?: string;
  readonly oppositePullLabel?: string;
  readonly m1Label?: string;
  readonly m2Label?: string;
  readonly topLabel?: string;
  readonly bottomLabel?: string;
  readonly confidence?: MoldOrientationCubeConfidence;
  readonly requiresManualReview?: boolean;
}

const getConfidenceLabel = (
  confidence: MoldOrientationCubeConfidence | undefined,
  requiresManualReview: boolean | undefined,
): string => {
  if (requiresManualReview) {
    return "Review";
  }

  if (!confidence || confidence === "none") {
    return "Fallback";
  }

  if (confidence === "high") {
    return "Ready";
  }

  return confidence;
};

export function MoldOrientationCube({
  pullLabel = "Pull+",
  oppositePullLabel = "Pull-",
  m1Label = "M1",
  m2Label = "M2",
  topLabel = "Top",
  bottomLabel = "Bottom",
  confidence = "none",
  requiresManualReview = true,
}: MoldOrientationCubeProps) {
  const statusLabel = getConfidenceLabel(confidence, requiresManualReview);

  return (
    <aside
      className="mold-orientation-cube"
      aria-label="Mold orientation cube"
      data-confidence={confidence}
      data-review={requiresManualReview ? "true" : "false"}
    >
      <div className="mold-orientation-cube__scene" aria-hidden="true">
        <div className="mold-orientation-cube__cube">
          <div className="mold-orientation-cube__face mold-orientation-cube__face--top">
            {topLabel}
          </div>
          <div className="mold-orientation-cube__face mold-orientation-cube__face--front">
            {pullLabel}
          </div>
          <div className="mold-orientation-cube__face mold-orientation-cube__face--right">
            {m1Label}
          </div>
        </div>

        <div className="mold-orientation-cube__axis mold-orientation-cube__axis--pull">
          <span>{oppositePullLabel}</span>
          <strong>{pullLabel}</strong>
        </div>

        <div className="mold-orientation-cube__axis mold-orientation-cube__axis--split">
          <span>{m2Label}</span>
          <strong>{m1Label}</strong>
        </div>

        <div className="mold-orientation-cube__axis mold-orientation-cube__axis--vertical">
          <span>{bottomLabel}</span>
          <strong>{topLabel}</strong>
        </div>
      </div>

      <div className="mold-orientation-cube__caption">
        <span className="mold-orientation-cube__title">Mold axes</span>
        <span className="mold-orientation-cube__status">{statusLabel}</span>
      </div>
    </aside>
  );
}
