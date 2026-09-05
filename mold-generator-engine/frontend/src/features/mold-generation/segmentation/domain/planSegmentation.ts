import {
  evaluatePrintableSize,
  sizeOfBounds,
  type FitAxis,
  type Size3,
} from "../fitAnalysis";
import type {
  SegmentationAlgorithm,
  SegmentationContext,
  SegmentationIssue,
  SegmentationModeStrategy,
  SegmentationPlan,
  SegmentationRequest,
  SegmentationResult,
  SegmentationSourceSnapshot,
  SegmentationValidation,
  SplitCandidate,
} from "./segmentation.contracts";
import { deterministicSegmentationId } from "./segmentationIdentity";

const AXES: readonly FitAxis[] = ["x", "y", "z"];

function validSize(size: Size3): boolean {
  return AXES.every(
    (axis) => Number.isFinite(size[axis]) && size[axis] > 0,
  );
}

function compareCandidates(
  left: SplitCandidate,
  right: SplitCandidate,
): number {
  return (
    left.score.hardFailureCount - right.score.hardFailureCount ||
    left.score.weightedObjectiveScore - right.score.weightedObjectiveScore ||
    left.score.segmentCount - right.score.segmentCount ||
    right.score.minimumPrintableMarginMm -
      left.score.minimumPrintableMarginMm ||
    left.score.declaredRisk - right.score.declaredRisk ||
    left.id.localeCompare(right.id)
  );
}

function validation(
  request: SegmentationRequest,
  issues: readonly SegmentationIssue[],
  input: {
    readonly printableByBounds:
      | "verified"
      | "failed"
      | "not-applicable";
    readonly geometryExecution: "not-run" | "verified" | "failed";
    readonly manufacturingSafety:
      | "not-established"
      | "verified"
      | "failed"
      | "not-applicable";
  },
): SegmentationValidation {
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  return {
    status: blockers.length === 0 ? "planning-valid" : "invalid",
    stage: "result-validation",
    sourceRevision: request.source.documentRevision,
    sourceFingerprint: request.source.documentFingerprint,
    ...input,
    warnings: issues.filter((issue) => issue.severity === "warning"),
    blockers,
  };
}

export function planSegmentation(input: {
  readonly request: SegmentationRequest;
  readonly source: SegmentationSourceSnapshot;
  readonly algorithm: SegmentationAlgorithm;
  readonly strategy: SegmentationModeStrategy;
}): SegmentationResult {
  const { request, source, algorithm, strategy } = input;
  const sourceSize = sizeOfBounds(source.aggregateBounds);
  if (
    sourceSize === null ||
    !validSize(sourceSize) ||
    !validSize(request.printerVolume)
  ) {
    return {
      status: "failed",
      stage: "printable-volume-analysis",
      reasonCode: "invalid_printer_volume",
      request,
      issues: [
        {
          severity: "blocker",
          reasonCode: "invalid_printer_volume",
          message: "Printer volume and authoritative mold bounds must be finite and positive.",
        },
      ],
    };
  }

  const printableFit = evaluatePrintableSize(
    sourceSize,
    request.printerVolume,
  );
  const printerForcedAxes: readonly FitAxis[] =
    printableFit.status === "DOES_NOT_FIT" ? printableFit.failingAxes : [];
  // Printer dimensions are not the only segmentation driver: a strategy that
  // wants section-driven planning (e.g. More Molds Automatic) may identify
  // logical sections worth segmenting even when the mold already fits the
  // printer on its own. One Mold never opts in, so its behavior is
  // unchanged from before this axis was added.
  const logicalSectionCounts: Readonly<Partial<Record<FitAxis, number>>> =
    strategy.considerSectionDrivenSegmentation
      ? (algorithm.identifyLogicalSections?.(sourceSize, printerForcedAxes) ??
        {})
      : {};
  const requiredAxes = AXES.filter(
    (axis) =>
      printerForcedAxes.includes(axis) || logicalSectionCounts[axis] !== undefined,
  );
  if (requiredAxes.length === 0) {
    return {
      status: "not-required",
      request,
      validation: validation(request, source.warnings, {
        printableByBounds: "verified",
        geometryExecution: "not-run",
        manufacturingSafety: "not-applicable",
      }),
    };
  }

  // Per-axis count is the larger of what printer-fit forces and what
  // logical sectioning suggests -- so printer-fit subdivision automatically
  // "wins" (and further subdivides) whenever a logical section would still
  // be too large to print, without a separate iterative re-planning pass.
  const perAxisSegmentCount = Object.fromEntries(
    AXES.map((axis) => [
      axis,
      Math.max(
        1,
        Math.ceil(sourceSize[axis] / request.printerVolume[axis]),
        logicalSectionCounts[axis] ?? 1,
      ),
    ]),
  ) as Readonly<Record<FitAxis, number>>;
  const estimatedMinimumSegmentCount =
    perAxisSegmentCount.x *
    perAxisSegmentCount.y *
    perAxisSegmentCount.z;
  const context: SegmentationContext = {
    request,
    source,
    sourceSize,
    printableFit,
    requiredAxes,
    perAxisSegmentCount,
    estimatedMinimumSegmentCount,
    protectedRegions: source.protectedRegions,
  };

  const candidates = algorithm
    .generateCandidates(context)
    .map((candidate) => algorithm.evaluateCandidate(candidate, context))
    .map((candidate) => strategy.adjustCandidate(candidate, context))
    .sort(compareCandidates);
  const feasible = candidates.filter(
    (candidate) => candidate.score.hardFailureCount === 0,
  );
  const selected = feasible[0];
  if (selected === undefined) {
    const issues = candidates.flatMap((candidate) => candidate.issues);
    return {
      status: "failed",
      stage: "plan-selection",
      reasonCode: "no_printable_plan",
      request,
      issues:
        issues.length > 0
          ? issues
          : [
              {
                severity: "blocker",
                reasonCode: "no_printable_plan",
                message: "The segmentation algorithm produced no feasible candidates.",
              },
            ],
    };
  }

  const baseValidation = validation(request, [
    ...source.warnings,
    ...selected.issues,
  ], {
    printableByBounds: "verified",
    geometryExecution: "not-run",
    manufacturingSafety:
      source.protectedRegionEvidence.status === "complete" &&
      !selected.issues.some(
        (issue) => issue.reasonCode === "protected_region_conflict",
      )
        ? "verified"
        : "not-established",
  });
  const planSeed = {
    requestId: request.requestId,
    algorithmId: algorithm.id,
    algorithmVersion: algorithm.version,
    planningBasis: algorithm.planningBasis,
    selectedCandidateId: selected.id,
    boundaryIds: selected.boundaries.map((boundary) => boundary.id),
    segmentIds: selected.segments.map((segment) => segment.id),
  };
  const provisionalPlan: SegmentationPlan = {
    schemaVersion: 1,
    id: deterministicSegmentationId("segmentation-plan", planSeed),
    request,
    algorithmId: algorithm.id,
    algorithmVersion: algorithm.version,
    planningBasis: algorithm.planningBasis,
    requiredAxes,
    perAxisSegmentCount,
    estimatedMinimumSegmentCount,
    candidateIds: candidates.map((candidate) => candidate.id),
    rejectedCandidateIds: candidates
      .filter((candidate) => candidate.id !== selected.id)
      .map((candidate) => candidate.id),
    selectedCandidateId: selected.id,
    boundaries: selected.boundaries,
    segments: selected.segments,
    score: selected.score,
    validation: baseValidation,
    extensionObligations: [],
  };
  const extension = strategy.createExtensionOutput(provisionalPlan);
  const plan = {
    ...provisionalPlan,
    extensionObligations: extension.obligations,
  };
  const strategyIssues = strategy.validatePlan(plan, context);
  const finalValidation = validation(request, [
    ...baseValidation.warnings,
    ...baseValidation.blockers,
    ...strategyIssues,
  ], {
    printableByBounds: baseValidation.printableByBounds,
    geometryExecution: baseValidation.geometryExecution,
    manufacturingSafety:
      strategyIssues.some((issue) => issue.severity === "blocker")
        ? "failed"
        : baseValidation.manufacturingSafety,
  });
  if (finalValidation.status === "invalid") {
    return {
      status: "failed",
      stage: "result-validation",
      reasonCode:
        finalValidation.blockers[0]?.reasonCode ?? "no_printable_plan",
      request,
      issues: [
        ...finalValidation.warnings,
        ...finalValidation.blockers,
      ],
    };
  }

  return {
    status: "planned",
    request,
    plan: { ...plan, validation: finalValidation },
    extension,
  };
}
