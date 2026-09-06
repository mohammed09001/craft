import { useSplitFaceStore } from "../../split-face/splitFace.store";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { FinalMoldResult, MoldDocument, MoldEvaluationState } from "../../workflow";
import { useModelSelectionStore } from "@/features/viewport/modelSelection.store";
import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import {
  createAutomaticSegmentationMoldFrameBounds,
  resolveAutomaticSegmentationMoldClearance,
} from "../../reference-mold-definition/referenceMoldBlock.geometry";
import {
  createWholeMoldBody,
  type MoldBodyData,
} from "../../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../../reference-mold-definition/referenceMoldDefinition.contracts";
import type {
  ProtectedRegion,
  SegmentationIssue,
  SegmentationSourceSnapshot,
} from "../domain/segmentation.contracts";
import { deterministicSegmentationId } from "../domain/segmentationIdentity";

interface MoldSourceState {
  readonly document: MoldDocument;
  readonly evaluation: MoldEvaluationState;
  readonly lastCommittedResult: FinalMoldResult | null;
}

export type SegmentationSourceSnapshotResult =
  | {
      readonly status: "ready";
      readonly snapshot: SegmentationSourceSnapshot;
      readonly definition: ReferenceMoldDefinition;
    }
  | {
      readonly status: "failed";
      readonly reasonCode:
        | "missing_authoritative_geometry"
        | "invalid_authoritative_geometry";
      readonly issues: readonly SegmentationIssue[];
    }
  | {
      readonly status: "stale";
      readonly reasonCode: "stale_source_revision";
      readonly issues: readonly SegmentationIssue[];
    };

function aggregateBounds(
  bodies: FinalMoldResult["bodies"],
): Bounds3 | null {
  if (bodies.length === 0) return null;
  const values = bodies.flatMap((body) => [
    body.bounds.min.x,
    body.bounds.min.y,
    body.bounds.min.z,
    body.bounds.max.x,
    body.bounds.max.y,
    body.bounds.max.z,
  ]);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const bounds: Bounds3 = {
    min: {
      x: Math.min(...bodies.map((body) => body.bounds.min.x)),
      y: Math.min(...bodies.map((body) => body.bounds.min.y)),
      z: Math.min(...bodies.map((body) => body.bounds.min.z)),
    },
    max: {
      x: Math.max(...bodies.map((body) => body.bounds.max.x)),
      y: Math.max(...bodies.map((body) => body.bounds.max.y)),
      z: Math.max(...bodies.map((body) => body.bounds.max.z)),
    },
  };
  return ["x", "y", "z"].every(
    (axis) =>
      bounds.max[axis as keyof Bounds3["max"]] >
      bounds.min[axis as keyof Bounds3["min"]],
  )
    ? bounds
    : null;
}

function sameBounds(left: Bounds3, right: Bounds3): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      Math.abs(left.min[axis] - right.min[axis]) <= 1e-9 &&
      Math.abs(left.max[axis] - right.max[axis]) <= 1e-9,
  );
}

/**
 * Fallback source for a model that has never been through the manual Split
 * Face pipeline -- most notably, an oversized-on-import model, for which
 * that pipeline is correctly absent from the automatic toolbar route.
 * Constructs the one source body Segmentation needs from
 * groundedWorldBounds (modelBounds.store's "one authoritative current
 * physical size of the imported model value", populated on import,
 * independent of whether the user has clicked to select the model in the
 * viewport) + clearanceMm, as a single watertight box spanning the whole K2
 * reference mold block. This is real geometry -- the Segmentation Engine's
 * own planning/scoring/execution then runs against it unmodified; nothing
 * here decides plane count, axis, or sequencing.
 */
function capturePreliminaryWholeBlockSnapshot(): SegmentationSourceSnapshotResult {
  const groundedWorldBounds = useModelBoundsStore.getState().groundedWorldBounds;
  const clearanceMm = useSplitFaceStore.getState().clearanceMm;

  if (groundedWorldBounds === null) {
    return {
      status: "failed",
      reasonCode: "missing_authoritative_geometry",
      issues: [
        {
          severity: "blocker",
          reasonCode: "missing_authoritative_geometry",
          message: "No imported model geometry is available to segment.",
        },
      ],
    };
  }

  // selectedModelId is only used as an identity label here (never for
  // geometry) -- it may legitimately be unset if the user hasn't clicked to
  // select the model yet, which must not block planning.
  const selectedModelId =
    useModelSelectionStore.getState().selection.selectedModelId ?? "imported-model";
  const automaticClearanceMm =
    resolveAutomaticSegmentationMoldClearance(clearanceMm);
  const frameBounds = createAutomaticSegmentationMoldFrameBounds(
    { min: groundedWorldBounds.min, max: groundedWorldBounds.max },
    clearanceMm,
  );
  if (frameBounds === null) {
    return {
      status: "failed",
      reasonCode: "invalid_authoritative_geometry",
      issues: [
        {
          severity: "blocker",
          reasonCode: "invalid_authoritative_geometry",
          message: "The imported model's bounds cannot produce a valid reference mold envelope.",
        },
      ],
    };
  }

  const definitionId = deterministicSegmentationId("preliminary-mold", {
    selectedModelId,
    clearanceMm: automaticClearanceMm,
    frameBounds,
  });
  const definition: ReferenceMoldDefinition = {
    schemaVersion: 1,
    definitionId,
    modelId: selectedModelId,
    coordinateSystem: { units: "millimeters", upAxis: "Z" },
    selectionBoxBounds: frameBounds.selectionBoxBounds,
    referenceMoldBlock: {
      clearanceMm: automaticClearanceMm,
      bounds: frameBounds.referenceMoldBlockBounds,
    },
    moldFrame: {
      frameId: `mold-frame:${definitionId}`,
      version: 1,
      units: "millimeters",
      upAxis: "Z",
      partOffset: frameBounds.partOffset,
      semanticFaces: {
        left: { axis: "x", direction: -1 },
        right: { axis: "x", direction: 1 },
        front: { axis: "y", direction: 1 },
        back: { axis: "y", direction: -1 },
        top: { axis: "z", direction: 1 },
        bottom: { axis: "z", direction: -1 },
      },
    },
    usedFaces: [],
  };
  const geometryVersion = `preliminary:${definitionId}`;
  const body = createWholeMoldBody(definition, {
    id: `${definitionId}:whole-block`,
    name: "Whole Reference Mold Block",
    geometryVersion,
  }) as MoldBodyData & { readonly geometryVersion: string };

  const bodyIdentity = [
    {
      id: body.id,
      geometryVersion,
      bounds: body.bounds,
      triangleCount: body.triangleCount,
      volumeMm3: body.volumeMm3,
    },
  ];
  const bodySignature = deterministicSegmentationId("mold-bodies", bodyIdentity);
  const protectedRegionEvidence = {
    status: "incomplete",
    reason:
      "No committed Split Face result exists yet -- this snapshot represents the undivided reference mold envelope only.",
  } as const;

  return {
    status: "ready",
    snapshot: {
      identity: {
        // Content-derived, not the split-face singleton's document.revision/
        // fingerprint: this preliminary envelope has no real "document" of
        // its own (it exists precisely because the model has never been
        // through Split Face), so those fields would only ever reflect
        // whatever unrelated write last touched the singleton -- including
        // this same segmentation result's own committed-body promotion
        // (adoptCommittedSegmentationResult always bumps document.revision).
        // Reading them here made a just-executed plan mark itself stale the
        // instant its own result was promoted, before ever settling.
        // bodySignature already changes exactly when the geometry/clearance
        // this snapshot actually depends on changes, and stays stable
        // otherwise.
        documentRevision: 0,
        documentFingerprint: bodySignature,
        resultRequestId: `synthetic:${bodySignature}`,
        definitionId,
        modelId: selectedModelId,
        frameId: definition.moldFrame!.frameId,
        bodySignature,
        protectedRegionSignature: deterministicSegmentationId("protected-regions", {
          regions: [],
          evidence: protectedRegionEvidence,
        }),
      },
      bodies: [body],
      aggregateBounds: frameBounds.referenceMoldBlockBounds,
      protectedRegions: [],
      protectedRegionEvidence,
      warnings: [
        {
          severity: "warning",
          reasonCode: "protected_region_evidence_incomplete",
          message: protectedRegionEvidence.reason,
        },
      ],
      units: "millimeters",
      upAxis: "Z",
    },
    definition,
  };
}

function sprueBounds(
  sprue: FinalMoldResult["stages"]["resolvedSprues"][number],
): Bounds3 {
  const radius =
    sprue.profile.mainDiameterMm / 2 +
    sprue.tolerancePolicy.surfaceToleranceMm;
  const end = {
    x: sprue.position.x + sprue.inwardDirection.x * sprue.depthMm,
    y: sprue.position.y + sprue.inwardDirection.y * sprue.depthMm,
    z: sprue.position.z + sprue.inwardDirection.z * sprue.depthMm,
  };
  return {
    min: {
      x: Math.min(sprue.position.x, end.x) - radius,
      y: Math.min(sprue.position.y, end.y) - radius,
      z: Math.min(sprue.position.z, end.z) - radius,
    },
    max: {
      x: Math.max(sprue.position.x, end.x) + radius,
      y: Math.max(sprue.position.y, end.y) + radius,
      z: Math.max(sprue.position.z, end.z) + radius,
    },
  };
}

function registrationBounds(
  feature: NonNullable<
    FinalMoldResult["stages"]["registration"]["report"]
  >["features"][number],
): Bounds3 {
  const margin = Math.max(
    feature.geometry.widthMm / 2,
    feature.geometry.depthMm,
    feature.clearanceMm,
  );
  return {
    min: {
      x: Math.min(feature.startPoint.x, feature.endPoint.x) - margin,
      y: Math.min(feature.startPoint.y, feature.endPoint.y) - margin,
      z: Math.min(feature.startPoint.z, feature.endPoint.z) - margin,
    },
    max: {
      x: Math.max(feature.startPoint.x, feature.endPoint.x) + margin,
      y: Math.max(feature.startPoint.y, feature.endPoint.y) + margin,
      z: Math.max(feature.startPoint.z, feature.endPoint.z) + margin,
    },
  };
}

function protectedRegions(result: FinalMoldResult): readonly ProtectedRegion[] {
  const cavity = result.stages.cavityResult?.cavityTool;
  const cavityRegions: readonly ProtectedRegion[] =
    cavity === undefined || cavity === null
      ? []
      : [
          {
            id: "committed-cavity",
            kind: "cavity-surface",
            source: "cavity",
            provenanceId: result.stages.cavityResult!.sourceSignature,
            bodyIds: result.bodies.map((body) => body.id).sort(),
            bounds: cavity.bounds,
            hardness: "advisory",
            clearanceMm: cavity.clearanceMm,
          },
        ];
  const sprueRegions = result.stages.resolvedSprues.map(
    (sprue): ProtectedRegion => ({
      id: `committed-sprue:${sprue.operationId}`,
      kind: "sprue",
      source: "sprue",
      provenanceId: sprue.operationId,
      bodyIds: [...sprue.targetBodyIds].sort(),
      bounds: sprueBounds(sprue),
      hardness: "advisory",
      clearanceMm: sprue.tolerancePolicy.surfaceToleranceMm,
    }),
  );
  const registrationRegions =
    result.stages.registration.report?.features
      .filter((feature) => feature.status === "generated")
      .map(
        (feature): ProtectedRegion => ({
          id: `committed-registration:${feature.id}`,
          kind: "registration-feature",
          source: "registration",
          provenanceId: feature.id,
          bodyIds: [feature.femaleBodyId, feature.maleBodyId].sort(),
          bounds: registrationBounds(feature),
          hardness: "advisory",
          clearanceMm: feature.clearanceMm,
        }),
      ) ?? [];
  return [...cavityRegions, ...sprueRegions, ...registrationRegions].sort(
    (left, right) => left.id.localeCompare(right.id),
  );
}

export function captureSegmentationSourceSnapshot(
  state: MoldSourceState,
): SegmentationSourceSnapshotResult {
  const result = state.lastCommittedResult;
  const definition = state.document.definition;
  if (result === null || definition === null) {
    return {
      status: "failed",
      reasonCode: "missing_authoritative_geometry",
      issues: [
        {
          severity: "blocker",
          reasonCode: "missing_authoritative_geometry",
          message: "A committed final mold result is required before segmentation planning.",
        },
      ],
    };
  }
  if (
    result.sourceRevision !== state.document.revision ||
    result.sourceFingerprint !== state.document.fingerprint ||
    state.evaluation.phase === "evaluating" ||
    state.evaluation.phase === "stale"
  ) {
    return {
      status: "stale",
      reasonCode: "stale_source_revision",
      issues: [
        {
          severity: "blocker",
          reasonCode: "stale_source_revision",
          message: "The committed mold geometry does not match the current mold document.",
        },
      ],
    };
  }
  const bounds = aggregateBounds(result.bodies);
  if (
    bounds === null ||
    result.bodies.some(
      (body) =>
        body.watertight !== true ||
        body.mesh.positions.length === 0 ||
        body.mesh.indices.length === 0 ||
        body.mesh.positions.length % 3 !== 0 ||
        body.mesh.indices.length % 3 !== 0,
    )
  ) {
    return {
      status: "failed",
      reasonCode: "invalid_authoritative_geometry",
      issues: [
        {
          severity: "blocker",
          reasonCode: "invalid_authoritative_geometry",
          message: "Committed mold bodies are empty or structurally invalid.",
        },
      ],
    };
  }

  const bodyIdentity = result.bodies
    .map((body) => ({
      id: body.id,
      geometryVersion:
        "geometryVersion" in body &&
        typeof body.geometryVersion === "string"
          ? body.geometryVersion
          : null,
      bounds: body.bounds,
      triangleCount: body.triangleCount,
      volumeMm3: body.volumeMm3,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const bodySignature = deterministicSegmentationId(
    "mold-bodies",
    bodyIdentity,
  );
  const frame = definition.moldFrame;
  const regions = protectedRegions(result);
  const protectedRegionEvidence = {
    status: "incomplete",
    reason:
      "The current snapshot provides bounds-level feature evidence only; thin walls, sealing regions, and production split-clearance policy are not yet authoritative.",
  } as const;
  const warnings: readonly SegmentationIssue[] = [
    {
      severity: "warning",
      reasonCode: "protected_region_evidence_incomplete",
      message: protectedRegionEvidence.reason,
    },
  ];

  return {
    status: "ready",
    definition,
    snapshot: {
      identity: {
        documentRevision: result.sourceRevision,
        documentFingerprint: result.sourceFingerprint,
        resultRequestId: result.requestId,
        definitionId: definition.definitionId,
        modelId: definition.modelId,
        frameId: frame?.frameId ?? `${definition.definitionId}:z-up`,
        bodySignature,
        protectedRegionSignature: deterministicSegmentationId(
          "protected-regions",
          { regions, evidence: protectedRegionEvidence },
        ),
      },
      bodies: result.bodies,
      aggregateBounds: bounds,
      protectedRegions: regions,
      protectedRegionEvidence,
      warnings,
      units: "millimeters",
      upAxis: "Z",
    },
  };
}

export function readCurrentSegmentationSourceSnapshot(): SegmentationSourceSnapshotResult {
  const state = useSplitFaceStore.getState();
  const preliminary = capturePreliminaryWholeBlockSnapshot();
  const primary = captureSegmentationSourceSnapshot(state);

  // Once an authoritative result exists, stale or structurally invalid
  // geometry must remain blocking. Rebuilding a preliminary envelope here
  // would hide cancellation/revision failures and could attach a newer plan
  // to older committed state.
  if (
    state.lastCommittedResult !== null &&
    (primary.status === "stale" ||
      (primary.status === "failed" &&
        primary.reasonCode === "invalid_authoritative_geometry"))
  ) {
    return primary;
  }

  // Automatic Segmentation owns a preliminary 25 mm-minimum reference mold
  // envelope even when an older normal-workflow mold exists. A current
  // committed result may still contribute real protected-region evidence,
  // but its smaller body envelope must not replace the printable subject used
  // for fit analysis and section planning.
  if (preliminary.status === "ready") {
    if (primary.status !== "ready") return preliminary;
    // A newly promoted segmentation result has no cavity, sprue, or
    // registration protected regions of its own. Merging that empty primary
    // snapshot would change only identity metadata and immediately stale the
    // plan that just produced it. Keep the preliminary source unchanged until
    // there is actual protected-region information to contribute.
    if (primary.snapshot.protectedRegions.length === 0) return preliminary;
    if (
      !sameBounds(
        primary.definition.referenceMoldBlock.bounds,
        preliminary.definition.referenceMoldBlock.bounds,
      ) ||
      !sameBounds(
        primary.definition.selectionBoxBounds,
        preliminary.definition.selectionBoxBounds,
      )
    ) {
      // Protected regions from another clearance/frame cannot be projected
      // onto the automatic envelope safely. Keep the canonical preliminary
      // source and its explicit incomplete-evidence warning.
      return preliminary;
    }
    const protectedRegions = primary.snapshot.protectedRegions;
    const protectedRegionEvidence = primary.snapshot.protectedRegionEvidence;
    const warnings = Object.freeze([
      ...preliminary.snapshot.warnings,
      ...primary.snapshot.warnings,
    ]);
    return {
      status: "ready",
      definition: preliminary.definition,
      snapshot: {
        ...preliminary.snapshot,
        identity: {
          ...preliminary.snapshot.identity,
          protectedRegionSignature: deterministicSegmentationId(
            "protected-regions",
            { regions: protectedRegions, evidence: protectedRegionEvidence },
          ),
        },
        protectedRegions,
        protectedRegionEvidence,
        warnings,
      },
    };
  }

  return primary;
}

export function currentSegmentationSourceToken(): string | null {
  const snapshot = readCurrentSegmentationSourceSnapshot();
  return snapshot.status === "ready"
    ? deterministicSegmentationId("source-token", snapshot.snapshot.identity)
    : null;
}
