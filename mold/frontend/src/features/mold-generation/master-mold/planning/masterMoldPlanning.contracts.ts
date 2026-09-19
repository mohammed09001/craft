import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";

/**
 * Execution 06 Sections 1.2/1.3 + Articles 06-09: Master-owned contracts for
 * the automatic Working Mold Plan and its construction.
 *
 * Three physically different layers are kept distinct:
 *   Source Part            -- the imported mesh (the seed's responsibility)
 *   Auto Working Mold Plan -- how many physical working-mold parts, their
 *                             surfaces, release sequence, and registration
 *   Master Tooling Set     -- printable tooling per working-mold piece
 */

/** Unit vector in world space. */
export interface PlanningVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type CandidateDirectionSource =
  | "world-axis"
  | "principal-axis"
  | "planar-patch-normal"
  | "normal-cluster"
  /** Execution 08 LOOP 08: derived from an unresolved surface region after the initial candidate set failed to cover it. */
  | "adaptive-region";

/** One candidate release direction generated from geometry (Article 04). */
export interface PlanningCandidateDirection {
  readonly directionId: string;
  /** Unit vector. */
  readonly vector: PlanningVector3;
  readonly source: CandidateDirectionSource;
  /** Provenance detail, e.g. which principal axis or cluster seed. */
  readonly origin: string;
}

/** One sampled surface patch of the planning mesh (Article 03). */
export interface PlanningPatch {
  readonly patchIndex: number;
  readonly centroid: PlanningVector3;
  /** Unit outward normal. */
  readonly normal: PlanningVector3;
  readonly areaMm2: number;
  /** Provenance: index of the source triangle in the full-resolution mesh. */
  readonly sourceTriangle: number;
}

/**
 * Compact planning representation of the source surface (Article 03).
 * Planning decides with this; the full-resolution mesh verifies.
 */
export interface PlanningMesh {
  readonly patches: readonly PlanningPatch[];
  /** For each patch, the indexes of adjacent patches (shared mesh vertices). */
  readonly adjacency: readonly (readonly number[])[];
  readonly totalAreaMm2: number;
  readonly bounds: Bounds3;
  readonly sourceGeometryVersion: string;
  /** Cheap planning statistics used by direction scoring. */
  readonly vertexCount: number;
  readonly triangleCount: number;
}

/**
 * Execution 08 LOOP 01: machine-readable per-piece-count planning diagnostic.
 * One entry exists for every piece count the search actually stepped
 * through, whether or not it produced finalists, so a real-part failure
 * ("0 exact construction attempts, 3 piece counts rejected") can be traced
 * to the exact planning stage that rejected each count -- never collapsed
 * into one generic final message.
 */
export interface WorkingMoldPieceCountDiagnostics {
  readonly pieceCount: number;
  /** Finalized (prefix + catch-all direction) candidates evaluated at this count. */
  readonly planningCandidatesGenerated: number;
  /** Of those, the ones that passed feasibility (fully assignable + accessibility gain). */
  readonly planningCandidatesFeasible: number;
  /** Lowest unassignable-patch count seen across all finalized candidates; null when none were generated. */
  readonly bestUnassignablePatchCount: number | null;
  /** null exactly when planningCandidatesFeasible > 0. */
  readonly rejectionReason: string | null;
  /** Total candidate release directions available to this search (post-pruning). */
  readonly candidateDirectionCountUsed: number;
  /** Directions actually offered to the combination/beam step at this depth (Article 13, maxCombinationDirections). */
  readonly combinationDirectionCountUsed: number;
  /** Parting-plane threshold offsets attempted across the directions used at this count. */
  readonly thresholdCountUsed: number;
  /** Execution 08 LOOP 19: surviving prism-prefix candidates retained in the beam at this level, after diversity-aware selection (LOOP 18), bounded by `MASTER_PLANNER_LIMITS.beamWidth`. */
  readonly beamSizeUsed: number;
  /**
   * Execution 08 LOOP 11: the greedy region set-cover estimate -- how many
   * directions a bounded, real coverage-matrix search needs to release
   * every moldable region, independent of piece-count budget or geometric
   * realizability. null when full region coverage is not achievable by any
   * combination of the current candidate directions at all (see
   * `regionSetCoverUncoveredRegionCount`).
   */
  readonly regionSetCoverMinimumPieceEstimate: number | null;
  /** Regions no candidate direction can fully release, even given unlimited picks (never silently dropped). */
  readonly regionSetCoverUncoveredRegionCount: number;
}

/** Connected group of patches a release direction cannot form (Article 05). */
export interface UndercutRegion {
  readonly regionIndex: number;
  readonly patchIndexes: readonly number[];
  readonly areaMm2: number;
}

/**
 * Execution 08 LOOP 05: a coherent mold-planning surface region -- a
 * connected group of planning patches whose normals stay within a bounded
 * cone of each other (Article 04/05 source material graduates from sparse
 * triangle incidence to a real region graph). Direction-INDEPENDENT: this
 * is pure surface topology/geometry, computed once, before any candidate
 * direction or accessibility pass exists.
 */
export interface SurfaceRegion {
  readonly regionId: string;
  readonly regionIndex: number;
  /** Full-resolution source triangle IDs covered by this region's member patches. */
  readonly sourceTriangleIds: readonly number[];
  readonly patchIndexes: readonly number[];
  readonly areaMm2: number;
  readonly centroid: PlanningVector3;
  /** Area-weighted mean of member patch normals (unit vector). */
  readonly averageNormal: PlanningVector3;
  /** Half-angle (deg) of the cone containing every member patch's normal around `averageNormal` -- a curvature/planarity proxy: near 0 = planar, larger = more curved. */
  readonly normalConeHalfAngleDeg: number;
  /** Patch indexes with at least one neighbor outside this region. */
  readonly boundaryPatchIndexes: readonly number[];
  readonly adjacentRegionIndexes: readonly number[];
  /** True when any boundary edge to a neighboring region exceeds the ridge angle threshold (a genuine sharp/ridge feature, not just where clustering happened to stop). */
  readonly hasSharpBoundary: boolean;
}

export interface SurfaceRegionGraph {
  readonly regions: readonly SurfaceRegion[];
  /** Patch index -> owning region index. */
  readonly regionOfPatch: readonly number[];
}

/** Execution 08 LOOP 06: a patch's classification against one direction, from a scale-aware multi-offset probe. */
export type PatchAccessibilityClass = "clear" | "grazing" | "blocked" | "uncertain";

/** Global accessibility of one candidate direction over the planning mesh (Article 05). */
export interface DirectionAccessibility {
  readonly directionId: string;
  /** Per-patch visibility: 1 when the patch can see out along this direction. */
  readonly visible: readonly number[];
  /** Execution 08 LOOP 06: per-patch classification (same index as `visible`), from scale-aware probing at multiple offsets -- distinguishes an unambiguous result from a numerically borderline one. */
  readonly classification: readonly PatchAccessibilityClass[];
  readonly accessibleAreaMm2: number;
  readonly inaccessibleAreaMm2: number;
  /** Number of disconnected inaccessible zones (undercut regions). */
  readonly undercutRegionCount: number;
  /** Largest single undercut region area (mechanical-lock severity proxy). */
  readonly largestUndercutAreaMm2: number;
}

export interface AccessibilityAnalysis {
  readonly directions: readonly PlanningCandidateDirection[];
  readonly perDirection: readonly DirectionAccessibility[];
  /** Patch indexes ranked by area (descending) -- the dominant-direction shortlist order. */
  readonly dominantPatchOrder: readonly number[];
}

/** A half-space region assignment: patches with dot(p, d) >= t belong to the piece. */
export interface PartingPrism {
  readonly directionIndex: number;
  readonly offsetMm: number;
}

/** One planned working-mold piece before construction (Article 06). */
export interface PlannedWorkingMoldPiece {
  /** Release (pull) direction, unit vector. */
  readonly releaseDirection: PlanningVector3;
  readonly directionId: string;
  /**
   * Spatial region: the half-space beyond the prism plane, minus all earlier
   * pieces' half-spaces (ordered partition). null = catch-all remainder.
   */
  readonly prism: PartingPrism | null;
}

/** Feasibility/score evidence for one candidate decomposition (Article 06). */
export interface DecompositionCandidate {
  readonly pieceCount: number;
  readonly pieces: readonly PlannedWorkingMoldPiece[];
  readonly feasible: boolean;
  /** Patches that could not be assigned to any piece's visible direction. */
  readonly unassignablePatchCount: number;
  /** Lower is better; only meaningful among feasible candidates. */
  readonly score: number;
  readonly scoreBreakdown: WorkingMoldPlanScore;
}

/** Quality score of a working-mold plan (Article 06 lexicographic priorities collapsed to weighted penalties; lower is better). */
export interface WorkingMoldPlanScore {
  /** Total area of sliding (near-tangent) cavity walls, a release-friction risk. */
  readonly slidingWallAreaMm2: number;
  /** Count of seam crossings through face interiors (parting-line quality penalty). */
  readonly seamCrossingCount: number;
  /** Area imbalance between the largest and smallest piece (robustness penalty). */
  readonly areaImbalance: number;
  /** Number of piece interfaces (assembly simplicity penalty). */
  readonly interfaceCount: number;
  readonly total: number;
}

/** A parting interface between two planned pieces (Article 07). */
export interface WorkingMoldPartingInterface {
  readonly interfaceId: string;
  readonly pieceAIndex: number;
  readonly pieceBIndex: number;
  /** Sample points along the parting curve on the source surface (silhouette/region boundary). */
  readonly samplePoints: readonly PlanningVector3[];
  readonly kind: "silhouette" | "region-adjacency" | "planar-parting";
}

/** One ordered release step of the working mold (Article 08). */
export interface WorkingMoldReleaseStep {
  readonly stepIndex: number;
  readonly pieceIndex: number;
  readonly direction: PlanningVector3;
  readonly clearanceDistanceMm: number;
  readonly collisionVerified: boolean;
}

/** Final-mold registration between working-mold pieces (NOT Master Tooling Registration; Article 08). */
export interface WorkingMoldRegistrationFeature {
  readonly featureId: string;
  readonly interfaceId: string;
  readonly kind: "pin" | "key";
  readonly malePieceIndex: number;
  readonly femalePieceIndex: number;
  readonly position: PlanningVector3;
  readonly direction: PlanningVector3;
}

export interface WorkingMoldRegistrationPlan {
  readonly features: readonly WorkingMoldRegistrationFeature[];
  /** Why no features were placed (empty features must always carry a reason; Article 10). */
  readonly reason: string | null;
}

export interface PlanningWarning {
  readonly code: string;
  readonly message: string;
  readonly pieceIndex: number | null;
}

/** One physically-cast working-mold piece: the exact geometry Master tooling must produce (Article 08). */
export interface WorkingMoldPieceTarget {
  readonly pieceId: string;
  readonly name: string;
  readonly mesh: MoldMeshPayload;
  readonly bounds: Bounds3;
  readonly volumeMm3: number;
  /** Master-owned geometry identity over the piece mesh + plan provenance. */
  readonly geometryVersion: string;
  readonly assignedDirection: PlanningVector3;
  readonly directionId: string;
  /** 0 = releases first. */
  readonly releaseOrder: number;
  readonly interfaceIds: readonly string[];
  /** Full-resolution triangle count of this piece's solid. */
  readonly triangleCount: number;
  readonly watertight: boolean;
  readonly manifold: boolean;
}

/** The complete Master-owned automatic plan (Section 1.2). */
export interface AutoWorkingMoldPlan {
  readonly sourceGeometryVersion: string;
  readonly moldPieces: readonly WorkingMoldPieceTarget[];
  readonly partingInterfaces: readonly WorkingMoldPartingInterface[];
  readonly releaseSequence: readonly WorkingMoldReleaseStep[];
  readonly registrationPlan: WorkingMoldRegistrationPlan;
  readonly warnings: readonly PlanningWarning[];
  readonly score: WorkingMoldPlanScore;
  /** Evidence trail: why lower piece counts were rejected (Article 06/20). */
  readonly rejectedPieceCounts: readonly { readonly pieceCount: number; readonly reason: string }[];
}

/** Centralized planner budgets (Article 13: measurable candidate-reduction gates; no scattered magic constants). */
export const MASTER_PLANNER_LIMITS = {
  /** Sampled planning patches (bounded ray budget: patches x directions). */
  maxPlanningPatches: 1024,
  /**
   * Execution 08 LOOP 04: below this triangle count, every triangle becomes
   * its own planning patch (no reduction at all -- exact topology, exact
   * adjacency, exact geometric extent for offset/threshold math). At/above
   * it, a bounded topology-preserving spatial+normal clustering reduces to
   * at most `maxPlanningPatches` patches -- cheap enough for planning, but
   * representative-point clustering necessarily loses some geometric extent
   * precision (a real, accepted tradeoff for meshes this large; a future
   * loop may tighten it further). Matches this codebase's existing "large
   * mesh" boundary for other direct/expensive geometry paths
   * (DIRECT_MINKOWSKI_TRIANGLE_LIMIT / DIRECT_CLEARANCE_TRIANGLE_LIMIT).
   * Neither path samples by raw triangle index: a reordered-but-equivalent
   * mesh must plan the same way (Article 15/24).
   */
  fullResolutionPlanningTriangleBudget: 50_000,
  /** Candidate release directions after deduplication (both polarities of each geometry-derived axis). */
  maxCandidateDirections: 32,
  /** Angle (deg) below which two candidate directions are considered duplicates. */
  directionDedupAngleDeg: 10,
  /** Threshold candidates per direction along its own axis (fractions + maximal section). */
  maxPartingThresholdsPerDirection: 6,
  /** Directions kept for multi-piece combination search (k >= 3). */
  maxCombinationDirections: 6,
  /** Exact CSG construction+verification attempts per piece count. */
  maxExactPlansPerPieceCount: 2,
  /** Exact Master tooling planning attempts (ranked pour faces) per working-mold target. */
  maxExactToolingPlansPerTarget: 4,
  /** Upper bound on working-mold pieces (profile may lower it, never raise it). */
  absoluteMaxWorkingMoldPieces: 6,
  /** Maximum recursive Master case splits per working-mold piece (panels = 2^depth). */
  maxToolingSplitDepth: 2,
  /** Orientation seeds for normal clustering (bounded greedy). */
  maxNormalClusterSeeds: 8,
  /** Execution 08 LOOP 05: adjacent patches merge into the same surface region while their normals stay within this angle (deg). */
  surfaceRegionMergeAngleDeg: 20,
  /** Execution 08 LOOP 05: a boundary between two regions is flagged "sharp" when their average normals differ by at least this angle (deg). */
  surfaceRegionRidgeAngleDeg: 45,
  /** Execution 08 LOOP 19: beam width for the ordered-prism search (Article 13: centralized, not a scattered local constant). */
  beamWidth: 8,
  /** Execution 08 LOOP 08: bounded adaptive-direction-discovery rounds (each round re-checks coverage after adding the previous round's directions). */
  maxAdaptiveDirectionRounds: 3,
  /** Execution 08 LOOP 08: unresolved regions inspected per round (largest-area first), bounding the search. */
  maxAdaptiveRegionsPerRound: 4,
  /** Execution 08 LOOP 08: new candidate directions generated per inspected region per round. */
  maxAdaptiveDirectionsPerRegion: 4,
} as const;

/** Working Mold envelope policy (Article 08): Master-owned wall around the source part. */
export const WORKING_MOLD_ENVELOPE_POLICY = {
  /** Minimum wall around the part on every side. */
  minimumWallMm: 5,
  /** Wall also scales with the part's largest dimension (robust handling pressure). */
  largestDimensionFraction: 0.15,
  /** Wall cap so huge parts do not produce absurd envelopes. */
  maximumWallMm: 40,
} as const;

export function workingMoldEnvelopeWallMm(partBounds: Bounds3, minimumToolingWallMm: number): number {
  const largest = Math.max(
    partBounds.max.x - partBounds.min.x,
    partBounds.max.y - partBounds.min.y,
    partBounds.max.z - partBounds.min.z,
  );
  const scaled = largest * WORKING_MOLD_ENVELOPE_POLICY.largestDimensionFraction;
  return Math.min(
    WORKING_MOLD_ENVELOPE_POLICY.maximumWallMm,
    Math.max(WORKING_MOLD_ENVELOPE_POLICY.minimumWallMm, minimumToolingWallMm * 2, scaled),
  );
}

export function inflatedBounds(bounds: Bounds3, wallMm: number): Bounds3 {
  return {
    min: { x: bounds.min.x - wallMm, y: bounds.min.y - wallMm, z: bounds.min.z - wallMm },
    max: { x: bounds.max.x + wallMm, y: bounds.max.y + wallMm, z: bounds.max.z + wallMm },
  };
}
