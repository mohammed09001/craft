import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { CuttingPlaneRecord } from "../../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../../reference-mold-definition";
import type { SprueProfileDesignResult } from "../../sprue-generation";
import type { MasterMoldDirection } from "../masterMold.contracts";
import type { AutoWorkingMoldPlan, WorkingMoldPieceCountDiagnostics } from "../planning/masterMoldPlanning.contracts";

/**
 * Execution 05 Article 05: the Master Mold Engine's own contracts.
 *
 * The engine consumes a `MasterMoldProjectSnapshot` -- authoritative project
 * truth captured at click time -- and produces a `MasterMoldEngineResult`:
 * printable Master tooling sets, one per committed mold part, each with a
 * collision-verified release sequence. Every contract here is Master-domain:
 * nothing references Create Cavity state, results, workers, or geometry
 * versions (Execution 05 Sections 6/7.2).
 */

export const MASTER_MOLD_ENGINE_SCHEMA_VERSION = 1 as const;

/** Structural shape of the authoritative canonical imported-part mesh. */
export interface MasterSourcePartMesh {
  readonly modelId: string;
  readonly positions: readonly number[];
  readonly indices: readonly number[];
  /** Column-major 4x4 part-from-local transform (as authored by the import runtime). */
  readonly transform: readonly number[];
  readonly localBounds: Bounds3;
  readonly geometryVersion: string;
  readonly sourceSignature: string;
}

/** One committed mold-part stock body the Master tooling will cast (Execution 05 Section 12: committed project input, never draft geometry). */
export interface MasterCommittedMoldPart {
  readonly id: string;
  readonly name: string;
  readonly mesh: MoldMeshPayload;
  readonly bounds: Bounds3;
  readonly volumeMm3: number;
  /** Neutral content hash of the committed stock body. */
  readonly geometryVersion: string;
}

/** Intent identity binding: proves the cast target was built against exactly these feature intents. */
export interface MasterFeatureIntentIdentity {
  /** Deterministic identity over all Sprue intents affecting the cast target. */
  readonly sprueIntentVersion: string | null;
  /** Deterministic identity over the Final Mold Registration policy in force. */
  readonly registrationPolicyVersion: string | null;
}

export interface MasterMoldProjectSnapshot {
  readonly schemaVersion: typeof MASTER_MOLD_ENGINE_SCHEMA_VERSION;
  /** Stable identity for this snapshot's contents (revision + fingerprint + input versions). */
  readonly snapshotId: string;
  readonly sourceModelGeometryIdentity: string;
  readonly sourcePartMesh: MasterSourcePartMesh;
  readonly committedMoldParts: readonly MasterCommittedMoldPart[];
  /** Mold frame offset placing the part inside the mold coordinate frame. */
  readonly moldPartOffset: { readonly x: number; readonly y: number; readonly z: number };
  readonly moldDefinitionId: string;
  /** The committed mold definition (shared reference-mold-definition contract, Execution 05 Section 6.2). */
  readonly moldDefinition: ReferenceMoldDefinition;
  readonly cuttingPlanes: readonly CuttingPlaneRecord[];
  readonly referenceMoldBlockBounds: Bounds3;
  readonly sprueIntents: readonly MasterSprueIntent[];
  readonly registrationPolicy: MasterRegistrationPolicyIntent | null;
  readonly printerBuildVolume: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly processProfile: MasterCastingProcessProfile;
  readonly projectRevision: number;
  readonly projectFingerprint: string;
}

/** Master-domain projection of one authoritative Sprue intent (Execution 05 Article 06: read from project truth, never from Create Cavity). */
export interface MasterSprueIntent {
  readonly operationId: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly profileDesign: SprueProfileDesignResult;
  readonly creationOrder: number;
}

/** Master-domain projection of the Final Mold Registration intent/policy. */
export interface MasterRegistrationPolicyIntent {
  readonly policyId: string;
  /** True when the committed mold parts derive from Automatic Segmentation provenance. */
  readonly segmentationLineage: boolean;
}

/**
 * Execution 05 Article 11: explicit material/process profile. The engine
 * never invents material-specific shrink/release numbers -- unless a
 * validated profile supplies them, geometric defaults are used and the
 * engine reports `assumedGeometryDefaults` so nothing is silently guessed.
 */
export interface MasterCastingProcessProfile {
  readonly profileId: string;
  /** Rigid cast target (plaster-like) versus flexible (rubber-like). Flexible targets relax one-piece release requirements but the engine still verifies rigid-case removal. */
  readonly flexibleCastTarget: boolean;
  /** Reusable tooling preferred; sacrificial only via explicit user-selected profile (never engine-chosen). */
  readonly reusableToolingPreferred: boolean;
  /** Shrink compensation in mm/mm supplied by the profile/user; null = none applied. */
  readonly shrinkCompensationMmPerMm: number | null;
  readonly minimumToolingWallMm: number;
  /** Release clearance supplied by profile/user; null = geometric default from tolerance policy. */
  readonly releaseClearanceMm: number | null;
  readonly maximumToolingPieceCount: number;
  /** Vent policy: the engine never drills vent holes through functional surfaces automatically. */
  readonly ventRequirementPolicy: "none" | "user-managed";
  /** Execution 06 Article 12: bounded working-mold piece-count cap (the optimizer searches 2..N within this limit). */
  readonly maximumWorkingMoldPieceCount: number;
  /** Execution 06 Article 12: whether a structured sacrificial/flexible-tooling fallback recommendation is permitted when rigid reusable tooling cannot release a rigid cast target. */
  readonly sacrificialToolingPermitted: boolean;
}

/** Execution 05 Article 11 / Execution 06 Article 12: geometric-defaults-only profile; no material numbers invented. */
export const GENERIC_RIGID_CAST_PROFILE: MasterCastingProcessProfile = {
  profileId: "genericRigidCast",
  flexibleCastTarget: false,
  reusableToolingPreferred: true,
  shrinkCompensationMmPerMm: null,
  minimumToolingWallMm: 1,
  releaseClearanceMm: null,
  maximumToolingPieceCount: 4,
  ventRequirementPolicy: "user-managed",
  maximumWorkingMoldPieceCount: 4,
  sacrificialToolingPermitted: true,
};

/** The exact physical Final Mold Part one Master tooling set must cast (Execution 05 Article 06). */
export interface MasterCastTarget {
  readonly moldPartId: string;
  readonly moldPartName: string;
  readonly mesh: MoldMeshPayload;
  readonly bounds: Bounds3;
  readonly volumeMm3: number;
  /** Master-owned geometry identity: neutral fingerprint over cast-target geometry + feature intents + Master provenance (never a Cavity-named signature). */
  readonly geometryVersion: string;
  readonly featureIntents: MasterFeatureIntentIdentity;
  readonly warnings: readonly string[];
}

/** Candidate opening through which casting material enters the Master tooling (Execution 05 Article 07). */
export interface MasterPourFaceCandidate {
  readonly direction: MasterMoldDirection;
  readonly source: "semantic-axis" | "planar-face-normal" | "user-override";
  readonly exposedOpeningAreaMm2: number;
  readonly castingDepthMm: number;
  readonly valid: boolean;
  readonly rejectionReason: string | null;
  readonly score: number;
}

export interface MasterPourFaceDecision {
  readonly selected: MasterMoldDirection | null;
  readonly castingOrientation: MasterMoldDirection | null;
  readonly score: number;
  readonly candidates: readonly MasterPourFaceCandidate[];
  readonly fillabilityWarnings: readonly string[];
  /** Structured vent result: geometry is emitted only when a safe path is proven. */
  readonly ventPlan: MasterVentPlan;
}

export interface MasterVentRecommendation {
  readonly recommendationId: string;
  readonly kind: "vent_required_user_review";
  readonly target: "cast-target";
  readonly pocketIndex: number;
  readonly pocketPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly message: string;
}

export interface MasterVentFeature {
  readonly featureId: string;
  readonly kind: "vent";
  readonly start: { readonly x: number; readonly y: number; readonly z: number };
  readonly end: { readonly x: number; readonly y: number; readonly z: number };
  readonly radiusMm: number;
  /**
   * How the path was proven safe (Execution 07 LOOP 07): an exact mesh ray
   * proof against the cast target and the protected functional surface, or
   * the conservative planning-time AABB check used when no mesh proof was
   * available. Only mesh-verified paths are automatic; anything else stays a
   * user-review recommendation.
   */
  readonly proof: "mesh-verified" | "aabb-conservative";
}

export interface MasterVentPlan {
  readonly status: "clear" | "user-review";
  readonly features: readonly MasterVentFeature[];
  readonly unresolvedRecommendations: readonly MasterVentRecommendation[];
}

/** A direction from which a tooling surface region can move away from the cast target without crossing it (Execution 05 Article 08). */
export interface MasterReleaseDirection {
  readonly direction: MasterMoldDirection;
  /** Fraction of the cast target's boundary surface reachable/accessible along this direction (Chen–Chou–Woo style visibility, sampled deterministically). */
  readonly accessibilityFraction: number;
  /** Grouped undercut severity: total area of re-entrant surface regions this direction cannot release. */
  readonly undercutAreaMm2: number;
}

export interface MasterSurfaceAccessibility {
  readonly directions: readonly MasterReleaseDirection[];
  readonly onePieceReleaseFeasible: boolean;
}

/** A coherent surface region of the cast target assigned to one tooling piece (Lin–Quang style region assignment). */
export interface MasterToolingRegion {
  readonly regionId: string;
  readonly assignedDirection: MasterMoldDirection;
  readonly surfaceAreaMm2: number;
}

export interface MasterPartingCurve {
  readonly regionIds: readonly [string, string];
  readonly kind: "silhouette" | "sharp-boundary" | "region-adjacency";
  readonly samplePoints: readonly { readonly x: number; readonly y: number; readonly z: number }[];
}

export interface MasterPartingSurface {
  readonly kind: "planar" | "ruled";
  readonly axis: MasterMoldDirection;
  readonly coordinateMm: number;
  /**
   * Exact unit plane normal when the parting plane is oblique to the world
   * axes (Execution 07 LOOP 04); undefined = axis-aligned plane.
   */
  readonly planeNormal?: { readonly x: number; readonly y: number; readonly z: number };
  /** Where this candidate came from: geometry-derived sources precede the axis/fraction fallback in the search (Execution 07 LOOP 04). "lock-evidence" marks a localized core's parting face, derived from release-collision or undercut evidence (Execution 07 LOOP 06). */
  readonly origin?: "target-feature" | "tool-feature" | "build-volume" | "oblique-normal-cluster" | "span-fraction" | "target-face" | "lock-evidence";
}

/** Pull direction for tooling pieces: an axis id, the working-mold piece's own assigned (possibly oblique) release direction, or the split plane's normal (oblique splits, Execution 07 LOOP 04). */
export type { MasterMoldDirection };

export type MasterToolingPull = MasterMoldDirection | "+assigned" | "-assigned" | "+plane-normal" | "-plane-normal";

/** One printable tooling piece (Execution 05 Article 10: a real solid, not a conceptual region). */
export interface MasterToolingPiece {
  readonly pieceId: string;
  readonly name: string;
  readonly mesh: MoldMeshPayload;
  readonly bounds: Bounds3;
  readonly volumeMm3: number;
  readonly triangleCount: number;
  readonly watertight: boolean;
  readonly manifold: boolean;
  /** Release direction this piece moves along during disassembly. */
  readonly releaseDirection: MasterToolingPull;
  /** Exact unit pull vector when the release direction is the working-mold assignment (oblique; Execution 06 Article 09). */
  readonly directionVector?: { readonly x: number; readonly y: number; readonly z: number };
  readonly regions: readonly string[];
  /** Master tooling-only alignment features carried by this piece (never Final Mold Registration). */
  readonly toolingRegistrationFeatureIds: readonly string[];
  readonly fitsBuildVolume: boolean;
}

export interface MasterToolingRegistrationFeature {
  readonly featureId: string;
  readonly kind: "pin" | "key" | "natch" | "flange";
  readonly malePieceId: string;
  readonly femalePieceId: string;
}

/** Ordered disassembly proof: each step is collision-verified (Execution 05 Article 08/09). */
export interface MasterReleaseStep {
  readonly stepIndex: number;
  readonly pieceId: string;
  readonly direction: MasterToolingPull;
  /** Exact unit pull vector for non-axis pulls (Execution 06). */
  readonly directionVector?: { readonly x: number; readonly y: number; readonly z: number };
  readonly clearanceDistanceMm: number;
  /** True when the exact Manifold translation sweep found no collision against the cast target and remaining pieces. */
  readonly collisionVerified: boolean;
}

export interface MasterToolingAssembly {
  readonly pieces: readonly MasterToolingPiece[];
  readonly registrationFeatures: readonly MasterToolingRegistrationFeature[];
  /** Core construction provenance for split tooling. */
  readonly coreMode: "split" | "full-negative" | "full-positive" | "localized-removable-core";
  readonly releaseSequence: readonly MasterReleaseStep[];
}

export type MasterReleaseMode = "one-piece" | "multi-piece" | "sacrificial-recommended";

/** One committed mold part's complete Master tooling answer. */
export interface MasterToolingSet {
  readonly moldPartId: string;
  readonly moldPartName: string;
  readonly castTargetVersion: string;
  /**
   * Article 13: identity of this set's cast-target INPUTS (committed stock
   * geometry, source-part geometry, Sprue/Registration intents, process
   * profile, clearance) -- computable without any Boolean work, so a
   * generation run can prove a prior set is still input-identical and reuse
   * it verbatim instead of recomputing it.
   */
  readonly sourceSignature: string;
  readonly pourFaceDecision: MasterPourFaceDecision;
  readonly accessibility: MasterSurfaceAccessibility;
  readonly releaseMode: MasterReleaseMode;
  readonly partingSurfaces: readonly MasterPartingSurface[];
  readonly assembly: MasterToolingAssembly;
  readonly warnings: readonly string[];
  /** Master-owned fingerprint binding set content to snapshot + parameters. */
  readonly fingerprint: string;
}

export type MasterMoldEngineFailureReason =
  | "invalid_snapshot"
  | "invalid_source_geometry"
  | "invalid_source_mesh"
  | "cast_target_invalid"
  | "no_release_plan"
  | "tooling_construction_failed"
  | "build_volume_exceeded"
  | "boolean_failed"
  | "non_manifold_result";

/**
 * Execution 07 LOOP 09: structured failure family. The reason codes say WHAT
 * stopped tooling production; the family says what the stop MEANS, so a
 * bounded-search stop is never presented to the user as a physical
 * impossibility. "budget-exhausted" means the configured search limits were
 * reached (a larger budget may still succeed); "physically-impossible" is
 * reserved for stops with structural evidence against the current context.
 */
export type MasterMoldFailureFamily =
  | "budget-exhausted"
  | "physically-impossible"
  | "invalid-input"
  | "construction-failed";

/** The family classification of a failure reason; the single mapping, shared by engine and UI. */
export function masterMoldFailureFamilyOf(reason: MasterMoldEngineFailureReason): MasterMoldFailureFamily {
  switch (reason) {
    case "invalid_snapshot":
    case "invalid_source_geometry":
    case "invalid_source_mesh":
    case "cast_target_invalid":
      return "invalid-input";
    case "build_volume_exceeded":
      // The part/tooling cannot fit the selected printer: structurally
      // impossible in the current context (not a search-budget outcome).
      return "physically-impossible";
    case "tooling_construction_failed":
    case "boolean_failed":
    case "non_manifold_result":
      return "construction-failed";
    case "no_release_plan":
      // A bounded search that exhausted its piece-count/exact-attempt limits
      // has NOT proven rigid tooling impossible -- it only reports the
      // budget it was given (Execution 07 LOOP 09).
      return "budget-exhausted";
  }
}

export interface MasterMoldFailure {
  readonly moldPartId: string;
  readonly reason: MasterMoldEngineFailureReason;
  readonly family: MasterMoldFailureFamily;
  readonly message: string;
}

/** Execution 06: named engine stages for progress reporting (Article 13.5). */
export type MasterMoldProgressStageName =
  | "analyzing_geometry"
  | "building_accessibility"
  | "optimizing_working_mold"
  | "constructing_working_mold"
  | "planning_master_tooling"
  | "verifying_release"
  | "finalizing";

export const MASTER_MOLD_PROGRESS_STAGES: readonly MasterMoldProgressStageName[] = [
  "analyzing_geometry",
  "building_accessibility",
  "optimizing_working_mold",
  "constructing_working_mold",
  "planning_master_tooling",
  "verifying_release",
  "finalizing",
];

export interface MasterMoldProgressStage {
  readonly stage: MasterMoldProgressStageName;
  readonly stageIndex: number;
  readonly stageCount: number;
  readonly detail: string | null;
  readonly elapsedMs: number;
}

/** Execution 06 Article 13.4: observable budget accounting (the engine reports when it reaches a planning budget). */
export interface MasterMoldBudgetReport {
  candidateDirectionCount: number;
  planningPatchCount: number;
  workingMoldPlanCandidateCount: number;
  workingMoldConstructionAttempts: number;
  pourFaceAnalysisAttempts: number;
  ventAnalysisAttempts: number;
  toolingOnePieceAttempts: number;
  toolingMultiPieceAttempts: number;
  toolingExactPlanAttempts: number;
  releaseVerificationAttempts: number;
  readonly limitsExceeded: string[];
}

/**
 * Execution 06: the autonomous engine's answer for one seed: the
 * Master-owned automatic Working Mold Plan plus one Master tooling set per
 * working-mold piece, with structured failures -- never fake geometry.
 */
export interface MasterMoldEngineResult {
  readonly seedId: string;
  readonly plan: AutoWorkingMoldPlan | null;
  readonly toolingSets: readonly MasterToolingSet[];
  readonly failures: readonly MasterMoldFailure[];
  readonly budget: MasterMoldBudgetReport;
  readonly elapsedMs: number;
  /** Execution 08 LOOP 01: per-piece-count planning evidence, in search order (2 upward, one entry per count actually stepped through). */
  readonly planningDiagnostics: readonly WorkingMoldPieceCountDiagnostics[];
}
