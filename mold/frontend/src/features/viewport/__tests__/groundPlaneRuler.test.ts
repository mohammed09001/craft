import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";

import {
  RULER_MAX_LABEL_PIXELS,
  RULER_MIN_LABEL_PIXELS,
  computeGroundPlaneRulerLayout,
  formatRulerLabel,
  projectWorldLengthToPixels,
  rulerStepBounds,
  selectRulerLabelStep,
} from "../runtime/groundPlaneRuler";

describe("rulerStepBounds", () => {
  it("derives step bounds from the adaptive grid config", () => {
    expect(
      rulerStepBounds({ minorStep: 10, size: 220 }),
    ).toEqual({ minStep: 10, maxStep: 110 });
  });
});

describe("selectRulerLabelStep", () => {
  const bounds = { minStep: 10, maxStep: 110 };

  it("returns a nice 1/2/5 x 10^n step for typical zoom levels", () => {
    expect(selectRulerLabelStep({ pixelsPerWorldUnit: 5, ...bounds })).toBe(20);
    expect(selectRulerLabelStep({ pixelsPerWorldUnit: 20, ...bounds })).toBe(10);
    expect(selectRulerLabelStep({ pixelsPerWorldUnit: 0.5, ...bounds })).toBe(
      100,
    );
  });

  it("selects finer steps when zoomed in and coarser steps when zoomed out", () => {
    const close = selectRulerLabelStep({ pixelsPerWorldUnit: 50, ...bounds });
    const far = selectRulerLabelStep({ pixelsPerWorldUnit: 0.1, ...bounds });

    expect(close).not.toBeNull();
    expect(far).not.toBeNull();
    expect(close! <= far!).toBe(true);
  });

  it("keeps the current step while it stays inside the readable pixel band", () => {
    const selection = {
      ...bounds,
      currentStep: 20,
      pixelsPerWorldUnit: 6,
    };
    expect(20 * 6).toBeGreaterThanOrEqual(RULER_MIN_LABEL_PIXELS);
    expect(20 * 6).toBeLessThanOrEqual(RULER_MAX_LABEL_PIXELS);
    expect(selectRulerLabelStep(selection)).toBe(20);
  });

  it("switches to a finer step when the current step exceeds the band", () => {
    expect(
      selectRulerLabelStep({ ...bounds, currentStep: 20, pixelsPerWorldUnit: 8 }),
    ).not.toBe(20);
  });

  it("switches to a coarser step when the current step drops below the band", () => {
    expect(
      selectRulerLabelStep({ ...bounds, currentStep: 20, pixelsPerWorldUnit: 2 }),
    ).not.toBe(20);
  });

  it("clamps to the min and max step bounds", () => {
    expect(selectRulerLabelStep({ pixelsPerWorldUnit: 1e9, ...bounds })).toBe(
      10,
    );
    expect(selectRulerLabelStep({ pixelsPerWorldUnit: 1e-6, ...bounds })).toBe(
      100,
    );
  });

  it("returns null for degenerate inputs", () => {
    expect(
      selectRulerLabelStep({ pixelsPerWorldUnit: 0, ...bounds }),
    ).toBeNull();
    expect(
      selectRulerLabelStep({ pixelsPerWorldUnit: Number.NaN, ...bounds }),
    ).toBeNull();
    expect(
      selectRulerLabelStep({ pixelsPerWorldUnit: -1, ...bounds }),
    ).toBeNull();
    expect(
      selectRulerLabelStep({
        pixelsPerWorldUnit: 5,
        minStep: 7,
        maxStep: 8,
      }),
    ).toBeNull();
    expect(
      selectRulerLabelStep({
        pixelsPerWorldUnit: 5,
        minStep: 20,
        maxStep: 10,
      }),
    ).toBeNull();
  });
});

describe("computeGroundPlaneRulerLayout", () => {
  it("generates labels with positive, negative, and zero values around the origin", () => {
    const layout = computeGroundPlaneRulerLayout(110, 50);

    expect(layout.step).toBe(50);
    expect(layout.labels.map((label) => label.value)).toEqual([
      -100, -50, 0, 50, 100,
    ]);
  });

  it("marks major ticks at label steps and minor ticks in between", () => {
    const layout = computeGroundPlaneRulerLayout(110, 50);

    expect(layout.ticks.some((tick) => tick.position === 0 && tick.major)).toBe(
      true,
    );
    expect(layout.ticks.some((tick) => tick.position === 10 && !tick.major)).toBe(
      true,
    );
    expect(layout.ticks.some((tick) => tick.position === 50 && tick.major)).toBe(
      true,
    );
  });

  it("keeps tick positions deterministic and inside the extent", () => {
    const layout = computeGroundPlaneRulerLayout(110, 50);

    for (const tick of layout.ticks) {
      expect(Math.abs(tick.position)).toBeLessThanOrEqual(110);
    }

    expect(layout.ticks.length).toBe(23);
  });

  it("returns empty layouts for degenerate inputs", () => {
    expect(computeGroundPlaneRulerLayout(0, 50).ticks).toHaveLength(0);
    expect(computeGroundPlaneRulerLayout(110, 0).labels).toHaveLength(0);
  });
});

describe("formatRulerLabel", () => {
  it("formats integer millimeter values", () => {
    expect(formatRulerLabel(0)).toBe("0");
    expect(formatRulerLabel(-50)).toBe("-50");
    expect(formatRulerLabel(150)).toBe("150");
  });
});

describe("projectWorldLengthToPixels", () => {
  function createCamera() {
    const camera = new PerspectiveCamera(45, 1, 0.1, 2000);
    camera.up.set(0, 0, 1);
    camera.position.set(95, -120, 85);
    camera.lookAt(0, 0, 10);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    return camera;
  }

  it("measures a larger pixel span for a longer world length", () => {
    const camera = createCamera();
    const origin = { x: 0, y: 0, z: 0 };
    const axis = { x: 1, y: 0, z: 0 };

    const short = projectWorldLengthToPixels(camera, origin, axis, 10, 600);
    const long = projectWorldLengthToPixels(camera, origin, axis, 50, 600);

    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    expect(long!).toBeGreaterThan(short!);
  });

  it("returns null when the camera cannot project", () => {
    const camera = { aspect: 1 } as unknown as PerspectiveCamera;

    expect(
      projectWorldLengthToPixels(
        camera,
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        10,
        600,
      ),
    ).toBeNull();
  });

  it("returns null for a zero viewport height", () => {
    const camera = createCamera();

    expect(
      projectWorldLengthToPixels(
        camera,
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        10,
        0,
      ),
    ).toBeNull();
  });
});
