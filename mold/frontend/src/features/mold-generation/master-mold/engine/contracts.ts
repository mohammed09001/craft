import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { CuttingPlaneRecord } from "../../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../../reference-mold-definition";
import type { SprueProfileDesignResult } from "../../sprue-generation";
import type { MasterMoldDirection } from "../masterMold.contracts";

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
}

/** Execution 05 Article 11: geometric-defaults-only profile; no material numbers invented. */
export const GENERIC_RIGID_CAST_PROFILE: MasterCastingProcessProfile = {
  profileId: "genericRigidCast",
  flexibleCastTarget: false,
  reusableToolingPreferred: true,
  shrinkCompensationMmPerMm: null,
  minimumToolingWallMm: 1,
  releaseClearanceMm: null,
  maximumToolingPieceCount: 4,
  ventRequirementPolicy: "user-managed",
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
}

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
  readonly releaseDirection: MasterMoldDirection;
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
  readonly direction: MasterMoldDirection;
  readonly clearanceDistanceMm: number;
  /** True when the exact Manifold translation sweep found no collision against the cast target and remaining pieces. */
  readonly collisionVerified: boolean;
}

export interface MasterToolingAssembly {
  readonly pieces: readonly MasterToolingPiece[];
  readonly registrationFeatures: readonly MasterToolingRegistrationFeature[];
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
  | "cast_target_invalid"
  | "no_release_plan"
  | "tooling_construction_failed"
  | "build_volume_exceeded"
  | "boolean_failed"
  | "non_manifold_result";

export interface MasterMoldFailure {
  readonly moldPartId: string;
  readonly reason: MasterMoldEngineFailureReason;
  readonly message: string;
}

export interface MasterMoldEngineResult {
  readonly snapshotId: string;
  readonly toolingSets: readonly MasterToolingSet[];
  readonly failures: readonly MasterMoldFailure[];
  readonly elapsedMs: number;
}
