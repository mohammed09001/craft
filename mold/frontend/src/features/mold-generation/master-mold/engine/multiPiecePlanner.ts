import { verifyDemoldTranslationByVector } from "../masterMoldDemold.verifier";
import type { MasterMoldDirection } from "../masterMold.contracts";
import { axisOf, DIRECTION_VECTORS } from "../masterMoldDirection.analyzer";
import { MASTER_MOLD_DIRECTIONS } from "../masterMold.contracts";
import { getManifoldModule, manifoldFromPayload, boundsFromManifold, createBlankSolid, payloadFromManifold, type ManifoldSolid } from "../../geometry/manifold";
import { meshTopology } from "../../geometry/meshTopology";
import type { GeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import type { MasterCastTarget, MasterPartingSurface, MasterReleaseStep, MasterToolingPiece, MasterToolingPull, MasterToolingRegistrationFeature, MasterVentFeature, MasterVentRecommendation } from "./contracts";
import {
  applyToolingRegistration,
  constructCasePiece,
  pieceFromConstructed,
  safeVentPathsFor,
  TOOLING_CONSTRUCTION_LIMITS,
  toolingTolerancePolicy,
  type CoreAssignmentMode,
  type MasterToolingParameters,
} from "./toolingConstruction";
import { caseEnvelopeFor } from "./toolingConstruction";
import type { LockEvidence } from "./lockEvidence";

/**
 * Execution 06 Article 09: adaptive Master case planner (1..N panels per
 * working-mold piece).
 *
 * Research-grounded sequence (Huang-Gupta-Stoppel accessibility-driven
 * partitioning; Priyadarshi-Gupta guaranteed disassembly): candidate planar
 * parting surfaces are built and EXACTLY verified one at a time; a chunk
 * that cannot release is decomposed further (connected-component split, then
 * bounded bisection) until every chunk has a verified single-direction pull
 * or the centralized budget is exhausted. A chunk is never accepted on an
 * unproven release; the whole attempt is rejected instead.
 */

export const MULTI_PIECE_PLANNER_LIMITS = {
  /** Deterministic split coordinates, as fractions of the target span along each candidate axis. */
  splitFractions: [0.35, 0.5, 0.65] as const,
  /** Candidate split axes (bounded; axis-aligned planar parting surfaces first, per Article 09's manufacturability preference). */
  candidateAxes: ["+X", "+Y", "+Z"] as const,
  /** Volume fraction below which a piece is judged fragile/narrow. */
  fragilePieceVolumeFraction: 0.05,
  /** Deterministic cap on part-derived split levels per axis. */
  maxFeatureLevelsPerAxis: 8,
  /** Core-assignment strategies tried per candidate split (bounded). */
  coreModes: ["split", "full-negative", "full-positive"] as const,
  /** Maximum recursive panel splits per attempt (initial split = depth 1). */
  maxSplitDepth: 2,
  /** Maximum printable panels per attempt (profile cap may lower it, never raise it). */
  absoluteMaxToolingPieces: 4,
  /** Exact release-verification sweeps allowed per attempt before the budget is reported (Article 13.4). */
  maxReleaseVerificationSweeps: 48,
  /** Maximum exact construction+verification attempts per candidate axis (Article 13.4). */
  maxExactAttemptsPerAxis: 2,
  /** Coarse sweep resolution for planner-internal release verification (final proof sweeps keep full resolution). */
  plannerSweepSamples: 8,
  /** Bisection coordinates for a stuck chunk, as fractions of the chunk span along its longest axis. */
  bisectionFractions: [0.5] as const,
  /**
   * Execution 07 LOOP 04: bounded oblique planar split candidates derived
   * from the cast target's dominant oblique normal clusters.
   */
  maxObliqueSplitPlanes: 2,
  /** Total exact construction+verification attempts across all oblique split candidates (core modes count individually). */
  maxObliqueExactAttempts: 4,
  /** Triangles sampled (deterministic stride) when deriving oblique normal clusters. */
  obliqueClusterTriangleSampleCap: 2048,
  /** Normal-cluster seeds retained while deriving oblique split planes. */
  maxObliqueClusterSeeds: 8,
  /** A cluster is oblique only when its normal is at least this far (cosine) from every world axis. */
  obliqueClusterAxisExclusionCosine: 0.985,
  /** Cluster-merge angle (degrees) when grouping triangle normals into oblique split seeds. */
  obliqueClusterMergeAngleDeg: 12,
} as const;

/** Centralized plan-cost weights (Execution 05 Article 09 "Plan Cost" priority order). Lower = better. */
export const PLAN_COST_WEIGHTS = {
  fragilePiecePenalty: 100,
  volumeImbalance: 1,
  partingSurfaceComplexityPlanar: 0,
  printVolumeMm3: 1e-5,
  extraPanelPenalty: 2,
} as const;

export interface MultiPiecePlan {
  readonly pieces: readonly MasterToolingPiece[];
  readonly partingSurface: MasterPartingSurface;
  /** Core construction provenance: identifies which side owns a removable core volume. */
  readonly coreMode: CoreAssignmentMode;
  readonly releaseSequence: readonly MasterReleaseStep[];
  readonly registrationFeatures: readonly MasterToolingRegistrationFeature[];
  /** Vent paths that survived final panel construction and release proof. */
  readonly ventFeatures: readonly MasterVentFeature[];
  /** Non-null when the panel count exceeded what automatic registration can safely align (Article 10: explicit, never silent). */
  readonly registrationNote: string | null;
  readonly cost: number;
}

export interface MultiPiecePlanAttempt {
  readonly plan: MultiPiecePlan | null;
  readonly rejectionReason: string | null;
}

/**
 * Attempts a localized removable insert before escalating a locked target to
 * a global panel decomposition. Core candidate regions come from lock
 * evidence (Execution 07 LOOP 06): the exact release-collision region of the
 * failed one-piece sweep, plus sampled inaccessible patch clusters -- never
 * from arbitrary span fractions. The insert is a real target sub-solid: the
 * case keeps the complete cavity, the insert is removed first, and both
 * motions are checked against the final Manifold solids.
 */
export async function planLocalizedRemovableCore(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  parameters: MasterToolingParameters,
  lockEvidence: LockEvidence,
  assignedDirection?: { readonly x: number; readonly y: number; readonly z: number },
  buildVolume?: { readonly x: number; readonly y: number; readonly z: number },
  ventRecommendations: readonly MasterVentRecommendation[] = [],
): Promise<MultiPiecePlanAttempt> {
  const module = await getManifoldModule();
  const policy = toolingTolerancePolicy(caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm));
  const target = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  let shell: Awaited<ReturnType<typeof constructCasePiece>> | null = null;
  try {
    const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
    const ventFeatures = safeVentPathsFor(castTarget.bounds, caseBounds, castTarget.bounds, ventRecommendations, parameters.caseWallThicknessMm, { targetMesh: castTarget.mesh, protectedMesh: null });
    try {
      shell = await constructCasePiece({ castTarget, pourFace, parameters, coreToolMesh: null, coreMode: "split", ventPaths: ventFeatures });
    } catch {
      return { plan: null, rejectionReason: "localized_core_case_construction_failed" };
    }
    const volumeTolerance = Math.max(policy.affectedVolumeToleranceMm3, castTarget.volumeMm3 * 1e-3);
    const span = {
      x: castTarget.bounds.max.x - castTarget.bounds.min.x,
      y: castTarget.bounds.max.y - castTarget.bounds.min.y,
      z: castTarget.bounds.max.z - castTarget.bounds.min.z,
    };
    // A removable core is a bounded fallback, not a second exhaustive
    // planner. The evidence pull direction is tried first (it is the pull
    // that physically jammed), then the regular bounded candidate order.
    const evidencePulls: PullCandidate[] = [
      { pull: lockEvidence.pullDirection, vector: DIRECTION_VECTORS[lockEvidence.pullDirection], oblique: false },
      { pull: flipDirection(lockEvidence.pullDirection), vector: DIRECTION_VECTORS[flipDirection(lockEvidence.pullDirection)], oblique: false },
    ];
    const pullCandidates = [
      ...evidencePulls,
      ...(['+X', '+Y', '+Z'] as const).flatMap((axis) => pullCandidatesFor(axis, assignedDirection)),
   ].slice(0, 10);
    for (const region of lockEvidence.regions) {
      const partingAxisName = axisOf(lockEvidence.pullDirection);
      const partingSign = lockEvidence.pullVector[partingAxisName === "x" ? 0 : partingAxisName === "y" ? 1 : 2]! > 0 ? 1 : -1;
      let core: ManifoldSolid | null = null;
      let remaining: ManifoldSolid | null = null;
      let regionBox: ManifoldSolid | null = null;
      try {
        regionBox = createBlankSolid(module, region.bounds);
        core = target.intersect(regionBox);
        const coreVolume = core.volume();
        if (core.isEmpty() || coreVolume <= volumeTolerance || coreVolume >= castTarget.volumeMm3 * 0.45) continue;
        remaining = target.subtract(core);
        for (const pull of pullCandidates) {
          const coreProof = verifyDemoldTranslationByVector(shell.solid, core, pull.vector, span[partingAxisName] * 1.25 + parameters.caseWallThicknessMm * 2, policy.surfaceToleranceMm, volumeTolerance, { coarseSampleCount: 12 });
          if (!coreProof.removable) continue;
          const shellProof = verifyDemoldTranslationByVector(shell.solid, remaining, pull.vector, span[partingAxisName] * 1.25 + parameters.caseWallThicknessMm * 2, policy.surfaceToleranceMm, volumeTolerance, { coarseSampleCount: 12 });
          if (!shellProof.removable) continue;
          const contact = shell.solid.intersect(core);
          try {
            if (contact.volume() > volumeTolerance) continue;
          } finally {
            contact.delete();
          }
          const coreMesh = payloadFromManifold(core);
          const coreBounds = boundsFromManifold(core);
          const coreTopology = meshTopology(coreMesh);
          const corePiece: MasterToolingPiece = {
            pieceId: "piece-localized-removable-core",
            name: `${castTarget.moldPartName} Localized Removable Core`,
            mesh: coreMesh,
            bounds: coreBounds,
            volumeMm3: coreVolume,
            triangleCount: coreMesh.indices.length / 3,
            watertight: coreTopology.openEdgeCount === 0,
            manifold: coreTopology.openEdgeCount === 0 && coreTopology.nonManifoldEdgeCount === 0,
            releaseDirection: pull.pull,
            ...(pull.oblique ? { directionVector: { x: pull.vector[0], y: pull.vector[1], z: pull.vector[2] } } : {}),
            regions: ["localized-removable-core"],
            toolingRegistrationFeatureIds: [],
            fitsBuildVolume: buildVolume === undefined || (coreBounds.max.x - coreBounds.min.x <= buildVolume.x && coreBounds.max.y - coreBounds.min.y <= buildVolume.y && coreBounds.max.z - coreBounds.min.z <= buildVolume.z),
          };
          const shellPiece = pieceFromConstructed("piece-case-shell", `${castTarget.moldPartName} Case Shell`, shell, pull.pull, ["case-shell"], [], pull.oblique ? { x: pull.vector[0], y: pull.vector[1], z: pull.vector[2] } : undefined);
          if (!corePiece.fitsBuildVolume || (buildVolume !== undefined && !shellPiece.fitsBuildVolume)) continue;
          const clearance = span[partingAxisName] * 1.25 + parameters.caseWallThicknessMm * 2;
          return {
            plan: {
              pieces: [corePiece, shellPiece],
              partingSurface: {
        kind: "planar",
        // The parting plane is the lock face itself: the seed footprint's far
        // face along the pull, with the normal pointing from the core into
        // the remaining material.
        axis: flipDirection(lockEvidence.pullDirection),
        coordinateMm: partingSign > 0 ? region.seedBounds.min[partingAxisName] : region.seedBounds.max[partingAxisName],
        origin: "lock-evidence",
      },
              coreMode: "localized-removable-core",
              releaseSequence: [
                { stepIndex: 0, pieceId: corePiece.pieceId, direction: pull.pull, ...(pull.oblique ? { directionVector: { x: pull.vector[0], y: pull.vector[1], z: pull.vector[2] } } : {}), clearanceDistanceMm: clearance, collisionVerified: true },
                { stepIndex: 1, pieceId: shellPiece.pieceId, direction: pull.pull, ...(pull.oblique ? { directionVector: { x: pull.vector[0], y: pull.vector[1], z: pull.vector[2] } } : {}), clearanceDistanceMm: clearance, collisionVerified: true },
              ],
              registrationFeatures: [],
              ventFeatures,
              registrationNote: "localized removable core (lock evidence: " + region.evidence + ") is removed before the case shell; no panel interface alignment is required.",
              cost: 0,
            },
            rejectionReason: null,
          };
        }
      } finally {
        remaining?.delete();
        core?.delete();
        regionBox?.delete();
      }
    }
    return { plan: null, rejectionReason: "no_localized_core_release_sequence_verified" };
  } finally {
    shell?.solid.delete();
    target.delete();
  }
}

/** Where a candidate split plane came from. Geometry-derived sources are searched BEFORE the axis/fraction fallback (Execution 07 LOOP 04). */
export type SplitOrigin = "target-feature" | "tool-feature" | "build-volume" | "oblique-normal-cluster" | "span-fraction" | "target-face";

export interface CandidateSplit {
  /** Orientation anchor for pull ordering and sweep-span estimates (nearest world axis to the plane normal). */
  readonly axis: MasterMoldDirection;
  readonly coordinateMm: number;
  readonly origin: SplitOrigin;
  /** Unit plane normal; undefined = axis-aligned plane perpendicular to `axis`. */
  readonly normal?: { readonly x: number; readonly y: number; readonly z: number };
  /** A point on the plane (required for oblique splits, which are defined by normal + point). */
  readonly point?: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * Execution 07 LOOP 04: geometry-driven candidate parting planes, in a fixed
 * deterministic search order with the axis/fraction set as FALLBACK ONLY:
 *   1. build-volume-mandated cut positions (where the case span exceeds the
 *      printer's printable extent along the axis -- hard printer constraints,
 *      searched first so bounded per-axis attempts cannot be starved by
 *      families that the printer forbids anyway),
 *   2. the cast target's own vertex levels along each axis (locked-region
 *      feature planes — the widest-section partings a mold maker would pick),
 *   3. the part-negative tool's vertex levels (the recess's internal feature
 *      planes),
 *   4. bounded oblique planes through the target's dominant oblique normal
 *      clusters (undercut-driven partings the axis families cannot express),
 *   5. fallback: fixed span fractions and the target's own face planes.
 */
export function candidateSplits(castTarget: MasterCastTarget, coreToolMesh: MoldMeshPayload | null, buildVolume?: { readonly x: number; readonly y: number; readonly z: number }): CandidateSplit[] {
  const splits: CandidateSplit[] = [];
  const seen = new Set<string>();
  const pushAxisAligned = (axis: MasterMoldDirection, coordinateMm: number, origin: SplitOrigin) => {
    const key = `${axis}:${Math.round(coordinateMm / LEVEL_QUANTUM_MM)}`;
    if (seen.has(key)) return;
    seen.add(key);
    splits.push({ axis, coordinateMm, origin });
  };
  for (const axis of MULTI_PIECE_PLANNER_LIMITS.candidateAxes) {
    const axisName = axisOf(axis);
    const min = castTarget.bounds.min[axisName];
    const max = castTarget.bounds.max[axisName];
    const span = max - min;
    // Build-volume-mandated cuts first (hard constraint), then the part's own
    // feature planes (locked regions), then the tool's.
    if (buildVolume !== undefined && span > buildVolume[axisName]) {
      pushAxisAligned(axis, min + buildVolume[axisName], "build-volume");
      pushAxisAligned(axis, max - buildVolume[axisName], "build-volume");
    }
    for (const level of featureLevels(castTarget.mesh, axisName, min, max)) pushAxisAligned(axis, level, "target-feature");
    if (coreToolMesh !== null) {
      for (const level of featureLevels(coreToolMesh, axisName, min, max)) pushAxisAligned(axis, level, "tool-feature");
    }
  }
  for (const split of obliqueClusterSplits(castTarget)) splits.push(split);
  // Axis/fraction fallback ONLY: fixed fractions and face planes come last.
  for (const axis of MULTI_PIECE_PLANNER_LIMITS.candidateAxes) {
    const axisName = axisOf(axis);
    const span = castTarget.bounds.max[axisName] - castTarget.bounds.min[axisName];
    for (const fraction of MULTI_PIECE_PLANNER_LIMITS.splitFractions) {
      pushAxisAligned(axis, castTarget.bounds.min[axisName] + span * fraction, "span-fraction");
    }
    pushAxisAligned(axis, castTarget.bounds.min[axisName], "target-face");
    pushAxisAligned(axis, castTarget.bounds.max[axisName], "target-face");
  }
  return splits;
}

interface ObliqueSeed {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  areaMm2: number;
}

/**
 * Bounded oblique planar split candidates (Execution 07 LOOP 04): the cast
 * target's dominant OBLIQUE normal clusters — undercut-driven parting
 * orientations the axis-aligned families cannot express. The cluster decides
 * the plane's ORIENTATION; the plane itself passes through the target's
 * bounds center, so it genuinely cuts the part (a plane through a face's own
 * centroid would be tangent to the face and never part anything). Normals are
 * sign-canonicalized so opposite faces of one orientation family merge into a
 * single candidate. Area-weighted greedy clustering over a deterministic
 * triangle stride; at most `maxObliqueSplitPlanes` planes.
 */
function obliqueClusterSplits(castTarget: MasterCastTarget): CandidateSplit[] {
  const mesh = castTarget.mesh;
  const triangleCount = mesh.indices.length / 3;
  if (triangleCount === 0) return [];
  const stride = Math.max(1, Math.floor(triangleCount / MULTI_PIECE_PLANNER_LIMITS.obliqueClusterTriangleSampleCap));
  const exclusionCosine = MULTI_PIECE_PLANNER_LIMITS.obliqueClusterAxisExclusionCosine;
  const mergeCosine = Math.cos((MULTI_PIECE_PLANNER_LIMITS.obliqueClusterMergeAngleDeg * Math.PI) / 180);
  const seeds: ObliqueSeed[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += stride) {
    const i0 = mesh.indices[triangle * 3]! * 3;
    const i1 = mesh.indices[triangle * 3 + 1]! * 3;
    const i2 = mesh.indices[triangle * 3 + 2]! * 3;
    const ax = mesh.positions[i1]! - mesh.positions[i0]!;
    const ay = mesh.positions[i1 + 1]! - mesh.positions[i0 + 1]!;
    const az = mesh.positions[i1 + 2]! - mesh.positions[i0 + 2]!;
    const bx = mesh.positions[i2]! - mesh.positions[i0]!;
    const by = mesh.positions[i2 + 1]! - mesh.positions[i0 + 1]!;
    const bz = mesh.positions[i2 + 2]! - mesh.positions[i0 + 2]!;
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-12) continue;
    const area = length / 2;
    nx /= length;
    ny /= length;
    nz /= length;
    // Axis-aligned triangles never seed oblique planes.
    if (Math.abs(nx) >= exclusionCosine || Math.abs(ny) >= exclusionCosine || Math.abs(nz) >= exclusionCosine) continue;
    // Sign-canonicalize so a face and its opposite merge into one orientation.
    const flip = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? nx < 0 : Math.abs(ny) >= Math.abs(nz) ? ny < 0 : nz < 0;
    if (flip) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const existing = seeds.find((seed) => seed.nx * nx + seed.ny * ny + seed.nz * nz >= mergeCosine);
    if (existing !== undefined) {
      existing.areaMm2 += area;
      continue;
    }
    if (seeds.length >= MULTI_PIECE_PLANNER_LIMITS.maxObliqueClusterSeeds) continue;
    seeds.push({ nx, ny, nz, areaMm2: area });
  }
  const anchorOf = (x: number, y: number, z: number): MasterMoldDirection => {
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const absZ = Math.abs(z);
    if (absX >= absY && absX >= absZ) return x >= 0 ? "+X" : "-X";
    if (absY >= absZ) return y >= 0 ? "+Y" : "-Y";
    return z >= 0 ? "+Z" : "-Z";
  };
  const center = {
    x: (castTarget.bounds.min.x + castTarget.bounds.max.x) / 2,
    y: (castTarget.bounds.min.y + castTarget.bounds.max.y) / 2,
    z: (castTarget.bounds.min.z + castTarget.bounds.max.z) / 2,
  };
  return seeds
    .sort((first, second) => second.areaMm2 - first.areaMm2 || first.nx - second.nx || first.ny - second.ny || first.nz - second.nz)
    .slice(0, MULTI_PIECE_PLANNER_LIMITS.maxObliqueSplitPlanes)
    .map((seed) => {
      const normal = { x: seed.nx, y: seed.ny, z: seed.nz };
      const axis = anchorOf(normal.x, normal.y, normal.z);
      return {
        axis,
        // Informational projection of the plane point onto the anchor axis.
        coordinateMm: center.x * DIRECTION_VECTORS[axis][0]! + center.y * DIRECTION_VECTORS[axis][1]! + center.z * DIRECTION_VECTORS[axis][2]!,
        origin: "oblique-normal-cluster" as const,
        normal,
        point: center,
      };
    });
}

const LEVEL_QUANTUM_MM = 1e-4;

/** Distinct, quantized, deduplicated vertex coordinates along one axis, clamped to [min,max] and capped deterministically. */
export function featureLevels(mesh: MoldMeshPayload, axisName: "x" | "y" | "z", min: number, max: number): number[] {
  const indexOffset = axisName === "x" ? 0 : axisName === "y" ? 1 : 2;
  const levels = new Set<number>();
  for (let index = indexOffset; index < mesh.positions.length; index += 3) {
    const value = mesh.positions[index]!;
    if (value < min - LEVEL_QUANTUM_MM || value > max + LEVEL_QUANTUM_MM) continue;
    levels.add(Math.round(value / LEVEL_QUANTUM_MM) * LEVEL_QUANTUM_MM);
  }
  return [...levels].sort((a, b) => a - b).slice(0, MULTI_PIECE_PLANNER_LIMITS.maxFeatureLevelsPerAxis);
}

export function flipDirection(direction: MasterMoldDirection): MasterMoldDirection {
  // MASTER_MOLD_DIRECTIONS pairs each axis as (+X,-X),(+Y,-Y),(+Z,-Z): the
  // opposite of index i is the XOR with 1.
  const index = MASTER_MOLD_DIRECTIONS.indexOf(direction);
  return MASTER_MOLD_DIRECTIONS[index ^ 1]!;
}

/** One exact cut plane in a chunk's split lineage (Execution 07 LOOP 05). */
export interface ChunkCutPlane {
  /** Nearest world axis to the cut plane's normal (anchor for bounds/slicing). */
  readonly axis: MasterMoldDirection;
  readonly coordinateMm: number;
  /** Exact unit plane normal; undefined = axis-aligned cut perpendicular to `axis`. */
  readonly normal?: { readonly x: number; readonly y: number; readonly z: number };
  /** A point on the plane (always present for oblique cuts). */
  readonly point?: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * Split provenance for one case chunk (Execution 07 LOOP 05): the exact
 * sequence of cut planes that produced it and which side of each cut the
 * chunk lies on. Two chunks can only touch on the plane of the last cut
 * their lineages disagree about, so provenance -- not AABB proximity --
 * nominates panel interfaces.
 */
export interface ChunkLineage {
  readonly cuts: readonly ChunkCutPlane[];
  /** sides[i]: false = min side of cuts[i], true = max side. */
  readonly sides: readonly boolean[];
}

export interface CaseChunk {
  readonly solid: ManifoldSolid;
  readonly bounds: ReturnType<typeof boundsFromManifold>;
  readonly volumeMm3: number;
  /** How this chunk was cut out of the case; undefined = no recorded provenance. */
  readonly lineage?: ChunkLineage;
}

interface ChunkBudget {
  sweeps: number;
}

/** Deterministic direction order for a chunk's release attempts: the split axis pair first, then the working-mold assignment, then the remaining axes. */
function chunkReleaseDirectionOrder(splitAxis: MasterMoldDirection): MasterMoldDirection[] {
  const opposite = flipDirection(splitAxis);
  const rest = MASTER_MOLD_DIRECTIONS.filter((direction) => direction !== splitAxis && direction !== opposite);
  return [splitAxis, opposite, ...rest];
}

interface PullCandidate {
  readonly pull: MasterToolingPull;
  readonly vector: readonly [number, number, number];
  readonly oblique: boolean;
}

/** Pull candidates for chunks: axis ids plus, when available, the split plane's own normal (oblique splits) and the working-mold piece's own (possibly oblique) assigned release direction. */
function pullCandidatesFor(
  splitAxis: MasterMoldDirection,
  assignedDirection?: { readonly x: number; readonly y: number; readonly z: number },
  planeNormal?: { readonly x: number; readonly y: number; readonly z: number },
): PullCandidate[] {
  const candidates: PullCandidate[] = chunkReleaseDirectionOrder(splitAxis).map((direction) => ({
    pull: direction,
    vector: DIRECTION_VECTORS[direction],
    oblique: false,
  }));
  if (planeNormal !== undefined) {
    candidates.splice(1, 0, { pull: "-plane-normal", vector: [-planeNormal.x, -planeNormal.y, -planeNormal.z], oblique: true });
    candidates.splice(1, 0, { pull: "+plane-normal", vector: [planeNormal.x, planeNormal.y, planeNormal.z], oblique: true });
  }
  if (assignedDirection !== undefined) {
    const length = Math.hypot(assignedDirection.x, assignedDirection.y, assignedDirection.z);
    if (length > 0) {
      const vector = [assignedDirection.x / length, assignedDirection.y / length, assignedDirection.z / length] as const;
      candidates.splice(1, 0, { pull: "-assigned", vector, oblique: true });
      candidates.splice(1, 0, { pull: "+assigned", vector: [-vector[0], -vector[1], -vector[2]], oblique: true });
    }
  }
  return candidates;
}

/** Splits a chunk solid into connected components (ownership: inputs stay valid; returned solids are new). Components inherit the input's lineage: they are disconnected, so they never share an interface. */
async function chunkify(solid: ManifoldSolid, lineage?: ChunkLineage): Promise<CaseChunk[]> {
  const components = solid.decompose();
  if (components.length <= 1) {
    for (const component of components) component.delete();
    return [{ solid: solid.asOriginal(), bounds: boundsFromManifold(solid), volumeMm3: solid.volume(), ...(lineage === undefined ? {} : { lineage }) }];
  }
  return components.map((component) => ({
    solid: component.asOriginal(),
    bounds: boundsFromManifold(component),
    volumeMm3: component.volume(),
    ...(lineage === undefined ? {} : { lineage }),
  }));
}

/** Bounded bisection of a stuck chunk along its longest axis; returns new chunk solids (caller owns them). Children record the exact cut plane, extending the parent's lineage. */
async function bisectChunk(module: Awaited<ReturnType<typeof getManifoldModule>>, chunk: CaseChunk): Promise<CaseChunk[] | null> {
  const axes = (["x", "y", "z"] as const);
  let longest: (typeof axes)[number] = "x";
  let longestSpan = -1;
  for (const axis of axes) {
    const span = chunk.bounds.max[axis] - chunk.bounds.min[axis];
    if (span > longestSpan) {
      longestSpan = span;
      longest = axis;
    }
  }
  if (longestSpan <= 0) return null;

  const results: CaseChunk[] = [];
  for (const fraction of MULTI_PIECE_PLANNER_LIMITS.bisectionFractions) {
    const cut = chunk.bounds.min[longest] + longestSpan * fraction;
    for (const side of [true, false]) {
      const halfBounds = {
        min: { ...chunk.bounds.min },
        max: { ...chunk.bounds.max },
      };
      if (side) halfBounds.min[longest] = cut;
      else halfBounds.max[longest] = cut;
      let halfBox: ManifoldSolid | null = null;
      let piece: ManifoldSolid | null = null;
      try {
        halfBox = createBlankSolid(module, halfBounds);
        piece = chunk.solid.intersect(halfBox);
        if (piece.isEmpty()) continue;
        const parentLineage = chunk.lineage ?? { cuts: [], sides: [] };
        results.push({
          solid: piece.asOriginal(),
          bounds: boundsFromManifold(piece),
          volumeMm3: piece.volume(),
          lineage: {
            cuts: [...parentLineage.cuts, { axis: longest === "x" ? "+X" : longest === "y" ? "+Y" : "+Z", coordinateMm: cut }],
            // side=true built the max side of the cut (see halfBounds above).
            sides: [...parentLineage.sides, side],
          },
        });
      } finally {
        halfBox?.delete();
        piece?.delete();
      }
    }
    if (results.length >= 2) break;
  }
  return results.length >= 2 ? results : null;
}

export interface SequencedChunk {
  readonly chunk: CaseChunk;
  readonly pull: PullCandidate;
}

/**
 * Conservative AABB shortcut: when the chunk's bounding box swept along the
 * pull over the whole clearance never overlaps the obstacle's bounding box,
 * the exact CSG sweep is provably unnecessary. Returns true = trivially
 * clear, false = run the real sweep.
 */
function sweptAabbsNeverOverlap(
  chunk: CaseChunk,
  obstacleBounds: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } },
  vector: readonly [number, number, number],
  clearanceMm: number,
): boolean {
  const eps = 1e-6;
  const axes = ["x", "y", "z"] as const;
  let overlapStart = eps;
  let overlapEnd = clearanceMm;
  for (const axis of axes) {
    const component = vector[axes.indexOf(axis)]!;
    const lo = chunk.bounds.min[axis];
    const hi = chunk.bounds.max[axis];
    const oLo = obstacleBounds.min[axis];
    const oHi = obstacleBounds.max[axis];
    if (Math.abs(component) < 1e-9) {
      // Static axis: ranges must already overlap for any t to overlap.
      if (hi <= oLo || lo >= oHi) return true;
      continue;
    }
    // chunk range at t: [lo + c*t, hi + c*t]. Solve overlap condition.
    let start = overlapStart;
    let end = overlapEnd;
    // Need lo + c*t < oHi AND hi + c*t > oLo.
    if (component > 0) {
      start = Math.max(start, (oHi - hi) / component);
      end = Math.min(end, (oLo - lo) / component);
    } else {
      start = Math.max(start, (oHi - hi) / component);
      end = Math.min(end, (oLo - lo) / component);
    }
    if (start >= end) return true;
    overlapStart = start;
    overlapEnd = end;
  }
  return overlapStart >= overlapEnd;
}

/**
 * Greedy release sequencing: repeatedly pick the chunk with a verified pull
 * against the cast target and all still-assembled siblings. Every removal is
 * an exact sweep (budgeted). Returns null when some chunk can never release.
 */
async function sequenceRelease(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  castTarget: MasterCastTarget,
  chunks: CaseChunk[],
  pullCandidates: readonly PullCandidate[],
  policy: GeometryTolerancePolicy,
  volumeTolerance: number,
  sweepClearanceMm: number,
  budget: ChunkBudget,
  plannerSweepOptions: { readonly coarseSampleCount: number },
): Promise<SequencedChunk[] | null> {
  const targetSolid = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  const remaining = new Set(chunks);
  const sequence: SequencedChunk[] = [];
  try {
    while (remaining.size > 0) {
      let removed: CaseChunk | null = null;
      let removedPull: PullCandidate | null = null;
      for (const chunk of remaining) {
        const volumeFloor = Math.max(policy.affectedVolumeToleranceMm3, castTarget.volumeMm3 * MULTI_PIECE_PLANNER_LIMITS.fragilePieceVolumeFraction * 0.5);
        if (chunk.volumeMm3 < volumeFloor) continue;
        for (const candidate of pullCandidates) {
          if (budget.sweeps >= MULTI_PIECE_PLANNER_LIMITS.maxReleaseVerificationSweeps) return null;
          // Target sweep first (unless the AABB shortcut proves it clear).
          const targetBounds = castTarget.bounds;
          if (!sweptAabbsNeverOverlap(chunk, targetBounds, candidate.vector, sweepClearanceMm)) {
            budget.sweeps += 1;
            const vsTarget = verifyDemoldTranslationByVector(targetSolid, chunk.solid, candidate.vector, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance, plannerSweepOptions);
            if (!vsTarget.removable) continue;
          }
          let vsSiblingsRemovable = true;
          for (const sibling of remaining) {
            if (sibling === chunk) continue;
            if (sweptAabbsNeverOverlap(chunk, sibling.bounds, candidate.vector, sweepClearanceMm)) continue;
            if (budget.sweeps >= MULTI_PIECE_PLANNER_LIMITS.maxReleaseVerificationSweeps) return null;
            budget.sweeps += 1;
            const vsSibling = verifyDemoldTranslationByVector(sibling.solid, chunk.solid, candidate.vector, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance, plannerSweepOptions);
            if (!vsSibling.removable) {
              vsSiblingsRemovable = false;
              break;
            }
          }
          if (vsSiblingsRemovable) {
            removed = chunk;
            removedPull = candidate;
            break;
          }
        }
        if (removed !== null) break;
      }
      if (removed === null || removedPull === null) return null;
      remaining.delete(removed);
      sequence.push({ chunk: removed, pull: removedPull });
    }
    return sequence;
  } finally {
    targetSolid.delete();
  }
}

/**
 * Builds and exactly verifies one candidate panel partition. The primary
 * split is core-aware (Execution 05); any half that cannot release is
 * decomposed (connected components, then bounded bisection) until every
 * panel has a verified single-direction pull (Article 09: 1..N panels).
 */
export async function attemptRecursiveSplit(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  split: CandidateSplit,
  parameters: MasterToolingParameters,
  coreToolMesh: MoldMeshPayload | null,
  coreMode: CoreAssignmentMode,
  maxPieces: number,
  assignedDirection?: { readonly x: number; readonly y: number; readonly z: number },
  functionalBounds?: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } },
  buildVolume?: { readonly x: number; readonly y: number; readonly z: number },
  ventRecommendations: readonly MasterVentRecommendation[] = [],
): Promise<MultiPiecePlanAttempt> {
  const module = await getManifoldModule();
  const policy = toolingTolerancePolicy(caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm));
  const volumeTolerance = Math.max(policy.affectedVolumeToleranceMm3, castTarget.volumeMm3 * 1e-3);
  const sweepClearanceMm =
    (castTarget.bounds.max[axisOf(split.axis)] - castTarget.bounds.min[axisOf(split.axis)]) * TOOLING_CONSTRUCTION_LIMITS.demoldClearanceSafetyFactor + parameters.caseWallThicknessMm * 2;
  const budget: ChunkBudget = { sweeps: 0 };
  const plannerSweepOptions = { coarseSampleCount: MULTI_PIECE_PLANNER_LIMITS.plannerSweepSamples };
  const pullCandidates = pullCandidatesFor(split.axis, assignedDirection, split.normal);
  const splitDescriptor = {
    axis: split.axis,
    coordinateMm: split.coordinateMm,
    ...(split.normal === undefined ? {} : { normal: split.normal }),
    ...(split.point === undefined ? {} : { point: split.point }),
  };
  const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const ventFeatures = safeVentPathsFor(castTarget.bounds, caseBounds, castTarget.bounds, ventRecommendations, parameters.caseWallThicknessMm, { targetMesh: castTarget.mesh, protectedMesh: null });

  const targetSolid = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  let positivePiece;
  try {
    positivePiece = await constructCasePiece({ castTarget, pourFace, parameters, split: { ...splitDescriptor, side: "positive" }, coreToolMesh, coreMode, ventPaths: ventFeatures });
  } catch {
    targetSolid.delete();
    return { plan: null, rejectionReason: "positive_piece_construction_failed" };
  }

  let negativePiece;
  try {
    negativePiece = await constructCasePiece({ castTarget, pourFace, parameters, split: { ...splitDescriptor, side: "negative" }, coreToolMesh, coreMode, ventPaths: ventFeatures });
  } catch {
    positivePiece.solid.delete();
    targetSolid.delete();
    return { plan: null, rejectionReason: "negative_piece_construction_failed" };
  }
  targetSolid.delete();

  // Decompose both halves into releasable chunks (bounded recursion). The
  // initial split plane seeds both sides' lineages (Execution 07 LOOP 05):
  // every panel records the exact cuts that produced it, so interfaces are
  // proven by split provenance rather than AABB proximity.
  const rootLineage = (side: boolean): ChunkLineage => ({ cuts: [splitDescriptor], sides: [side] });
  const collectChunks = async (half: { readonly solid: ManifoldSolid }, lineage: ChunkLineage): Promise<CaseChunk[]> => {
    const chunks = await chunkify(half.solid, lineage);
    let frontier = chunks;
    let depth = 1;
    while (frontier.length > 0 && depth < MULTI_PIECE_PLANNER_LIMITS.maxSplitDepth) {
      const next: CaseChunk[] = [];
      for (const chunk of frontier) {
        const probe = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
        let removable = false;
        try {
          for (const candidate of pullCandidates) {
            if (budget.sweeps >= MULTI_PIECE_PLANNER_LIMITS.maxReleaseVerificationSweeps) break;
            budget.sweeps += 1;
            if (verifyDemoldTranslationByVector(probe, chunk.solid, candidate.vector, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance, plannerSweepOptions).removable) {
              removable = true;
              break;
            }
          }
        } finally {
          probe.delete();
        }
        if (removable || chunk.volumeMm3 < volumeTolerance) {
          next.push(chunk);
          continue;
        }
        const bisected = await bisectChunk(module, chunk);
        chunk.solid.delete();
        if (bisected === null) {
          return [];
        }
        next.push(...bisected);
      }
      frontier = next;
      depth += 1;
    }
    return frontier;
  };

  const positiveChunks = await collectChunks(positivePiece, rootLineage(false));
  const negativeChunks = await collectChunks(negativePiece, rootLineage(true));
  positivePiece.solid.delete();
  negativePiece.solid.delete();
  if (positiveChunks.length === 0 || negativeChunks.length === 0) {
    for (const chunk of [...positiveChunks, ...negativeChunks]) chunk.solid.delete();
    return { plan: null, rejectionReason: "panel_decomposition_exhausted_the_split_budget" };
  }
  const chunks = [...positiveChunks, ...negativeChunks];
  if (chunks.length > Math.min(maxPieces, MULTI_PIECE_PLANNER_LIMITS.absoluteMaxToolingPieces)) {
    for (const chunk of chunks) chunk.solid.delete();
    return { plan: null, rejectionReason: "panel_count_exceeds_the_profile_cap" };
  }

  const sequence = await sequenceRelease(module, castTarget, chunks, pullCandidates, policy, volumeTolerance, sweepClearanceMm, budget, plannerSweepOptions);
  if (sequence === null) {
    for (const chunk of chunks) chunk.solid.delete();
    return { plan: null, rejectionReason: budget.sweeps >= MULTI_PIECE_PLANNER_LIMITS.maxReleaseVerificationSweeps ? "release_verification_budget_exhausted" : "no_panel_release_sequence_verified" };
  }

  // Assembled negative invariant (Article 10) across all panels.
  let assembledOrNull: ManifoldSolid | null = null;
  let overlap: ManifoldSolid | null = null;
  try {
    for (const entry of sequence) {
      assembledOrNull = assembledOrNull === null ? entry.chunk.solid.asOriginal() : assembledOrNull.add(entry.chunk.solid);
    }
    const assembled = assembledOrNull!;
    const target = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
    try {
      overlap = assembled.intersect(target);
      const overlapVolumeMm3 = overlap.volume();
      const envelopeVolume =
        (caseBounds.max.x - caseBounds.min.x) *
        (caseBounds.max.y - caseBounds.min.y) *
        (caseBounds.max.z - caseBounds.min.z);
      const residualVoidVolumeMm3 = envelopeVolume - assembled.volume() - target.volume();
      if (overlapVolumeMm3 > volumeTolerance || residualVoidVolumeMm3 < -volumeTolerance * 10 || residualVoidVolumeMm3 > castTarget.volumeMm3 * 2) {
        for (const chunk of chunks) chunk.solid.delete();
        return { plan: null, rejectionReason: "assembled_negative_mismatch" };
      }
    } finally {
      target.delete();
      overlap?.delete();
      assembled.delete();
    }
  } catch {
    for (const chunk of chunks) chunk.solid.delete();
    return { plan: null, rejectionReason: "assembled_negative_mismatch" };
  }

  // Article 10 registration: automatic pins are applied when the result is a
  // single planar pair; wider panel sets carry an explicit assembly note.
  let pieces: MasterToolingPiece[];
  let registrationFeatures: MasterToolingRegistrationFeature[] = [];
  let registrationNote: string | null = null;
  if (sequence.length === 2) {
    const registered = await applyToolingRegistration({
      castTarget,
      pourFace,
      split: { ...splitDescriptor, side: "positive" },
      parameters,
      ...(functionalBounds === undefined ? {} : { functionalBounds }),
      positivePiece: {
        mesh: payloadFromManifold(sequence[0]!.chunk.solid),
        bounds: sequence[0]!.chunk.bounds,
        volumeMm3: sequence[0]!.chunk.volumeMm3,
        triangleCount: 0,
        solid: sequence[0]!.chunk.solid.asOriginal(),
      },
      negativePiece: {
        mesh: payloadFromManifold(sequence[1]!.chunk.solid),
        bounds: sequence[1]!.chunk.bounds,
        volumeMm3: sequence[1]!.chunk.volumeMm3,
        triangleCount: 0,
        solid: sequence[1]!.chunk.solid.asOriginal(),
      },
    });
    const registeredChunks: { solid: ManifoldSolid; bounds: ReturnType<typeof boundsFromManifold>; volumeMm3: number }[] = [
      { solid: registered.positivePiece.solid, bounds: registered.positivePiece.bounds, volumeMm3: registered.positivePiece.volumeMm3 },
      { solid: registered.negativePiece.solid, bounds: registered.negativePiece.bounds, volumeMm3: registered.negativePiece.volumeMm3 },
    ];
    if (registered.reason !== null) {
      registrationNote = `tooling pins not placed: ${registered.reason}`;
      pieces = sequence.map((entry, index) =>
        pieceFromConstructed(`piece-panel-${index + 1}`, `${castTarget.moldPartName} Tooling Panel ${index + 1}`, {
          mesh: payloadFromManifold(entry.chunk.solid),
          bounds: entry.chunk.bounds,
          volumeMm3: entry.chunk.volumeMm3,
          triangleCount: 0,
          solid: entry.chunk.solid.asOriginal(),
        }, entry.pull.pull, [`${split.axis}`], [], entry.pull.oblique ? { x: entry.pull.vector[0], y: entry.pull.vector[1], z: entry.pull.vector[2] } : undefined),
      );
      for (const chunk of registeredChunks) chunk.solid.delete();
    } else {
      registrationFeatures = [...registered.features];
      pieces = [
        pieceFromConstructed("piece-positive-side", `${castTarget.moldPartName} Tooling Panel 1`, registered.positivePiece, sequence[0]!.pull.pull, [`${split.axis}+`], registered.features.map((feature) => feature.featureId)),
        pieceFromConstructed("piece-negative-side", `${castTarget.moldPartName} Tooling Panel 2`, registered.negativePiece, sequence[1]!.pull.pull, [`${split.axis}-`]),
      ];
      for (const chunk of registeredChunks) chunk.solid.delete();
    }
  } else {
    const registration = await registerMultiPanelInterfaces(
      module,
      castTarget,
      pourFace,
      sequence,
      ventFeatures,
      parameters,
      policy,
      volumeTolerance,
      sweepClearanceMm,
    );
    registrationFeatures = registration.features;
    pieces = sequence.map((entry, index) =>
      pieceFromConstructed(`piece-panel-${index + 1}`, `${castTarget.moldPartName} Tooling Panel ${index + 1}`, {
        mesh: payloadFromManifold(entry.chunk.solid),
        bounds: entry.chunk.bounds,
        volumeMm3: entry.chunk.volumeMm3,
        triangleCount: 0,
        solid: entry.chunk.solid.asOriginal(),
      }, entry.pull.pull, [`${split.axis}`], registrationFeatures.filter((feature) => feature.malePieceId === `piece-panel-${index + 1}`).map((feature) => feature.featureId), entry.pull.oblique ? { x: entry.pull.vector[0], y: entry.pull.vector[1], z: entry.pull.vector[2] } : undefined),
    );
    // Interfaces come from split provenance + exact contact proof (LOOP 05);
    // an interface that stayed unregistered is named with its physical
    // block reason instead of silently implying user-managed alignment.
    const provenInterfaces = provenanceInterfaceCuts(sequence)
      .map((nomination) => `panel-${nomination.first + 1}:panel-${nomination.second + 1}`);
    const blocked = new Set(registration.blockedInterfaces);
    const uncovered = provenInterfaces.filter((pair) => blocked.has(pair));
    registrationNote = registration.features.length > 0 && uncovered.length === 0 && registration.failureReason === null
      ? null
      : `automatic alignment registration remains unresolved on interfaces ${(uncovered.length > 0 ? uncovered : provenInterfaces).join(", ")}; ${registration.failureReason ?? "user-managed alignment is required until each pair's release corridor is proven."}.`;
  }

  for (const chunk of chunks) chunk.solid.delete();
  for (const piece of pieces) void piece;

  if (buildVolume !== undefined && !pieces.every((piece) => piece.bounds.max.x - piece.bounds.min.x <= buildVolume.x && piece.bounds.max.y - piece.bounds.min.y <= buildVolume.y && piece.bounds.max.z - piece.bounds.min.z <= buildVolume.z)) {
    return { plan: null, rejectionReason: "panel_exceeds_build_volume" };
  }

  const totalVolume = pieces.reduce((sum, piece) => sum + piece.volumeMm3, 0);
  const smaller = Math.min(...pieces.map((piece) => piece.volumeMm3));
  const fragile = smaller < castTarget.volumeMm3 * MULTI_PIECE_PLANNER_LIMITS.fragilePieceVolumeFraction;
  const volumes = pieces.map((piece) => piece.volumeMm3);
  const imbalance = (Math.max(...volumes) - Math.min(...volumes)) / Math.max(1, totalVolume);
  const cost =
    (fragile ? PLAN_COST_WEIGHTS.fragilePiecePenalty : 0) +
    PLAN_COST_WEIGHTS.volumeImbalance * imbalance * 10 +
    PLAN_COST_WEIGHTS.partingSurfaceComplexityPlanar +
    PLAN_COST_WEIGHTS.printVolumeMm3 * totalVolume +
    PLAN_COST_WEIGHTS.extraPanelPenalty * (pieces.length - 2);

  const releaseSequence: MasterReleaseStep[] = sequence.map((entry, index) => ({
    stepIndex: index,
    pieceId: pieces[index]!.pieceId,
    direction: entry.pull.pull,
        ...(entry.pull.oblique ? { directionVector: { x: entry.pull.vector[0], y: entry.pull.vector[1], z: entry.pull.vector[2] } } : {}),
    clearanceDistanceMm: sweepClearanceMm,
    collisionVerified: true,
  }));

  return {
    plan: {
      pieces,
      partingSurface: {
        kind: "planar",
        axis: split.axis,
        coordinateMm: split.coordinateMm,
        ...(split.normal === undefined ? {} : { planeNormal: split.normal }),
        origin: split.origin,
      },
      coreMode,
      releaseSequence,
      registrationFeatures,
      ventFeatures,
      registrationNote,
      cost,
    },
    rejectionReason: null,
  };
}

/**
 * Nominates panel interfaces from SPLIT PROVENANCE (Execution 07 LOOP 05),
 * replacing the old AABB-touch heuristic. Chunk lineages are paths in the
 * bisection tree: two disjoint chunks can only touch on the plane of the cut
 * where their paths first diverge (after that they live in disjoint
 * subtrees). Identical paths mean decompose siblings -- disconnected, never
 * an interface. Provenance only NOMINATES; `provenInterfaceAreaMm2` proves
 * real contact exactly.
 */
function provenanceInterfaceCuts(sequence: readonly SequencedChunk[]): { readonly first: number; readonly second: number; readonly cut: ChunkCutPlane }[] {
  const pairs: { first: number; second: number; cut: ChunkCutPlane }[] = [];
  for (let first = 0; first < sequence.length; first += 1) {
    for (let second = first + 1; second < sequence.length; second += 1) {
      const lineageA = sequence[first]!.chunk.lineage;
      const lineageB = sequence[second]!.chunk.lineage;
      if (lineageA === undefined || lineageB === undefined) continue;
      let divergence = -1;
      const shared = Math.min(lineageA.sides.length, lineageB.sides.length);
      for (let depth = 0; depth < shared; depth += 1) {
        if (lineageA.sides[depth] !== lineageB.sides[depth]) {
          divergence = depth;
          break;
        }
      }
      if (divergence < 0) continue;
      const cut = lineageA.cuts[divergence] ?? lineageB.cuts[divergence];
      if (cut === undefined) continue;
      pairs.push({ first, second, cut });
    }
  }
  return pairs;
}

/**
 * Exact contact proof for a nominated interface (Execution 07 LOOP 05):
 * cross-sections of both panels at the nominated cut plane are intersected;
 * a positive area is the real shared interface patch. Returns 0 when the
 * panels never actually meet there (AABB/provenance near-misses).
 */
function provenInterfaceAreaMm2(
  policy: GeometryTolerancePolicy,
  first: CaseChunk,
  second: CaseChunk,
  cut: ChunkCutPlane,
): number {
  const normal: readonly [number, number, number] = cut.normal !== undefined
    ? [cut.normal.x, cut.normal.y, cut.normal.z]
    : DIRECTION_VECTORS[cut.axis];
  const planeOffsetMm = cut.normal !== undefined && cut.point !== undefined
    ? cut.normal.x * cut.point.x + cut.normal.y * cut.point.y + cut.normal.z * cut.point.z
    : cut.coordinateMm;
  const centerA = {
    x: (first.bounds.min.x + first.bounds.max.x) / 2,
    y: (first.bounds.min.y + first.bounds.max.y) / 2,
    z: (first.bounds.min.z + first.bounds.max.z) / 2,
  };
  const centerB = {
    x: (second.bounds.min.x + second.bounds.max.x) / 2,
    y: (second.bounds.min.y + second.bounds.max.y) / 2,
    z: (second.bounds.min.z + second.bounds.max.z) / 2,
  };
  const dotA = centerA.x * normal[0]! + centerA.y * normal[1]! + centerA.z * normal[2]!;
  const dotB = centerB.x * normal[0]! + centerB.y * normal[1]! + centerB.z * normal[2]!;
  const firstIsMinSide = dotA <= dotB;
  // Rotation mapping the plane normal onto +Z. rotate(θx,θy,0) maps
  // +Z→n (the kernel convention verified in LOOP 04), so the inverse is the
  // chained pair Ry(−θy) then Rx(−θx), which carries the plane {n·p = d}
  // exactly onto {z = d}.
  const thetaY = Math.atan2(normal[0]!, normal[2]!);
  const thetaX = -Math.asin(Math.max(-1, Math.min(1, normal[1]!)));
  const rotateToZ = (solid: ManifoldSolid): ManifoldSolid =>
    solid.rotate(0, (-thetaY * 180) / Math.PI, 0).rotate((-thetaX * 180) / Math.PI, 0, 0);
  // Slice just inside each panel so the section is the panel's own face
  // patch (the exact boundary plane itself is numerically ambiguous).
  const eps = Math.max(policy.surfaceToleranceMm, 1e-4) * 10;
  const rotated: ManifoldSolid[] = [];
  const sections: ReturnType<ManifoldSolid["slice"]>[] = [];
  let contact: ReturnType<ReturnType<ManifoldSolid["slice"]>["intersect"]> | null = null;
  try {
    rotated.push(rotateToZ(first.solid.asOriginal()));
    rotated.push(rotateToZ(second.solid.asOriginal()));
    sections.push(rotated[firstIsMinSide ? 0 : 1]!.slice(planeOffsetMm - eps));
    sections.push(rotated[firstIsMinSide ? 1 : 0]!.slice(planeOffsetMm + eps));
    contact = sections[0]!.intersect(sections[1]!);
    return contact.area();
  } finally {
    contact?.delete();
    for (const section of sections) section.delete();
    for (const solid of rotated) solid.delete();
  }
}

/** Minimum printable registration key radius (mm) — same printability floor as the two-panel pin planner. */
const MULTI_PANEL_MIN_PIN_RADIUS_MM = 1;
/** Deterministic key positions across a proven interface patch, as (u, v) fractions of the transverse overlap box. */
const MULTI_PANEL_PIN_POSITIONS = [
  [0.2, 0.2],
  [0.8, 0.8],
  [0.2, 0.8],
  [0.8, 0.2],
  [0.5, 0.5],
] as const;

/** Shortest distance from a point to a segment (3-D). */
function pointToSegmentDistanceMm(
  point: { readonly x: number; readonly y: number; readonly z: number },
  start: { readonly x: number; readonly y: number; readonly z: number },
  end: { readonly x: number; readonly y: number; readonly z: number },
): number {
  const sx = end.x - start.x;
  const sy = end.y - start.y;
  const sz = end.z - start.z;
  const lengthSquared = sx * sx + sy * sy + sz * sz;
  const t = lengthSquared <= 1e-18 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * sx + (point.y - start.y) * sy + (point.z - start.z) * sz) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * sx), point.y - (start.y + t * sy), point.z - (start.z + t * sz));
}

export async function registerMultiPanelInterfaces(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  sequence: SequencedChunk[],
  ventFeatures: readonly MasterVentFeature[],
  parameters: MasterToolingParameters,
  policy: GeometryTolerancePolicy,
  volumeTolerance: number,
  sweepClearanceMm: number,
): Promise<{
  readonly features: MasterToolingRegistrationFeature[];
  readonly failureReason: string | null;
  /** Interfaces that stayed unregistered, with the physical evidence that blocked them. */
  readonly blockedInterfaces: readonly string[];
}> {
  // Key size derived from physical limits (Execution 07 LOOP 05), replacing
  // the old unexplained 0.1 mm cap: a spherical key straddling the interface
  // sockets depth radius/2 into each panel, so the case wall must carry it —
  // clamped by the profile's preferred pin radius, and floored by
  // printability. Per-interface the radius is further clamped by the proven
  // patch extent so the key always sits inside real shared material.
  const wallDerivedRadiusMm = Math.min(TOOLING_CONSTRUCTION_LIMITS.registrationPinRadiusMm, parameters.caseWallThicknessMm / 2);
  if (wallDerivedRadiusMm < MULTI_PANEL_MIN_PIN_RADIUS_MM) {
    return {
      features: [],
      failureReason: `case wall ${parameters.caseWallThicknessMm}mm can carry at most a ${(wallDerivedRadiusMm).toFixed(3)}mm registration key, below the ${MULTI_PANEL_MIN_PIN_RADIUS_MM}mm printable minimum.`,
      blockedInterfaces: [],
    };
  }
  const targetSolid = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  // Pour corridor: the filling column over the cast target's footprint, from
  // the pour face to the outer case face. Keys may never enter it.
  const pourAxisName = axisOf(pourFace);
  const pourDirection = DIRECTION_VECTORS[pourFace];
  const pourKeepOutBounds = {
    min: { x: castTarget.bounds.min.x - wallDerivedRadiusMm, y: castTarget.bounds.min.y - wallDerivedRadiusMm, z: castTarget.bounds.min.z - wallDerivedRadiusMm },
    max: { x: castTarget.bounds.max.x + wallDerivedRadiusMm, y: castTarget.bounds.max.y + wallDerivedRadiusMm, z: castTarget.bounds.max.z + wallDerivedRadiusMm },
  };
  if (pourDirection[pourAxisName === "x" ? 0 : pourAxisName === "y" ? 1 : 2]! > 0) {
    pourKeepOutBounds.min[pourAxisName] = castTarget.bounds.max[pourAxisName];
    pourKeepOutBounds.max[pourAxisName] = Math.max(caseBounds.max[pourAxisName], castTarget.bounds.max[pourAxisName]);
  } else {
    pourKeepOutBounds.max[pourAxisName] = castTarget.bounds.min[pourAxisName];
    pourKeepOutBounds.min[pourAxisName] = Math.min(caseBounds.min[pourAxisName], castTarget.bounds.min[pourAxisName]);
  }
  const pourKeepOut = (() => {
    const bounds = pourKeepOutBounds;
    const axis = pourAxisName;
    // A flush pour face leaves no corridor column inside the case; there is
    // nothing to protect.
    if (bounds.max[axis] - bounds.min[axis] <= 0) return null;
    return createBlankSolid(module, bounds);
  })();
  const features: MasterToolingRegistrationFeature[] = [];
  const blockedInterfaces: string[] = [];
  let failureReason: string | null = null;
  try {
    for (const nomination of provenanceInterfaceCuts(sequence)) {
      const pairLabel = `panel-${nomination.first + 1}:panel-${nomination.second + 1}`;
      if (features.some((feature) => feature.malePieceId === `piece-panel-${nomination.first + 1}` && feature.femalePieceId === `piece-panel-${nomination.second + 1}`)) continue;
      const first = sequence[nomination.first]!.chunk;
      const second = sequence[nomination.second]!.chunk;
      // Exact contact proof at the nominated plane: no proven shared patch,
      // no interface (this is where the old AABB heuristic placed phantom
      // keys). Not an interface at all — not a block — so skip silently.
      const patchAreaMm2 = provenInterfaceAreaMm2(policy, first, second, nomination.cut);
      if (patchAreaMm2 <= volumeTolerance / Math.max(1e-3, sweepClearanceMm)) {
        continue;
      }
      const cutNormal: readonly [number, number, number] = nomination.cut.normal !== undefined
        ? [nomination.cut.normal.x, nomination.cut.normal.y, nomination.cut.normal.z]
        : DIRECTION_VECTORS[nomination.cut.axis];
      const planeOffsetMm = nomination.cut.normal !== undefined && nomination.cut.point !== undefined
        ? nomination.cut.normal.x * nomination.cut.point.x + nomination.cut.normal.y * nomination.cut.point.y + nomination.cut.normal.z * nomination.cut.point.z
        : nomination.cut.coordinateMm;
      const cutAxisName = axisOf(nomination.cut.axis);
      const cutAxisComponent = cutAxisName === "x" ? 0 : cutAxisName === "y" ? 1 : 2;
      const transverseAxes = (["x", "y", "z"] as const).filter((axis) => axis !== cutAxisName);
      const overlapMin = {
        x: Math.max(first.bounds.min.x, second.bounds.min.x),
        y: Math.max(first.bounds.min.y, second.bounds.min.y),
        z: Math.max(first.bounds.min.z, second.bounds.min.z),
      };
      const overlapMax = {
        x: Math.min(first.bounds.max.x, second.bounds.max.x),
        y: Math.min(first.bounds.max.y, second.bounds.max.y),
        z: Math.min(first.bounds.max.z, second.bounds.max.z),
      };
      // The key must sit inside the proven patch with a full radius of
      // margin on every transverse side.
      const patchRadiusCapMm = Math.min(...transverseAxes.map((axis) => (overlapMax[axis] - overlapMin[axis]) / 4));
      const radiusMm = Math.min(wallDerivedRadiusMm, patchRadiusCapMm);
      if (radiusMm < MULTI_PANEL_MIN_PIN_RADIUS_MM) {
        blockedInterfaces.push(pairLabel);
        failureReason ??= `${pairLabel} interface patch (${patchAreaMm2.toFixed(1)} mm²) cannot carry a printable key: patch extent allows at most a ${patchRadiusCapMm.toFixed(3)}mm radius, below the ${MULTI_PANEL_MIN_PIN_RADIUS_MM}mm printable minimum.`;
        continue;
      }
      const ventClearanceMm = parameters.geometryToleranceMm;
      let placed = false;
      let blockedReason: string | null = null;
      for (const [uFraction, vFraction] of MULTI_PANEL_PIN_POSITIONS) {
        const center = { x: 0, y: 0, z: 0 };
        for (const axis of transverseAxes) center[axis] = overlapMin[axis];
        const uAxis = transverseAxes[0]!;
        const vAxis = transverseAxes[1]!;
        center[uAxis] += (overlapMax[uAxis] - overlapMin[uAxis]) * uFraction;
        center[vAxis] += (overlapMax[vAxis] - overlapMin[vAxis]) * vFraction;
        // Solve the cut-axis coordinate so the center lies on the exact
        // plane n·p = d (the anchor axis dominates the normal, so the
        // component is never degenerate).
        let residual = planeOffsetMm;
        for (const axis of transverseAxes) {
          const component = axis === "x" ? 0 : axis === "y" ? 1 : 2;
          residual -= cutNormal[component]! * center[axis];
        }
        center[cutAxisName] = residual / cutNormal[cutAxisComponent]!;
        // Corridor prefilters (exact, cheap): the key may never enter the
        // functional cavity, the pour column, or a vent path.
        const pinProbe = module.Manifold.sphere(radiusMm, TOOLING_CONSTRUCTION_LIMITS.registrationPinSegments).translate(center.x, center.y, center.z);
        let corridorClear = true;
        try {
          const cavityOverlap = pinProbe.intersect(targetSolid);
          try {
            if (cavityOverlap.volume() > volumeTolerance) {
              blockedReason = "the key body intersects the functional cavity";
              corridorClear = false;
            }
          } finally {
            cavityOverlap.delete();
          }
          if (corridorClear && pourKeepOut !== null) {
            const pourOverlap = pinProbe.intersect(pourKeepOut);
            try {
              if (pourOverlap.volume() > volumeTolerance) {
                blockedReason = "the key body enters the pour corridor";
                corridorClear = false;
              }
            } finally {
              pourOverlap.delete();
            }
          }
        } finally {
          pinProbe.delete();
        }
        if (corridorClear) {
          for (const vent of ventFeatures) {
            const distanceMm = pointToSegmentDistanceMm(center, vent.start, vent.end);
            if (distanceMm < radiusMm + vent.radiusMm + ventClearanceMm) {
              blockedReason = "the key body enters a vent path corridor";
              corridorClear = false;
              break;
            }
          }
        }
        if (!corridorClear) continue;

        // Tentative key: male panel gains the hemispherical tenon, female
        // panel the exact socket. Both must stay single connected solids.
        const pin = module.Manifold.sphere(radiusMm, TOOLING_CONSTRUCTION_LIMITS.registrationPinSegments).translate(center.x, center.y, center.z);
        const beforeFirst = first.solid.asOriginal();
        const beforeSecond = second.solid.asOriginal();
        let verified = false;
        try {
          const newFirst = first.solid.add(pin);
          const newSecond = second.solid.subtract(pin);
          first.solid.delete();
          second.solid.delete();
          (first as { solid: ManifoldSolid; bounds: ReturnType<typeof boundsFromManifold>; volumeMm3: number }).solid = newFirst;
          (second as { solid: ManifoldSolid; bounds: ReturnType<typeof boundsFromManifold>; volumeMm3: number }).solid = newSecond;
          (first as { bounds: ReturnType<typeof boundsFromManifold>; volumeMm3: number }).bounds = boundsFromManifold(newFirst);
          (second as { bounds: ReturnType<typeof boundsFromManifold>; volumeMm3: number }).bounds = boundsFromManifold(newSecond);
          (first as { volumeMm3: number }).volumeMm3 = newFirst.volume();
          (second as { volumeMm3: number }).volumeMm3 = newSecond.volume();

          // Topology/connectivity gate: a key may never split a panel into
          // disjoint lumps.
          const firstComponents = newFirst.decompose();
          const secondComponents = newSecond.decompose();
          for (const component of firstComponents) component.delete();
          for (const component of secondComponents) component.delete();
          if (firstComponents.length !== 1 || secondComponents.length !== 1) {
            blockedReason = "the key would leave a disconnected panel";
          } else {
            // Full release re-verification: every panel must still sweep
            // clear of the cast target and of every still-assembled sibling
            // (this is the exact release-corridor proof).
            verified = true;
            for (let entryIndex = 0; entryIndex < sequence.length && verified; entryIndex += 1) {
              const entry = sequence[entryIndex]!;
              const targetProof = verifyDemoldTranslationByVector(targetSolid, entry.chunk.solid, entry.pull.vector, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance);
              if (!targetProof.removable) {
                blockedReason = `panel-${entryIndex + 1} no longer clears the cast target along its pull`;
                verified = false;
                break;
              }
              for (let siblingIndex = entryIndex + 1; siblingIndex < sequence.length; siblingIndex += 1) {
                const siblingProof = verifyDemoldTranslationByVector(sequence[siblingIndex]!.chunk.solid, entry.chunk.solid, entry.pull.vector, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance);
                if (!siblingProof.removable) {
                  blockedReason = `panel-${entryIndex + 1} collides with panel-${siblingIndex + 1} during release`;
                  verified = false;
                  break;
                }
              }
            }
          }
          if (!verified) {
            first.solid.delete();
            second.solid.delete();
            (first as { solid: ManifoldSolid }).solid = beforeFirst;
            (second as { solid: ManifoldSolid }).solid = beforeSecond;
            continue;
          }
          features.push({
            featureId: `multi-panel-pin-${nomination.first}-${nomination.second}-${features.length}`,
            kind: "pin",
            malePieceId: `piece-panel-${nomination.first + 1}`,
            femalePieceId: `piece-panel-${nomination.second + 1}`,
          });
          placed = true;
        } finally {
          pin.delete();
          if (first.solid !== beforeFirst && second.solid !== beforeSecond) {
            beforeFirst.delete();
            beforeSecond.delete();
          }
        }
        if (placed) break;
      }
      if (!placed) {
        blockedInterfaces.push(pairLabel);
        failureReason ??= `${pairLabel}: no key position on the ${patchAreaMm2.toFixed(1)} mm² interface patch cleared the corridors at the derived ${radiusMm.toFixed(2)}mm radius (${blockedReason ?? "all candidate positions rejected"}).`;
      }
    }
  } finally {
    pourKeepOut?.delete();
    targetSolid.delete();
  }
  return { features, failureReason, blockedInterfaces };
}

/**
 * Deterministic bounded best-first search over candidate planar partitions
 * (Execution 07 LOOP 04): candidates come from `candidateSplits` in its
 * geometry-driven order — the target's and tool's own feature planes,
 * build-volume-mandated cuts, and bounded oblique planes from the target's
 * oblique normal clusters — with the fixed span fractions and face planes
 * as FALLBACK ONLY. Exact attempts stay bounded per family (`maxExactAttemptsPerAxis`,
 * `maxObliqueExactAttempts`), and the FIRST fully-verified plan wins
 * (bounded best-first -- Execution 05 Article 09 allows a bounded beam of
 * one). Unmanufacturable targets still exhaust the bounded set with
 * structured evidence.
 */
export async function planMultiPieceTooling(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  parameters: MasterToolingParameters,
  coreToolMesh: MoldMeshPayload | null = null,
  assignedDirection?: { readonly x: number; readonly y: number; readonly z: number },
  functionalBounds?: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } },
  buildVolume?: { readonly x: number; readonly y: number; readonly z: number },
  ventRecommendations: readonly MasterVentRecommendation[] = [],
): Promise<MultiPiecePlanAttempt> {
  let lastRejection: string | null = null;
  const maxPieces = Math.min(parameters.maxToolingPieces, MULTI_PIECE_PLANNER_LIMITS.absoluteMaxToolingPieces);
  const axisAttemptCount = new Map<MasterMoldDirection, number>();
  let obliqueAttempts = 0;

  for (const split of candidateSplits(castTarget, coreToolMesh, buildVolume)) {
    if (split.normal === undefined) {
      const used = axisAttemptCount.get(split.axis) ?? 0;
      if (used >= MULTI_PIECE_PLANNER_LIMITS.maxExactAttemptsPerAxis) continue;
      axisAttemptCount.set(split.axis, used + 1);
    } else {
      // Oblique budget is TOTAL (not per candidate) and exhausting it must
      // not skip the axis/fraction fallback that follows in the list.
      if (obliqueAttempts >= MULTI_PIECE_PLANNER_LIMITS.maxObliqueExactAttempts) continue;
    }
    const modes: CoreAssignmentMode[] = coreToolMesh === null ? ["split"] : [...MULTI_PIECE_PLANNER_LIMITS.coreModes];
    for (const mode of modes) {
      if (split.normal !== undefined) {
        if (obliqueAttempts >= MULTI_PIECE_PLANNER_LIMITS.maxObliqueExactAttempts) break;
        obliqueAttempts += 1;
      }
      const attempt = await attemptRecursiveSplit(castTarget, pourFace, split, parameters, coreToolMesh, mode, maxPieces, assignedDirection, functionalBounds, buildVolume, ventRecommendations);
      if (attempt.plan !== null) {
        return attempt;
      }
      lastRejection = attempt.rejectionReason;
    }
    // A construction failure is evidence about the split plane, not about
    // deeper partitions: try the next candidate. Core modes are bounded
    // alternatives for the same candidate, not new split attempts.
  }

  return { plan: null, rejectionReason: lastRejection ?? "no_candidate_plan_verified" };
}
