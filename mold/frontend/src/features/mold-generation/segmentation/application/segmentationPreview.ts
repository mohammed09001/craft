import {
  createWholeMoldBody,
  type MoldBodyData,
} from "../../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../../reference-mold-definition/referenceMoldDefinition.contracts";
import { AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY } from "../../registration/registrationSizing.policy";
import type {
  DerivedRegistrationState,
  RegistrationProtectedRegion,
} from "../../registration";
import type {
  ProtectedRegion,
  SegmentationPlan,
  SegmentationSourceSnapshot,
} from "../domain/segmentation.contracts";
import { deterministicSegmentationId } from "../domain/segmentationIdentity";

export interface SegmentationPlanPreview {
  readonly planId: string;
  readonly definition: ReferenceMoldDefinition;
  readonly unkeyedBodies: readonly (MoldBodyData & {
    readonly geometryVersion: string;
  })[];
  readonly registration: DerivedRegistrationState;
}

function previewProtectedRegion(
  region: ProtectedRegion,
): RegistrationProtectedRegion {
  return {
    id: region.id,
    kind:
      region.source === "cavity"
        ? "cavity"
        : region.source === "sprue"
          ? "sprue"
          : "functional",
    bounds: region.bounds,
  };
}

export function buildSegmentationPlanPreviewBodies(input: {
  readonly plan: SegmentationPlan;
  readonly definition: ReferenceMoldDefinition;
}): readonly (MoldBodyData & { readonly geometryVersion: string })[] {
  return [...input.plan.segments]
    .sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id))
    .map((segment) => {
      const segmentDefinition: ReferenceMoldDefinition = {
        ...input.definition,
        definitionId: `${input.definition.definitionId}:preview:${segment.id}`,
        referenceMoldBlock: {
          ...input.definition.referenceMoldBlock,
          bounds: segment.predictedBounds,
        },
      };
      const geometryVersion = deterministicSegmentationId(
        "segmentation-preview-body",
        {
          planId: input.plan.id,
          segmentId: segment.id,
          bounds: segment.predictedBounds,
        },
      );
      return createWholeMoldBody(segmentDefinition, {
        id: `${input.definition.definitionId}:preview:${segment.id}`,
        name: `Planned Mold Section ${segment.ordinal + 1}`,
        geometryVersion,
      }) as MoldBodyData & { readonly geometryVersion: string };
    });
}

/**
 * Produces non-committed display geometry through the canonical Registration
 * lifecycle. Its output is never accepted as a Segmentation execution result
 * or used as final manufacturing input.
 */
export async function generateSegmentationPlanPreview(input: {
  readonly plan: SegmentationPlan;
  readonly source: SegmentationSourceSnapshot;
  readonly definition: ReferenceMoldDefinition;
  readonly unkeyedBodies?: readonly (MoldBodyData & {
    readonly geometryVersion: string;
  })[];
}): Promise<SegmentationPlanPreview> {
  const unkeyedBodies =
    input.unkeyedBodies ?? buildSegmentationPlanPreviewBodies(input);
  // Dynamic import keeps RegistrationGenerationService's manifold/three-mesh-bvh
  // dependency out of the eagerly-loaded main bundle -- segmentation.store.ts
  // (which needs this module) is itself boot-required, but real registration
  // generation only ever runs once a Segmentation preview/commit is requested.
  const { buildRegistrationDependencySnapshot, generateDerivedRegistration } =
    await import("../../registration/registrationLifecycle");
  const baseSnapshot = buildRegistrationDependencySnapshot({
    bodies: unkeyedBodies,
    definition: input.definition,
    cuttingPlanes: [],
    cavityTool: null,
    cavityRevision: null,
    sprues: [],
    manufacturingProfile: null,
    sizingPolicy: AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
  });
  const protectedRegions = input.source.protectedRegions.map(
    previewProtectedRegion,
  );
  const snapshot = {
    ...baseSnapshot,
    revision: deterministicSegmentationId("segmentation-preview-registration", {
      baseRevision: baseSnapshot.revision,
      planId: input.plan.id,
      protectedRegions,
    }),
    protectedRegions: Object.freeze([
      ...baseSnapshot.protectedRegions,
      ...protectedRegions,
    ]),
  };
  const registration = await generateDerivedRegistration(snapshot);
  return {
    planId: input.plan.id,
    definition: input.definition,
    unkeyedBodies,
    registration,
  };
}

export async function generateCommittedSegmentationRegistration(input: {
  readonly plan: SegmentationPlan;
  readonly source: SegmentationSourceSnapshot;
  readonly definition: ReferenceMoldDefinition;
  readonly bodies: readonly (MoldBodyData & {
    readonly geometryVersion: string;
  })[];
}): Promise<DerivedRegistrationState> {
  const { buildRegistrationDependencySnapshot, generateDerivedRegistration } =
    await import("../../registration/registrationLifecycle");
  const baseSnapshot = buildRegistrationDependencySnapshot({
    bodies: input.bodies,
    definition: input.definition,
    cuttingPlanes: [],
    cavityTool: null,
    cavityRevision: null,
    sprues: [],
    manufacturingProfile: null,
    sizingPolicy: AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
  });
  const protectedRegions = input.source.protectedRegions.map(
    previewProtectedRegion,
  );
  return generateDerivedRegistration({
    ...baseSnapshot,
    revision: deterministicSegmentationId("segmentation-registration", {
      baseRevision: baseSnapshot.revision,
      planId: input.plan.id,
      protectedRegions,
    }),
    protectedRegions: Object.freeze([
      ...baseSnapshot.protectedRegions,
      ...protectedRegions,
    ]),
  });
}
