import type {
  PullDirectionCandidate,  PullDirectionReport,
  PullDirectionReportStatus,
  PullDirectionReportWarning,
  PullDirectionVector3,
} from "../../features/engineering-reports/pull-direction";

type PullDirectionMvpStatus = "Good" | "Review" | "Poor";

type PullDirectionCardProps = Readonly<{
  report?: PullDirectionReport | null;
}>;

export function PullDirectionCard({ report = null }: PullDirectionCardProps) {
  const status = report?.status ?? "not_analyzed";
  const bestCandidate = report?.bestCandidate ?? null;
  const candidateCount = report?.statistics.evaluatedDirectionsCount ?? 0;
  const confidence = bestCandidate?.confidence ?? null;
  const mvpStatus = resolveMvpStatus(status, bestCandidate);
  const warnings = report?.warnings ?? [];

  return (
    <section className="context-panel-card" aria-label="Pull Direction">
      <header className="context-panel-card__header">
        <h3>Pull Direction</h3>
        <span>{mvpStatus}</span>
      </header>

      <dl className="context-panel-card__details">
        <div>
          <dt>Result</dt>
          <dd>{mvpStatus}</dd>
        </div>

        <div>
          <dt>Best Direction</dt>
          <dd>{formatBestDirection(bestCandidate)}</dd>
        </div>

        <div>
          <dt>Confidence</dt>
          <dd>{formatConfidence(confidence)}</dd>
        </div>

        <div>
          <dt>Candidates</dt>
          <dd>{candidateCount}</dd>
        </div>
      </dl>

      {warnings.length > 0 ? (
        <ul aria-label="Pull direction warnings">
          {warnings.map((warning) => (
            <li key={`${warning.code}:${warning.message}`}>
              {formatWarning(warning)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function resolveMvpStatus(
  reportStatus: PullDirectionReportStatus,
  bestCandidate: PullDirectionCandidate | null,
): PullDirectionMvpStatus {
  if (reportStatus === "failed") {
    return "Poor";
  }

  if (bestCandidate == null) {
    return reportStatus === "not_analyzed" || reportStatus === "waiting_for_analysis"
      ? "Review"
      : "Poor";
  }

  const confidence = bestCandidate.confidence ?? 0;
  const confidencePercent = confidence <= 1 ? confidence * 100 : confidence;

  if (
    confidencePercent >= 82 ||
    bestCandidate.quality === "excellent" ||
    bestCandidate.quality === "good"
  ) {
    return "Good";
  }

  if (
    confidencePercent >= 55 ||
    bestCandidate.quality === "acceptable" ||
    bestCandidate.validation.state === "warning"
  ) {
    return "Review";
  }

  return "Poor";
}

function formatBestDirection(
  bestCandidate: PullDirectionCandidate | null,
): string {
  if (bestCandidate == null) {
    return "Not available";
  }

  const axisLabel = formatAxisDirection(bestCandidate.direction);

  if (axisLabel !== null) {
    return axisLabel;
  }

  return formatVector(bestCandidate.direction);
}

function formatAxisDirection(direction: PullDirectionVector3): string | null {
  const components = [
    { axis: "X", value: direction.x },
    { axis: "Y", value: direction.y },
    { axis: "Z", value: direction.z },
  ];

  const dominant = components.reduce((current, next) =>
    Math.abs(next.value) > Math.abs(current.value) ? next : current,
  );

  const otherComponents = components.filter(
    (component) => component.axis !== dominant.axis,
  );

  const isAxisAligned =
    Math.abs(dominant.value) >= 0.9 &&
    otherComponents.every((component) => Math.abs(component.value) <= 0.1);

  if (!isAxisAligned) {
    return null;
  }

  return `${dominant.value >= 0 ? "+" : "-"}${dominant.axis}`;
}

function formatVector(direction: PullDirectionVector3): string {
  return `(${formatNumber(direction.x)}, ${formatNumber(direction.y)}, ${formatNumber(direction.z)})`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toFixed(2);
}

function formatConfidence(confidence: number | null): string {
  if (confidence == null) {
    return "Not available";
  }

  const confidencePercent = confidence <= 1 ? confidence * 100 : confidence;

  return `${Math.round(confidencePercent)}%`;
}

function formatWarning(warning: PullDirectionReportWarning): string {
  return warning.message;
}

