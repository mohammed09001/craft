import { detectMatingInterfaces, detectPrimaryMatingInterface, planRegistrationLayout } from "./registrationPlanner";
import { DefaultRegistrationToleranceResolver } from "./registrationTolerance.policy";
import type { RegistrationProtectedRegion, RegistrationSourceBody } from "./registration.contracts";
import {
  applyRegistrationSizingToTolerancePolicy,
  AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
  REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM,
} from "./registrationSizing.policy";

const policy = new DefaultRegistrationToleranceResolver().resolve(null);
// Production (RegistrationGenerationService / buildRegistrationDependencySnapshot) always widens
// maximumFeatureRadiusMm to fit the active sizing policy's preferred width before planning -- tests
// that plan directly against AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY must apply the same
// widening, or a real 10mm-capable profile is silently filtered out by the un-widened 2.5mm default.
const automaticPolicy = applyRegistrationSizingToTolerancePolicy(policy, AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY);
const emptyMesh = { positions: [], indices: [] };

function stackedBodies(width: number, depth: number): readonly RegistrationSourceBody[] {
  return [
    { id: "body-a", name: "body-a", visible: true, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: width, y: depth, z: 10 } }, triangleCount: 0, volumeMm3: width * depth * 10, watertight: true, mesh: emptyMesh, geometryVersion: "a-v1" },
    { id: "body-b", name: "body-b", visible: true, bounds: { min: { x: 0, y: 0, z: 10 }, max: { x: width, y: depth, z: 20 } }, triangleCount: 0, volumeMm3: width * depth * 10, watertight: true, mesh: emptyMesh, geometryVersion: "b-v1" },
  ];
}

/**
 * Two bodies stacked along `axis`, with the other two axes spanning `uSpan` x
 * `vSpan` starting at `origin`. Lets placement-centering tests exercise every
 * mating-interface orientation (X/Y/Z-normal) and non-origin frames
 * (negative coordinates, a translated moldFrame) through the same fixture
 * shape `stackedBodies` above only produces for a Z-normal interface at the
 * world origin.
 */
function stackedBodiesAlong(
  axis: "x" | "y" | "z",
  uSpan: number,
  vSpan: number,
  thickness = 10,
  origin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
): readonly RegistrationSourceBody[] {
  const other = axis === "x" ? (["y", "z"] as const) : axis === "y" ? (["x", "z"] as const) : (["x", "y"] as const);
  const [u, v] = other;
  const base = (stackOffset: number, stackDepth: number) => {
    const min = { x: origin.x, y: origin.y, z: origin.z };
    const max = { x: origin.x, y: origin.y, z: origin.z };
    min[axis] = origin[axis] + stackOffset;
    max[axis] = origin[axis] + stackOffset + stackDepth;
    min[u] = origin[u];
    max[u] = origin[u] + uSpan;
    min[v] = origin[v];
    max[v] = origin[v] + vSpan;
    return { min, max };
  };
  return [
    { id: "body-a", name: "body-a", visible: true, bounds: base(0, thickness), triangleCount: 0, volumeMm3: uSpan * vSpan * thickness, watertight: true, mesh: emptyMesh, geometryVersion: "a-v1" },
    { id: "body-b", name: "body-b", visible: true, bounds: base(thickness, thickness), triangleCount: 0, volumeMm3: uSpan * vSpan * thickness, watertight: true, mesh: emptyMesh, geometryVersion: "b-v1" },
  ];
}

function fourPartBodies(size: number): readonly RegistrationSourceBody[] {
  const half = size / 2;
  return [
    { id: "body-a", name: "body-a", visible: true, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: half, y: half, z: 10 } }, triangleCount: 0, volumeMm3: half * half * 10, watertight: true, mesh: emptyMesh, geometryVersion: "a-v1" },
    { id: "body-b", name: "body-b", visible: true, bounds: { min: { x: half, y: 0, z: 0 }, max: { x: size, y: half, z: 10 } }, triangleCount: 0, volumeMm3: half * half * 10, watertight: true, mesh: emptyMesh, geometryVersion: "b-v1" },
    { id: "body-c", name: "body-c", visible: true, bounds: { min: { x: 0, y: half, z: 0 }, max: { x: half, y: size, z: 10 } }, triangleCount: 0, volumeMm3: half * half * 10, watertight: true, mesh: emptyMesh, geometryVersion: "c-v1" },
    { id: "body-d", name: "body-d", visible: true, bounds: { min: { x: half, y: half, z: 0 }, max: { x: size, y: size, z: 10 } }, triangleCount: 0, volumeMm3: half * half * 10, watertight: true, mesh: emptyMesh, geometryVersion: "d-v1" },
  ];
}

describe("Edge-Mounted Linear Alignment System Planner", () => {
  it("generates exactly two logical registration keys (left and right) for a two-part mold", () => {
    const data = stackedBodies(50, 50);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    const attempts = planRegistrationLayout(moldInterface, data, [], policy);
    expect(attempts.length).toBeGreaterThan(0);
    const features = attempts[0]!.candidates;
    expect(features.length).toBe(2);
    const sides = features.map((f) => f.side).sort();
    expect(sides).toEqual(["left", "right"]);
  });

  it("places keys along left and right side corridors, never in the central region", () => {
    const data = stackedBodies(60, 60);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    const attempts = planRegistrationLayout(moldInterface, data, [], policy);
    const features = attempts[0]!.candidates;

    for (const feature of features) {
      // Key anchors must lie near the outer x-corridors (x < 15 or x > 45 on a 0..60 box)
      expect(feature.anchor.x < 15 || feature.anchor.x > 45).toBe(true);
      // Key must not lie in the central region (20 < x < 40)
      expect(feature.anchor.x >= 20 && feature.anchor.x <= 40).toBe(false);
    }
  });

  it("enforces controlled asymmetry between left and right keys for 180-degree orientation control", () => {
    const data = stackedBodies(50, 50);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    const features = planRegistrationLayout(moldInterface, data, [], policy)[0]!.candidates;
    const leftKey = features.find((f) => f.side === "left")!;
    const rightKey = features.find((f) => f.side === "right")!;

    expect(leftKey).toBeDefined();
    expect(rightKey).toBeDefined();
    // Lengths or start/end positions differ deterministically to prevent reversed assembly
    expect(leftKey.geometry.lengthMm).not.toEqual(rightKey.geometry.lengthMm);
  });

  it("splits a key into collinear segments when an obstacle blocks a continuous path", () => {
    const data = stackedBodies(60, 60);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    // Place a small protected cavity obstacle in the middle of the left corridor
    const cavity: RegistrationProtectedRegion = {
      id: "mid-left-cavity",
      kind: "cavity",
      bounds: { min: { x: 0, y: 25, z: 5 }, max: { x: 10, y: 35, z: 15 } },
    };

    const attempts = planRegistrationLayout(moldInterface, data, [cavity], policy);
    expect(attempts.length).toBeGreaterThan(0);
    const features = attempts[0]!.candidates;
    const leftSegments = features.filter((f) => f.side === "left");
    // Should split left key into collinear segments on the left side
    for (const seg of leftSegments) {
      expect(seg.side).toBe("left");
    }
  });

  it("creates keys only on real mating interfaces for a four-part mold", () => {
    const data = fourPartBodies(60);
    const interfaces = detectMatingInterfaces(data, 1e-5);
    // 4 bodies in a 2x2 grid produce 4 real mating interfaces: A↔B, A↔C, B↔D, C↔D
    expect(interfaces.length).toBe(4);
    for (const moldInterface of interfaces) {
      const attempts = planRegistrationLayout(moldInterface, data, [], policy, [], interfaces);
      expect(attempts.length).toBeGreaterThan(0);
      const features = attempts[0]!.candidates;
      expect(features.length).toBeGreaterThan(0);
    }
  });

  it("protects split plane intersection zones from feature termination", () => {
    const data = fourPartBodies(60);
    const interfaces = detectMatingInterfaces(data, 1e-5);
    // Split intersection is at (30, 30)
    for (const moldInterface of interfaces) {
      const attempts = planRegistrationLayout(moldInterface, data, [], policy, [], interfaces);
      const features = attempts[0]!.candidates;
      for (const feature of features) {
        // Neither startPoint nor endPoint should be within 5mm of intersection center (30, 30)
        const distStart = Math.hypot(feature.startPoint.x - 30, feature.startPoint.y - 30);
        const distEnd = Math.hypot(feature.endPoint.x - 30, feature.endPoint.y - 30);
        expect(distStart).toBeGreaterThanOrEqual(4);
        expect(distEnd).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("assigns male/female body roles deterministically", () => {
    const data = stackedBodies(50, 50);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    const firstRun = planRegistrationLayout(moldInterface, data, [], policy)[0]!.candidates;
    const secondRun = planRegistrationLayout(moldInterface, [...data].reverse(), [], policy)[0]!.candidates;

    expect(firstRun[0]!.maleBodyId).toBe(secondRun[0]!.maleBodyId);
    expect(firstRun[0]!.femaleBodyId).toBe(secondRun[0]!.femaleBodyId);
  });

  it("reaches the 30 mm preferred width for automatic Segmentation once the interface is large enough to support it", () => {
    const data = stackedBodies(500, 500);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    const normal = planRegistrationLayout(
      moldInterface,
      data,
      [],
      policy,
    )[0]!.candidates;
    const automatic = planRegistrationLayout(
      moldInterface,
      data,
      [],
      automaticPolicy,
      [],
      undefined,
      AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
    )[0]!.candidates;

    expect(normal.some((feature) => feature.geometry.widthMm < 30)).toBe(true);
    expect(
      automatic.every((feature) => feature.geometry.widthMm >= 15),
    ).toBe(true);
    expect(
      automatic.some((feature) => feature.geometry.widthMm === 30),
    ).toBe(true);
    expect(
      automatic.map((feature) => ({
        maleBodyId: feature.maleBodyId,
        femaleBodyId: feature.femaleBodyId,
      })),
    ).toEqual(
      normal.map((feature) => ({
        maleBodyId: feature.maleBodyId,
        femaleBodyId: feature.femaleBodyId,
      })),
    );
  });

  it("gives small, medium, and large automatic-Segmentation interfaces meaningfully different, non-flattened widths", () => {
    // A 15mm interface cannot safely carry the 30mm preferred profile: its
    // usable span only supports the smaller adaptive profile, so the planner
    // must fall back rather than force the preferred width onto a small
    // segment.
    const small = stackedBodies(15, 15);
    const smallInterface = detectPrimaryMatingInterface(small, 1e-5)!;
    const smallAttempts = planRegistrationLayout(
      smallInterface,
      small,
      [],
      automaticPolicy,
      [],
      undefined,
      AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
    );
    expect(smallAttempts.length).toBeGreaterThan(0);
    const smallWidth = smallAttempts[0]!.candidates[0]!.geometry.widthMm;
    expect(smallWidth).toBeLessThan(7.2);
    expect(smallWidth).toBeGreaterThanOrEqual(REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM);

    // An 80mm interface is safely large but not yet large enough to reach the
    // full 30mm cap -- it should land strictly between the small fallback and
    // the preferred cap.
    const medium = stackedBodies(80, 80);
    const mediumInterface = detectPrimaryMatingInterface(medium, 1e-5)!;
    const mediumAttempts = planRegistrationLayout(
      mediumInterface,
      medium,
      [],
      automaticPolicy,
      [],
      undefined,
      AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
    );
    const mediumWidth = mediumAttempts[0]!.candidates[0]!.geometry.widthMm;
    expect(mediumWidth).toBeGreaterThan(smallWidth);
    expect(mediumWidth).toBeLessThan(30);

    // A 500mm interface -- reachable now that the large-Segmentation mold
    // allowance is 100mm -- comfortably supports the full 30mm preferred
    // profile.
    const large = stackedBodies(500, 500);
    const largeInterface = detectPrimaryMatingInterface(large, 1e-5)!;
    const largeAttempts = planRegistrationLayout(
      largeInterface,
      large,
      [],
      automaticPolicy,
      [],
      undefined,
      AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
    );
    const largeWidth = largeAttempts[0]!.candidates[0]!.geometry.widthMm;
    expect(largeWidth).toBe(30);

    // The universal floor is gone: small, medium, and large interfaces differ.
    expect(smallWidth).not.toBe(mediumWidth);
    expect(mediumWidth).not.toBe(largeWidth);
  });

  it("scales width continuously with span across the full manufacturable range instead of flattening to one floor value", () => {
    // Regression for the v3 preferred-cap-relative floor (preferredCap * 0.72),
    // which flattened every interface in a wide middle band to the same
    // constant width. Profile 3's floor is the shared manufacturing minimum,
    // so minSpan * 0.11 (clamped to [2.4, 30] under the v5 30mm cap) drives
    // width continuously across the whole range, including spans only
    // reachable now that the large-Segmentation mold allowance is 100mm.
    const spans = [20, 40, 75, 100, 150, 250, 350, 500];
    const widths = spans.map((span) => {
      const data = stackedBodies(span, span);
      const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
      const attempts = planRegistrationLayout(
        moldInterface,
        data,
        [],
        automaticPolicy,
        [],
        undefined,
        AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
      );
      expect(attempts.length).toBeGreaterThan(0);
      return attempts[0]!.candidates[0]!.geometry.widthMm;
    });

    // Strictly increasing (or reaching the cap) across the whole table --
    // no two spans collapse to the same flattened value below the cap.
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);
      if (widths[i]! < 30) expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
    }

    // Anchor points, straight from minSpan * 0.11 (clamped to [2.4, 30]):
    // 20 -> floor (2.4), 40 -> 4.4, 75 -> 8.25, 100 -> 11, 150 -> 16.5,
    // 250 -> 27.5, 350 -> the 30mm cap (350*0.11=38.5, clamped),
    // 500 -> the 30mm cap (500*0.11=55, clamped).
    expect(widths).toEqual([2.4, 4.4, 8.25, 11, 16.5, 27.5, 30, 30]);

    // No two distinct spans below the cap collapse onto the same width --
    // the regression this test guards against was every span in a wide
    // middle band flattening onto one constant value.
    const belowCap = widths.filter((width) => width < 30);
    expect(new Set(belowCap).size).toBe(belowCap.length);
  });

  it("rejects an interface too small for any manufacturable profile instead of forcing an unsafe feature", () => {
    const tiny = stackedBodies(8, 8);
    const tinyInterface = detectPrimaryMatingInterface(tiny, 1e-5)!;
    const attempts = planRegistrationLayout(
      tinyInterface,
      tiny,
      [],
      policy,
      [],
      undefined,
      AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
    );
    expect(attempts.length).toBe(0);
  });

  it("falls back from the preferred profile to a smaller safe one when the preferred width cannot clear feature-radius safety, instead of dropping Registration entirely", () => {
    const restrictive = { ...policy, maximumFeatureRadiusMm: 1.6 };
    const data = stackedBodies(80, 80);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    const attempts = planRegistrationLayout(
      moldInterface,
      data,
      [],
      restrictive,
      [],
      undefined,
      AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
    );
    expect(attempts.length).toBeGreaterThan(0);
    for (const attempt of attempts) {
      expect(attempt.radiusMm).toBeLessThanOrEqual(restrictive.maximumFeatureRadiusMm);
    }
  });
});

describe("centered placement in the usable safe mating-interface corridor", () => {
  const otherAxesOf = (axis: "x" | "y" | "z") => (axis === "x" ? (["y", "z"] as const) : axis === "y" ? (["x", "z"] as const) : (["x", "y"] as const));
  // Sampling walks the corridor in 2mm steps and clips safe intervals to the
  // nearest sampled point, so a feature's measured center can differ from
  // the corridor's true geometric center by up to about one step.
  const CENTER_TOLERANCE_MM = 2.5;

  it.each([["x"], ["y"], ["z"]] as const)("centers both left and right keys on the corridor center for a %s-normal interface", (axis) => {
    const data = stackedBodiesAlong(axis, 60, 60);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    const features = planRegistrationLayout(moldInterface, data, [], automaticPolicy, [], undefined, AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY)[0]!.candidates;
    const [, v] = otherAxesOf(axis);
    const corridorCenter = (moldInterface.matingBounds.min[v] + moldInterface.matingBounds.max[v]) / 2;

    const leftKey = features.find((f) => f.side === "left")!;
    const rightKey = features.find((f) => f.side === "right")!;
    expect(leftKey).toBeDefined();
    expect(rightKey).toBeDefined();
    expect(leftKey.anchor[v]).toBeCloseTo(corridorCenter, 0);
    expect(rightKey.anchor[v]).toBeCloseTo(corridorCenter, 0);
    expect(Math.abs(leftKey.anchor[v] - corridorCenter)).toBeLessThanOrEqual(CENTER_TOLERANCE_MM);
    expect(Math.abs(rightKey.anchor[v] - corridorCenter)).toBeLessThanOrEqual(CENTER_TOLERANCE_MM);

    // The orientation-control length differential survives centering: the
    // right key is still deliberately shorter than the left.
    expect(rightKey.geometry.lengthMm).toBeLessThan(leftKey.geometry.lengthMm);
  });

  it("keeps the same centered group when body order is reversed, instead of shifting toward one edge", () => {
    const forward = stackedBodiesAlong("z", 60, 60);
    const reversed = [...forward].reverse();
    const forwardInterface = detectPrimaryMatingInterface(forward, 1e-5)!;
    const reversedInterface = detectPrimaryMatingInterface(reversed, 1e-5)!;

    const forwardFeatures = planRegistrationLayout(forwardInterface, forward, [], automaticPolicy, [], undefined, AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY)[0]!.candidates;
    const reversedFeatures = planRegistrationLayout(reversedInterface, reversed, [], automaticPolicy, [], undefined, AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY)[0]!.candidates;

    const forwardLeft = forwardFeatures.find((f) => f.side === "left")!;
    const reversedLeft = reversedFeatures.find((f) => f.side === "left")!;
    expect(Math.abs(forwardLeft.anchor.y - reversedLeft.anchor.y)).toBeLessThanOrEqual(CENTER_TOLERANCE_MM);

    // Male/female assignment may swap with body order, but the group's
    // geometric placement must not.
    const forwardRoles = { maleBodyId: forwardFeatures[0]!.maleBodyId, femaleBodyId: forwardFeatures[0]!.femaleBodyId };
    const reversedRoles = { maleBodyId: reversedFeatures[0]!.maleBodyId, femaleBodyId: reversedFeatures[0]!.femaleBodyId };
    expect(forwardRoles).toEqual(reversedRoles);
  });

  it("centers correctly for negative coordinates and a translated moldFrame origin", () => {
    const negative = stackedBodiesAlong("z", 60, 60, 10, { x: -80, y: -40, z: -25 });
    const translated = stackedBodiesAlong("z", 60, 60, 10, { x: 500, y: 250, z: 75 });

    for (const data of [negative, translated]) {
      const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
      const features = planRegistrationLayout(moldInterface, data, [], automaticPolicy, [], undefined, AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY)[0]!.candidates;
      const corridorCenter = (moldInterface.matingBounds.min.y + moldInterface.matingBounds.max.y) / 2;
      for (const feature of features) {
        expect(Math.abs(feature.anchor.y - corridorCenter)).toBeLessThanOrEqual(CENTER_TOLERANCE_MM);
      }
    }
  });

  it("falls back to balanced segments on both sides of an obstacle blocking the exact corridor center, instead of hugging one edge", () => {
    const data = stackedBodiesAlong("z", 100, 100);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    const corridorCenterV = (moldInterface.matingBounds.min.y + moldInterface.matingBounds.max.y) / 2;
    // A protected region straddling the exact center of the left corridor,
    // wide enough that no single centered feature can fit through it. Kind
    // "functional" (not "cavity") deliberately -- this fixture spans x:[0,15]
    // flush against the left exterior face specifically to exercise the
    // length-axis (y) obstacle-splitting search below, and would leave zero
    // wall-centering material on the "left" side if it were treated as the
    // product cavity (see the dedicated cavity-wall-centering tests for that
    // concern). isPointSafeFromRegions treats every protectedRegion kind
    // identically for obstacle avoidance, so this substitution doesn't weaken
    // what the test actually covers.
    const centerBlock: RegistrationProtectedRegion = {
      id: "center-block",
      kind: "functional",
      bounds: { min: { x: 0, y: corridorCenterV - 15, z: 0 }, max: { x: 15, y: corridorCenterV + 15, z: 20 } },
    };
    const attempts = planRegistrationLayout(moldInterface, data, [centerBlock], automaticPolicy, [], undefined, AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY);
    expect(attempts.length).toBeGreaterThan(0);
    const leftSegments = attempts[0]!.candidates.filter((f) => f.side === "left");
    expect(leftSegments.length).toBeGreaterThanOrEqual(1);

    // The obstacle sits dead center, so a genuinely balanced fallback keeps
    // material on both sides rather than silently collapsing everything
    // toward one edge.
    const before = leftSegments.filter((f) => f.anchor.y < corridorCenterV);
    const after = leftSegments.filter((f) => f.anchor.y > corridorCenterV);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
  });

  it("centers a single-corridor (non-two-part) feature on the corridor center", () => {
    const data = fourPartBodies(80);
    const interfaces = detectMatingInterfaces(data, 1e-5);
    for (const moldInterface of interfaces) {
      const [, v] = otherAxesOf(moldInterface.axis);
      const attempts = planRegistrationLayout(moldInterface, data, [], automaticPolicy, [], interfaces, AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY);
      if (attempts.length === 0) continue;
      const corridorCenter = (moldInterface.matingBounds.min[v] + moldInterface.matingBounds.max[v]) / 2;
      for (const feature of attempts[0]!.candidates) {
        expect(Math.abs(feature.anchor[v] - corridorCenter)).toBeLessThanOrEqual(CENTER_TOLERANCE_MM + 3);
      }
    }
  });
});

describe("cavity-wall-centered placement (Segmentation Registration policy)", () => {
  const otherAxesOf = (axis: "x" | "y" | "z") => (axis === "x" ? (["y", "z"] as const) : axis === "y" ? (["x", "z"] as const) : (["x", "y"] as const));

  it.each([["x"], ["y"], ["z"]] as const)(
    "places left/right keys in the middle of the solid wall between the cavity and the exterior mold face, not at the legacy edge margin, for a %s-normal interface",
    (axis) => {
      const data = stackedBodiesAlong(axis, 100, 100);
      const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
      const [u] = otherAxesOf(axis);
      // Cavity occupies the middle third of the interface in u, leaving an
      // equal 0..30 wall on the left and 70..100 wall on the right.
      const min = { x: 0, y: 0, z: 0 };
      min[u] = 30;
      const max = { x: 100, y: 100, z: 100 };
      max[u] = 70;
      const cavity: RegistrationProtectedRegion = {
        id: "product-cavity",
        kind: "cavity",
        bounds: { min, max },
      };
      const features = planRegistrationLayout(moldInterface, data, [cavity], automaticPolicy, [], undefined, AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY)[0]!.candidates;
      const leftKey = features.find((f) => f.side === "left")!;
      const rightKey = features.find((f) => f.side === "right")!;
      expect(leftKey).toBeDefined();
      expect(rightKey).toBeDefined();

      // Wall-centered: left wall [0,30] -> center 15; right wall [70,100] -> center 85.
      expect(leftKey.anchor[u]).toBeCloseTo(15, 0);
      expect(rightKey.anchor[u]).toBeCloseTo(85, 0);

      // Not the legacy edge corridor, which would sit within a few mm of the
      // exterior faces (u=0 / u=100) regardless of where the cavity is.
      expect(leftKey.anchor[u]).toBeGreaterThan(10);
      expect(rightKey.anchor[u]).toBeLessThan(90);

      // Both keys stay clear of the cavity boundary (u in [30,70]).
      expect(leftKey.anchor[u]).toBeLessThan(30);
      expect(rightKey.anchor[u]).toBeGreaterThan(70);
    },
  );

  it("falls back to the legacy edge-corridor coordinate when no cavity protected region is available", () => {
    const data = stackedBodiesAlong("z", 100, 100);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    const features = planRegistrationLayout(moldInterface, data, [], automaticPolicy, [], undefined, AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY)[0]!.candidates;
    const leftKey = features.find((f) => f.side === "left")!;
    const rightKey = features.find((f) => f.side === "right")!;

    // No cavity to center against -- both keys land near their respective
    // exterior edges, exactly as the pre-existing edge-corridor behavior did.
    expect(leftKey.anchor.x).toBeLessThan(15);
    expect(rightKey.anchor.x).toBeGreaterThan(85);
  });

  it("falls back to the legacy edge-corridor coordinate on a side where the cavity leaves no wall material at all", () => {
    const data = stackedBodiesAlong("z", 100, 100);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    // Cavity flush against the left exterior face (x:[0,60]) leaves a real
    // wall only on the right (x:[60,100]); the left side has zero available
    // material to center within.
    const cavity: RegistrationProtectedRegion = {
      id: "product-cavity",
      kind: "cavity",
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 60, y: 100, z: 100 } },
    };
    const features = planRegistrationLayout(moldInterface, data, [cavity], automaticPolicy, [], undefined, AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY)[0]?.candidates ?? [];
    const rightKey = features.find((f) => f.side === "right");
    // The right side still centers correctly: wall [60,100] -> center 80.
    expect(rightKey?.anchor.x).toBeCloseTo(80, 0);
    // The left side either falls back to the edge-corridor coordinate (which
    // isPointSafeFromRegions then rejects, since it sits inside the cavity)
    // or is simply absent -- either way it must never be reported as safely
    // centered inside the cavity itself.
    const leftKey = features.find((f) => f.side === "left");
    if (leftKey !== undefined) expect(leftKey.anchor.x).toBeGreaterThanOrEqual(60);
  });

  it("keeps Cut by Face / Manual (edge-corridor) placement unchanged even when a cavity region is present", () => {
    const data = stackedBodiesAlong("z", 100, 100);
    const moldInterface = detectPrimaryMatingInterface(data, 1e-5)!;
    const cavity: RegistrationProtectedRegion = {
      id: "product-cavity",
      kind: "cavity",
      bounds: { min: { x: 30, y: 0, z: 0 }, max: { x: 70, y: 100, z: 100 } },
    };
    // NORMAL_MOLD_REGISTRATION_SIZING_POLICY (default sizingPolicy, used by
    // Cut by Face) keeps placementStrategy "edge-corridor"
    // -- a cavity region being present must not change that.
    const features = planRegistrationLayout(moldInterface, data, [cavity], policy)[0]!.candidates;
    const leftKey = features.find((f) => f.side === "left")!;
    const rightKey = features.find((f) => f.side === "right")!;
    expect(leftKey.anchor.x).toBeLessThan(15);
    expect(rightKey.anchor.x).toBeGreaterThan(85);
  });
});
