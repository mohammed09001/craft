import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MoldInterface, RegistrationAxis, RegistrationFeature, RegistrationProtectedRegion, RegistrationSourceBody, RegistrationTolerancePolicy, RegistrationVector3, LinearKeySide } from "./registration.contracts";
import {
  NORMAL_MOLD_REGISTRATION_SIZING_POLICY,
  REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM,
  type RegistrationSizingPolicy,
} from "./registrationSizing.policy";

const AXES = ["x", "y", "z"] as const;
const hash = (value: string): string => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1)
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
};

const otherAxes = (axis: RegistrationAxis): readonly [RegistrationAxis, RegistrationAxis] =>
  axis === "x" ? ["y", "z"] : axis === "y" ? ["x", "z"] : ["x", "y"];

const direction = (axis: RegistrationAxis, sign: number): RegistrationVector3 => ({
  x: axis === "x" ? sign : 0,
  y: axis === "y" ? sign : 0,
  z: axis === "z" ? sign : 0,
});

const overlapRange = (a: Bounds3, b: Bounds3, axis: RegistrationAxis): readonly [number, number] => [
  Math.max(a.min[axis], b.min[axis]),
  Math.min(a.max[axis], b.max[axis]),
];

type InterfaceCandidate = {
  bodyA: RegistrationSourceBody;
  bodyB: RegistrationSourceBody;
  axis: RegistrationAxis;
  plane: number;
  area: number;
  bounds: Bounds3;
};

function bestAxisForPair(left: RegistrationSourceBody, right: RegistrationSourceBody, toleranceMm: number): InterfaceCandidate | null {
  let best: InterfaceCandidate | null = null;
  for (const axis of AXES) {
    const leftBefore = Math.abs(left.bounds.max[axis] - right.bounds.min[axis]) <= toleranceMm;
    const rightBefore = Math.abs(right.bounds.max[axis] - left.bounds.min[axis]) <= toleranceMm;
    if (!leftBefore && !rightBefore) continue;
    const [u, v] = otherAxes(axis), uRange = overlapRange(left.bounds, right.bounds, u), vRange = overlapRange(left.bounds, right.bounds, v);
    const area = (uRange[1] - uRange[0]) * (vRange[1] - vRange[0]);
    if (area <= toleranceMm * toleranceMm) continue;
    const bodyA = leftBefore ? left : right, bodyB = leftBefore ? right : left, plane = bodyA.bounds.max[axis];
    const overlapMin = { x: Math.max(left.bounds.min.x, right.bounds.min.x), y: Math.max(left.bounds.min.y, right.bounds.min.y), z: Math.max(left.bounds.min.z, right.bounds.min.z) };
    const overlapMax = { x: Math.min(left.bounds.max.x, right.bounds.max.x), y: Math.min(left.bounds.max.y, right.bounds.max.y), z: Math.min(left.bounds.max.z, right.bounds.max.z) };
    const bounds: Bounds3 = { min: { ...overlapMin, [axis]: plane }, max: { ...overlapMax, [axis]: plane } };
    if (best === null || area > best.area || (area === best.area && axis < best.axis)) best = { bodyA, bodyB, axis, plane, area, bounds };
  }
  return best;
}

function toMoldInterface(candidate: InterfaceCandidate): MoldInterface {
  const signature = `${candidate.bodyA.id}:${candidate.bodyB.id}:${candidate.axis}:${candidate.plane}`;
  return Object.freeze({
    id: `mold-interface:${hash(signature)}`,
    bodyAId: candidate.bodyA.id,
    bodyBId: candidate.bodyB.id,
    role: "primary-parting",
    axis: candidate.axis,
    planeCoordinateMm: candidate.plane,
    matingBounds: candidate.bounds,
    assemblyDirection: direction(candidate.axis, 1),
  });
}

export function detectMatingInterfaces(bodies: readonly RegistrationSourceBody[], toleranceMm: number): readonly MoldInterface[] {
  const sorted = [...bodies].sort((left, right) => left.id.localeCompare(right.id));
  const candidates: InterfaceCandidate[] = [];
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
    const candidate = bestAxisForPair(sorted[leftIndex]!, sorted[rightIndex]!, toleranceMm);
    if (candidate !== null) candidates.push(candidate);
  }
  candidates.sort((a, b) => b.area - a.area || `${a.bodyA.id}:${a.bodyB.id}:${a.axis}`.localeCompare(`${b.bodyA.id}:${b.bodyB.id}:${b.axis}`));
  return Object.freeze(candidates.map(toMoldInterface));
}

export function detectPrimaryMatingInterface(bodies: readonly RegistrationSourceBody[], toleranceMm: number): MoldInterface | null {
  return detectMatingInterfaces(bodies, toleranceMm)[0] ?? null;
}

export interface RegistrationLayoutAttempt {
  readonly candidates: readonly RegistrationFeature[];
  readonly radiusMm: number;
  readonly requestedCounts: readonly number[];
}

export interface RegistrationExclusionZone { readonly anchor: RegistrationVector3; readonly radiusMm: number }

function isPointSafeFromRegions(
  pt: RegistrationVector3,
  radius: number,
  protectedRegions: readonly RegistrationProtectedRegion[],
  policy: RegistrationTolerancePolicy,
  axis: RegistrationAxis,
): boolean {
  const margin = radius + policy.cavitySafetyMarginMm - 1e-4;
  const [u, v] = otherAxes(axis);
  for (const region of protectedRegions) {
    const du = pt[u] < region.bounds.min[u] ? region.bounds.min[u] - pt[u] : pt[u] > region.bounds.max[u] ? pt[u] - region.bounds.max[u] : 0;
    const dv = pt[v] < region.bounds.min[v] ? region.bounds.min[v] - pt[v] : pt[v] > region.bounds.max[v] ? pt[v] - region.bounds.max[v] : 0;
    if (Math.hypot(du, dv) < margin) return false;
  }
  return true;
}

function isPointSafeFromExclusions(
  pt: RegistrationVector3,
  radiusMm: number,
  exclusionZones: readonly RegistrationExclusionZone[],
  marginMm: number
): boolean {
  for (const zone of exclusionZones) {
    const dx = pt.x - zone.anchor.x, dy = pt.y - zone.anchor.y, dz = pt.z - zone.anchor.z;
    if (Math.hypot(dx, dy, dz) < radiusMm + zone.radiusMm + marginMm - 1e-4) return false;
  }
  return true;
}

export function planRegistrationLayout(
  moldInterface: MoldInterface,
  bodies: readonly RegistrationSourceBody[],
  protectedRegions: readonly RegistrationProtectedRegion[],
  policy: RegistrationTolerancePolicy,
  exclusionZones: readonly RegistrationExclusionZone[] = [],
  allInterfaces?: readonly MoldInterface[],
  sizingPolicy: RegistrationSizingPolicy =
    NORMAL_MOLD_REGISTRATION_SIZING_POLICY,
): readonly RegistrationLayoutAttempt[] {
  const [u, v] = otherAxes(moldInterface.axis);
  const spanU = moldInterface.matingBounds.max[u] - moldInterface.matingBounds.min[u];
  const spanV = moldInterface.matingBounds.max[v] - moldInterface.matingBounds.min[v];
  const minSpan = Math.min(spanU, spanV);

  // Production always supplies at most one "cavity"-kind protected region
  // (see buildRegistrationDependencySnapshot); centering is measured against
  // that one, not sprue/vent/functional regions, which stay pure exclusion
  // obstacles for isPointSafeFromRegions below.
  const cavityRegion = protectedRegions.find((region) => region.kind === "cavity") ?? null;

  /**
   * Midpoint of the actual solid-material interval between the cavity's
   * near boundary on this side and the opposing exterior mold face
   * (moldInterface.matingBounds' own edge on that side), in the lateral
   * axis the given side is fixed on. Returns null when there is no cavity
   * to measure against, or the cavity leaves no material on that side at
   * all -- both cases fall back to the legacy edge-corridor coordinate;
   * per-point safety (isPointSafeFromRegions/filterByWallThickness) still
   * independently rejects any placement that isn't actually safe, so this
   * fallback never weakens a safety guarantee, only the centering itself.
   */
  const wallCenteredCoord = (side: LinearKeySide): number | null => {
    if (cavityRegion === null) return null;
    const axis = side === "left" || side === "right" ? u : v;
    const exteriorMin = moldInterface.matingBounds.min[axis];
    const exteriorMax = moldInterface.matingBounds.max[axis];
    const cavityMin = Math.max(cavityRegion.bounds.min[axis], exteriorMin);
    const cavityMax = Math.min(cavityRegion.bounds.max[axis], exteriorMax);
    const nearExteriorMin = side === "left" || side === "bottom";
    const wallMin = nearExteriorMin ? exteriorMin : cavityMax;
    const wallMax = nearExteriorMin ? cavityMin : exteriorMax;
    if (wallMax - wallMin <= 0) return null;
    return (wallMin + wallMax) / 2;
  };

  if (minSpan < policy.minimumFeatureRadiusMm * 2) return Object.freeze([]);

  const bodyA = bodies.find((body) => body.id === moldInterface.bodyAId)!;
  const bodyB = bodies.find((body) => body.id === moldInterface.bodyBId)!;
  const thicknessA = bodyA.bounds.max[moldInterface.axis] - bodyA.bounds.min[moldInterface.axis];
  const thicknessB = bodyB.bounds.max[moldInterface.axis] - bodyB.bounds.min[moldInterface.axis];
  const minBodyThickness = Math.min(thicknessA, thicknessB);

  // Female receives groove (subtracts material), male receives tongue (adds material)
  const femaleBodyId = thicknessA > thicknessB || (thicknessA === thicknessB && bodyA.id < bodyB.id) ? bodyA.id : bodyB.id;
  const maleBodyId = femaleBodyId === bodyA.id ? bodyB.id : bodyA.id;

  const isTwoPart = bodies.length <= 2 || (allInterfaces !== undefined && allInterfaces.length === 1);

  // Adaptive Small Alignment Feature Profiles, each derived from this
  // interface's actual usable span (minSpan) and body thickness
  // (minBodyThickness) rather than any fixed constant. Profile 3 targets the
  // workflow's preferred width (from sizingPolicy) and, like the others,
  // never falls below the shared manufacturing floor. Which end of the
  // ladder is tried first is decided below by sizingPolicy.profileSearchOrder
  // -- this keeps one candidate list and one formula shape for every
  // workflow instead of a separate segmentation-specific planner.
  //
  // Profile 3's floor is the shared manufacturing minimum, not a fraction of
  // the preferred cap: a cap-relative floor (e.g. preferredCapMm * 0.72)
  // compresses every interface between the manufacturing minimum and that
  // fraction into one flat width -- for a 10mm cap that flattened every span
  // from ~22mm to ~65mm to a constant 7.2mm. Scaling continuously from the
  // manufacturing minimum keeps minSpan * 0.11 the only thing driving width
  // across the whole range, so small/medium/large interfaces stay visibly
  // distinct right up to the point the cap itself takes over.
  const preferredCapMm = sizingPolicy.preferredNominalWidthMm;
  const preferredFloorMm = REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM;
  // Depth is an independent engineering dimension from width, not a fixed
  // fraction of it at any width: it must not keep growing once
  // preferredCapMm passes the pre-150mm-large-Segmentation reference width
  // (10mm), or a workflow's preferred width (now 30mm, previously 50mm)
  // would silently demand more depth than most bodies are safely thick
  // enough to carry, forcing profile 3 out via the wall-thickness filter for
  // interfaces that used to succeed. Depth keeps tracking body thickness via
  // minBodyThickness*0.13 below either way; only the width-derived cap/floor
  // it's clamped into stops growing past the 10mm reference. Because 30mm
  // (like 50mm before it) is still above the 10mm reference, preferredCapMm
  // never changes preferredDepthReferenceMm/preferredDepthCapMm/
  // preferredDepthFloorMm here -- Math.min(preferredCapMm, 10) is 10 either
  // way, so this preferred-width change is depth-neutral by construction.
  const preferredDepthReferenceMm = Math.min(preferredCapMm, 10);
  const preferredDepthCapMm = preferredDepthReferenceMm * 0.4;
  const preferredDepthFloorMm = preferredDepthReferenceMm * 0.32;
  const profileCandidates = [
    // Profile 0: Smallest minimal adaptive profile (thin guide rail)
    {
      keyWidthMm: Number(
        Math.min(3.2, Math.max(REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM, minSpan * 0.06)).toFixed(3),
      ),
      keyDepthMm: Number(Math.min(1.4, Math.max(1.0, minBodyThickness * 0.08)).toFixed(3)),
    },
    // Profile 1: Moderate adaptive profile
    {
      keyWidthMm: Number(Math.min(3.8, Math.max(2.8, minSpan * 0.08)).toFixed(3)),
      keyDepthMm: Number(Math.min(1.6, Math.max(1.2, minBodyThickness * 0.10)).toFixed(3)),
    },
    // Profile 2: Standard restrained profile
    {
      keyWidthMm: Number(Math.min(4.5, Math.max(3.2, minSpan * 0.1)).toFixed(3)),
      keyDepthMm: Number(Math.min(1.8, Math.max(1.4, minBodyThickness * 0.12)).toFixed(3)),
    },
    // Profile 3: Workflow-preferred profile (e.g. Automatic Segmentation's
    // larger assembly-handling target). Still bounded below by the shared
    // manufacturing floor, so a small interface walking down to this profile
    // never receives an unsafely narrow feature.
    {
      keyWidthMm: Number(
        Math.min(preferredCapMm, Math.max(preferredFloorMm, minSpan * 0.11)).toFixed(3),
      ),
      keyDepthMm: Number(
        Math.min(preferredDepthCapMm, Math.max(preferredDepthFloorMm, minBodyThickness * 0.13)).toFixed(3),
      ),
    },
  ];
  const orderedProfileCandidates =
    sizingPolicy.profileSearchOrder === "preferred-first"
      ? [profileCandidates[3]!, profileCandidates[2]!, profileCandidates[1]!, profileCandidates[0]!]
      : profileCandidates;

  const outerMargin = policy.outerEdgeMarginMm + 0.2;
  if (minBodyThickness <= policy.minimumWallMm * 1.05) return Object.freeze([]);

  const preferVerticalCorridors = isTwoPart || spanV >= spanU;
  const sidesToUse: readonly LinearKeySide[] = preferVerticalCorridors ? ["left", "right"] : ["bottom", "top"];

  const attempts: RegistrationLayoutAttempt[] = [];

  for (const profile of orderedProfileCandidates) {
    const { keyWidthMm, keyDepthMm } = profile;
    if (keyWidthMm / 2 > policy.maximumFeatureRadiusMm + 1e-9) continue;
    const leadInMm = Number(Math.min(0.5, keyDepthMm * 0.35).toFixed(3));

    // Protected Intersection Zone around split plane crossings
    const intersectionExclusions: { axisDir: "u" | "v"; coord: number; radius: number }[] = [];
    if (allInterfaces !== undefined && allInterfaces.length > 1) {
      const protectRadius = Math.max(keyWidthMm * 2.0, policy.minimumWallMm * 2.5) + policy.radialClearanceMm;
      for (const otherInt of allInterfaces) {
        if (otherInt.id === moldInterface.id) continue;
        if (otherInt.axis !== moldInterface.axis) {
          const intersectCoordOnU = otherInt.planeCoordinateMm;
          if (intersectCoordOnU >= moldInterface.matingBounds.min[u] && intersectCoordOnU <= moldInterface.matingBounds.max[u]) {
            intersectionExclusions.push({ axisDir: "u", coord: intersectCoordOnU, radius: protectRadius });
          }
          const intersectCoordOnV = otherInt.planeCoordinateMm;
          if (intersectCoordOnV >= moldInterface.matingBounds.min[v] && intersectCoordOnV <= moldInterface.matingBounds.max[v]) {
            intersectionExclusions.push({ axisDir: "v", coord: intersectCoordOnV, radius: protectRadius });
          }
        }
      }
    }

    const plannedFeatures: RegistrationFeature[] = [];

    for (const side of sidesToUse) {
      let startSpan: number;
      let endSpan: number;
      const isVCorridor = (side === "left" || side === "right");
      const lenAxis = isVCorridor ? v : u;
      const fullSpan = isVCorridor ? spanV : spanU;
      const lenMin = moldInterface.matingBounds.min[lenAxis];
      const lenMax = moldInterface.matingBounds.max[lenAxis];

      const edgeCorridorCoord = (): number => {
        if (side === "left") return moldInterface.matingBounds.min[u] + outerMargin + keyWidthMm / 2;
        if (side === "right") return moldInterface.matingBounds.max[u] - outerMargin - keyWidthMm / 2;
        if (side === "bottom") return moldInterface.matingBounds.min[v] + outerMargin + keyWidthMm / 2;
        return moldInterface.matingBounds.max[v] - outerMargin - keyWidthMm / 2;
      };
      const fixedCoord = sizingPolicy.placementStrategy === "cavity-wall-centered"
        ? wallCenteredCoord(side) ?? edgeCorridorCoord()
        : edgeCorridorCoord();

      // Controlled length differential for two-part 180-degree orientation
      // control: the right key is deliberately shorter than the left so the
      // two halves cannot be assembled rotated. That differential only needs
      // a different total inset, not a directionally shifted one -- each
      // key's own inset is still split evenly across both of its ends, so
      // its center lands on the corridor center (matching the single-key
      // case below) instead of being pushed toward one edge. The right key's
      // combined 0.11+0.11 inset matches the previous 0.14+0.08 total, so its
      // length -- and therefore the orientation-control differential -- is
      // unchanged; only its center moved from off-center to centered.
      if (isTwoPart) {
        if (side === "left") {
          startSpan = lenMin + outerMargin + fullSpan * 0.02;
          endSpan = lenMax - outerMargin - fullSpan * 0.02;
        } else {
          startSpan = lenMin + outerMargin + fullSpan * 0.11;
          endSpan = lenMax - outerMargin - fullSpan * 0.11;
        }
      } else {
        startSpan = lenMin + outerMargin + fullSpan * 0.06;
        endSpan = lenMax - outerMargin - fullSpan * 0.06;
      }

      if (endSpan - startSpan < policy.minimumFeatureRadiusMm * 4) {
        continue;
      }

      // Sample along the corridor
      const step = 2.0;
      const safeIntervals: { start: number; end: number }[] = [];
      let currentStart: number | null = null;
      let lastValidCoord: number | null = null;

      for (let c = startSpan; c <= endSpan; c += step) {
        const pt: RegistrationVector3 = {
          x: moldInterface.axis === "x" ? moldInterface.planeCoordinateMm : (u === "x" ? (isVCorridor ? fixedCoord : c) : (isVCorridor ? c : fixedCoord)),
          y: moldInterface.axis === "y" ? moldInterface.planeCoordinateMm : (u === "y" ? (isVCorridor ? fixedCoord : c) : (isVCorridor ? c : fixedCoord)),
          z: moldInterface.axis === "z" ? moldInterface.planeCoordinateMm : (u === "z" ? (isVCorridor ? fixedCoord : c) : (isVCorridor ? c : fixedCoord)),
        };

        // Check split intersection exclusion
        let inIntersectionZone = false;
        for (const excl of intersectionExclusions) {
          if ((excl.axisDir === "v" && isVCorridor) || (excl.axisDir === "u" && !isVCorridor)) {
            if (Math.abs(c - excl.coord) < excl.radius) {
              inIntersectionZone = true;
              break;
            }
          }
        }

        const isSafe = !inIntersectionZone &&
          isPointSafeFromRegions(pt, keyWidthMm / 2, protectedRegions, policy, moldInterface.axis) &&
          isPointSafeFromExclusions(pt, keyWidthMm / 2, exclusionZones, policy.cavitySafetyMarginMm);

        if (isSafe) {
          if (currentStart === null) currentStart = c;
          lastValidCoord = c;
        } else {
          if (currentStart !== null && lastValidCoord !== null) {
            safeIntervals.push({ start: currentStart, end: lastValidCoord });
            currentStart = null;
            lastValidCoord = null;
          }
        }
      }
      if (currentStart !== null && lastValidCoord !== null) {
        safeIntervals.push({ start: currentStart, end: lastValidCoord });
      }

      // Minimum segment viability length
      const minViableSegmentLength = Math.max(keyWidthMm * 1.5, 5.0);
      const validSegments = safeIntervals.filter((seg) => seg.end - seg.start >= minViableSegmentLength);

      const logicalKeyId = `key:${moldInterface.id}:${side}`;
      const towardFemale = femaleBodyId === moldInterface.bodyBId;
      const normalVector = direction(moldInterface.axis, towardFemale ? 1 : -1);

      for (let segIdx = 0; segIdx < validSegments.length; segIdx += 1) {
        const seg = validSegments[segIdx]!;
        const segLength = seg.end - seg.start;
        const startPt: RegistrationVector3 = {
          x: moldInterface.axis === "x" ? moldInterface.planeCoordinateMm : (u === "x" ? (isVCorridor ? fixedCoord : seg.start) : (isVCorridor ? seg.start : fixedCoord)),
          y: moldInterface.axis === "y" ? moldInterface.planeCoordinateMm : (u === "y" ? (isVCorridor ? fixedCoord : seg.start) : (isVCorridor ? seg.start : fixedCoord)),
          z: moldInterface.axis === "z" ? moldInterface.planeCoordinateMm : (u === "z" ? (isVCorridor ? fixedCoord : seg.start) : (isVCorridor ? seg.start : fixedCoord)),
        };
        const endPt: RegistrationVector3 = {
          x: moldInterface.axis === "x" ? moldInterface.planeCoordinateMm : (u === "x" ? (isVCorridor ? fixedCoord : seg.end) : (isVCorridor ? seg.end : fixedCoord)),
          y: moldInterface.axis === "y" ? moldInterface.planeCoordinateMm : (u === "y" ? (isVCorridor ? fixedCoord : seg.end) : (isVCorridor ? seg.end : fixedCoord)),
          z: moldInterface.axis === "z" ? moldInterface.planeCoordinateMm : (u === "z" ? (isVCorridor ? fixedCoord : seg.end) : (isVCorridor ? seg.end : fixedCoord)),
        };
        const anchor: RegistrationVector3 = {
          x: (startPt.x + endPt.x) / 2,
          y: (startPt.y + endPt.y) / 2,
          z: (startPt.z + endPt.z) / 2,
        };
        const dirLen = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y, endPt.z - startPt.z);
        const dirVector: RegistrationVector3 = dirLen > 1e-9 ? {
          x: (endPt.x - startPt.x) / dirLen,
          y: (endPt.y - startPt.y) / dirLen,
          z: (endPt.z - startPt.z) / dirLen,
        } : { x: 0, y: 1, z: 0 };

        plannedFeatures.push(Object.freeze({
          id: `registration-feature:${hash(`${moldInterface.id}:${side}:${segIdx}:${startPt.x}:${startPt.y}:${startPt.z}`)}`,
          interfaceId: moldInterface.id,
          logicalKeyId,
          segmentIndex: segIdx,
          side,
          maleBodyId,
          femaleBodyId,
          startPoint: startPt,
          endPoint: endPt,
          anchor,
          direction: dirVector,
          normal: normalVector,
          geometry: Object.freeze({
            shape: "linear-tongue-and-groove" as const,
            widthMm: keyWidthMm,
            depthMm: keyDepthMm,
            lengthMm: Number(segLength.toFixed(3)),
            taperAngleDeg: 10,
            leadInMm,
            rootFilletMm: 0.5,
          }),
          clearanceMm: policy.radialClearanceMm,
          status: "planned" as const,
          reason: null,
        }));
      }
    }

    if (plannedFeatures.length > 0) {
      attempts.push(Object.freeze({
        candidates: Object.freeze(plannedFeatures),
        radiusMm: keyWidthMm / 2,
        requestedCounts: Object.freeze([plannedFeatures.length]),
      }));
    }
  }

  return Object.freeze(attempts);
}



/**
 * Currently a pass-through: `planRegistrationLayout` already produces `candidates` from a
 * safe-interval scan, so there is no axis/count/minSeparation-aware re-selection implemented here
 * yet. Kept as its own named step (rather than inlined at the call site) so a real spread-selection
 * algorithm has a single, obvious place to land later without changing the caller's contract.
 */
export function selectSpreadLayout(
  candidates: readonly RegistrationFeature[],
): readonly RegistrationFeature[] | null {
  if (candidates.length === 0) return null;
  return Object.freeze(candidates);
}
