/**
 * Pure, deterministic fit-analysis comparison. Consumes already-established
 * bounds and a printer volume; performs no geometry computation of its own
 * and has no store/runtime dependency, so it stays independently testable.
 */

export type FitAxis = "x" | "y" | "z";

const AXES: readonly FitAxis[] = ["x", "y", "z"];

export type Size3 = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type Bounds3Like = {
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
};

export type FitStageResult =
  | { readonly status: "NOT_APPLICABLE" }
  | { readonly status: "FITS"; readonly axisFit: Readonly<Record<FitAxis, boolean>> }
  | {
      readonly status: "DOES_NOT_FIT";
      readonly axisFit: Readonly<Record<FitAxis, boolean>>;
      readonly failingAxes: readonly FitAxis[];
    };

export type FitAnalysisResult =
  | {
      readonly overall: "NOT_EVALUATED";
      readonly reason: "no_printer_volume" | "no_model_bounds" | "degenerate_bounds";
    }
  | {
      readonly overall: "FITS" | "DOES_NOT_FIT";
      readonly modelStage: FitStageResult;
      readonly moldStage: FitStageResult;
    };

export function sizeOfBounds(bounds: Bounds3Like | null): Size3 | null {
  if (bounds === null) return null;
  return {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
}

function isDegenerate(size: Size3): boolean {
  return (
    !Number.isFinite(size.x) ||
    !Number.isFinite(size.y) ||
    !Number.isFinite(size.z) ||
    size.x <= 0 ||
    size.y <= 0 ||
    size.z <= 0
  );
}

export function evaluatePrintableSize(
  size: Size3,
  printerVolume: Size3,
): FitStageResult {
  const axisFit: Record<FitAxis, boolean> = {
    x: size.x <= printerVolume.x,
    y: size.y <= printerVolume.y,
    z: size.z <= printerVolume.z,
  };
  const failingAxes = AXES.filter((axis) => !axisFit[axis]);
  return failingAxes.length === 0
    ? { status: "FITS", axisFit }
    : { status: "DOES_NOT_FIT", axisFit, failingAxes };
}

export function evaluateFitAnalysis(input: {
  readonly printerVolume: Size3 | null;
  readonly modelSize: Size3 | null;
  readonly moldEnvelopeSize: Size3 | null;
}): FitAnalysisResult {
  const { printerVolume, modelSize, moldEnvelopeSize } = input;

  if (printerVolume === null) {
    return { overall: "NOT_EVALUATED", reason: "no_printer_volume" };
  }
  if (modelSize === null) {
    return { overall: "NOT_EVALUATED", reason: "no_model_bounds" };
  }
  if (isDegenerate(modelSize) || (moldEnvelopeSize !== null && isDegenerate(moldEnvelopeSize))) {
    return { overall: "NOT_EVALUATED", reason: "degenerate_bounds" };
  }

  const modelStage = evaluatePrintableSize(modelSize, printerVolume);
  const moldStage: FitStageResult =
    moldEnvelopeSize === null
      ? { status: "NOT_APPLICABLE" }
      : evaluatePrintableSize(moldEnvelopeSize, printerVolume);

  const overall: "FITS" | "DOES_NOT_FIT" =
    modelStage.status !== "DOES_NOT_FIT" && moldStage.status !== "DOES_NOT_FIT"
      ? "FITS"
      : "DOES_NOT_FIT";

  return { overall, modelStage, moldStage };
}
