import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";

import { requestSegmentationPlan } from "./application/segmentationApplication";
import { readCurrentSegmentationSourceSnapshot } from "./application/segmentationSourceSnapshot";
import { useSegmentationModeStore } from "./segmentationMode.store";
import { readFitAnalysisFromStores } from "./useFitAnalysis";

describe("automatic Segmentation printable-envelope policy", () => {
  const originalBounds = useModelBoundsStore.getState();
  const originalPrinter = usePrinterBuildVolumeStore.getState();
  const originalSplit = useSplitFaceStore.getState();

  afterEach(() => {
    useSegmentationModeStore.getState().reset();
    useSplitFaceStore.setState(originalSplit, true);
    useModelBoundsStore.setState(originalBounds, true);
    usePrinterBuildVolumeStore.setState(originalPrinter, true);
  });

  it("routes a fitting part to Segmentation when its 100 mm-clearance mold exceeds the printer", () => {
    useSplitFaceStore.getState().clearForModelReplacement();
    useModelBoundsStore.setState({
      groundedWorldBounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 160, y: 50, z: 50 },
        size: { x: 160, y: 50, z: 50 },
      },
    });
    // Printer volume set to 300mm: with
    // AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM=100, the automatic mold
    // envelope is model size + 200mm on every axis (y/z: 50+200=250,
    // x: 160+200=360), so 300mm keeps y/z (250mm) fitting while x (360mm)
    // still requires Segmentation, preserving this test's original "fits on
    // y/z, oversized on x only" scenario.
    usePrinterBuildVolumeStore
      .getState()
      .setPrinterBuildVolume({ x: 300, y: 300, z: 300 });

    const fit = readFitAnalysisFromStores();
    expect(fit.overall).toBe("DOES_NOT_FIT");
    if (fit.overall === "NOT_EVALUATED") return;
    expect(fit.modelStage.status).toBe("FITS");
    expect(fit.moldStage).toMatchObject({
      status: "DOES_NOT_FIT",
      failingAxes: ["x"],
    });

    const source = readCurrentSegmentationSourceSnapshot();
    expect(source.status).toBe("ready");
    if (source.status !== "ready") return;
    expect(source.definition.referenceMoldBlock.clearanceMm).toBe(100);
    expect(source.snapshot.aggregateBounds).toEqual({
      min: { x: -100, y: -100, z: 0 },
      max: { x: 260, y: 150, z: 250 },
    });

    const planned = requestSegmentationPlan();
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    expect(planned.plan.requiredAxes).toEqual(["x"]);
    expect(planned.plan.segments).toHaveLength(2);
    expect(planned.plan.segments.every((segment) => {
      const width = segment.predictedBounds.max.x - segment.predictedBounds.min.x;
      return width <= 300;
    })).toBe(true);
  });
});
