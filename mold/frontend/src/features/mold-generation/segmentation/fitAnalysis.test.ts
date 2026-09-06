import {
  evaluateFitAnalysis,
  evaluatePrintableSize,
  sizeOfBounds,
} from "@/features/mold-generation/segmentation/fitAnalysis";

describe("fit analysis derivation", () => {
  it("is NOT_EVALUATED when the printer volume has not been entered", () => {
    expect(
      evaluateFitAnalysis({ printerVolume: null, modelSize: { x: 10, y: 10, z: 10 }, moldEnvelopeSize: null }),
    ).toEqual({ overall: "NOT_EVALUATED", reason: "no_printer_volume" });
  });

  it("is NOT_EVALUATED when no model bounds are available", () => {
    expect(
      evaluateFitAnalysis({ printerVolume: { x: 200, y: 200, z: 200 }, modelSize: null, moldEnvelopeSize: null }),
    ).toEqual({ overall: "NOT_EVALUATED", reason: "no_model_bounds" });
  });

  it("is NOT_EVALUATED for degenerate (zero/negative) bounds", () => {
    expect(
      evaluateFitAnalysis({
        printerVolume: { x: 200, y: 200, z: 200 },
        modelSize: { x: 0, y: 10, z: 10 },
        moldEnvelopeSize: null,
      }),
    ).toEqual({ overall: "NOT_EVALUATED", reason: "degenerate_bounds" });
  });

  it("FITS when the model is within the printer volume and no mold envelope exists yet", () => {
    const result = evaluateFitAnalysis({
      printerVolume: { x: 200, y: 200, z: 200 },
      modelSize: { x: 150, y: 150, z: 150 },
      moldEnvelopeSize: null,
    });
    expect(result.overall).toBe("FITS");
    if (result.overall !== "NOT_EVALUATED") {
      expect(result.modelStage).toEqual({ status: "FITS", axisFit: { x: true, y: true, z: true } });
      expect(result.moldStage).toEqual({ status: "NOT_APPLICABLE" });
    }
  });

  it("treats an exact-fit dimension as fitting (<=, not <)", () => {
    const result = evaluateFitAnalysis({
      printerVolume: { x: 200, y: 200, z: 200 },
      modelSize: { x: 200, y: 150, z: 150 },
      moldEnvelopeSize: null,
    });
    expect(result.overall).toBe("FITS");
  });

  it("reports DOES_NOT_FIT with the exact failing axis for a single-axis oversize", () => {
    const result = evaluateFitAnalysis({
      printerVolume: { x: 200, y: 200, z: 200 },
      modelSize: { x: 250, y: 150, z: 150 },
      moldEnvelopeSize: null,
    });
    expect(result.overall).toBe("DOES_NOT_FIT");
    if (result.overall !== "NOT_EVALUATED" && result.modelStage.status === "DOES_NOT_FIT") {
      expect(result.modelStage.failingAxes).toEqual(["x"]);
    } else {
      throw new Error("expected model stage to fail");
    }
  });

  it("reports DOES_NOT_FIT with every failing axis for a multi-axis oversize", () => {
    const result = evaluateFitAnalysis({
      printerVolume: { x: 200, y: 200, z: 200 },
      modelSize: { x: 250, y: 210, z: 150 },
      moldEnvelopeSize: null,
    });
    if (result.overall !== "NOT_EVALUATED" && result.modelStage.status === "DOES_NOT_FIT") {
      expect(result.modelStage.failingAxes).toEqual(["x", "y"]);
    } else {
      throw new Error("expected model stage to fail");
    }
  });

  it("reports the model fitting but the mold envelope not fitting as an overall DOES_NOT_FIT", () => {
    const result = evaluateFitAnalysis({
      printerVolume: { x: 200, y: 200, z: 200 },
      modelSize: { x: 150, y: 150, z: 150 },
      moldEnvelopeSize: { x: 210, y: 170, z: 170 },
    });
    expect(result.overall).toBe("DOES_NOT_FIT");
    if (result.overall !== "NOT_EVALUATED") {
      expect(result.modelStage.status).toBe("FITS");
      expect(result.moldStage.status).toBe("DOES_NOT_FIT");
    }
  });

  it("reports both stages independently when both fail", () => {
    const result = evaluateFitAnalysis({
      printerVolume: { x: 200, y: 200, z: 200 },
      modelSize: { x: 250, y: 150, z: 150 },
      moldEnvelopeSize: { x: 270, y: 170, z: 170 },
    });
    expect(result.overall).toBe("DOES_NOT_FIT");
    if (result.overall !== "NOT_EVALUATED") {
      expect(result.modelStage.status).toBe("DOES_NOT_FIT");
      expect(result.moldStage.status).toBe("DOES_NOT_FIT");
    }
  });

  it("derives size from a bounds box", () => {
    expect(
      sizeOfBounds({ min: { x: -5, y: 0, z: 0 }, max: { x: 5, y: 20, z: 30 } }),
    ).toEqual({ x: 10, y: 20, z: 30 });
    expect(sizeOfBounds(null)).toBeNull();
  });

  it("exposes the same deterministic single-size fit primitive to planning", () => {
    expect(
      evaluatePrintableSize(
        { x: 201, y: 200, z: 150 },
        { x: 200, y: 200, z: 200 },
      ),
    ).toEqual({
      status: "DOES_NOT_FIT",
      axisFit: { x: false, y: true, z: true },
      failingAxes: ["x"],
    });
  });
});
