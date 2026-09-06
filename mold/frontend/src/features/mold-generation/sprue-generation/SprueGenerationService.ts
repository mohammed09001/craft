import type { Mat4 } from "manifold-3d";

import {
  assertManifoldStatus,
  boundsFromManifold,
  getManifoldModule,
  manifoldFromPayload,
  payloadFromManifold,
  type ManifoldModuleInstance,
  type ManifoldSolid,
  type OriginalTaggedManifold,
} from "../geometry/manifold";
import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import { buildSprueTolerancePolicy } from "./sprueTolerance.policy";
import {
  isValidSprueProfile,
  SPRUE_CIRCULAR_SEGMENTS,
  type SprueProfileDimensions,
} from "./sprueProfile";
import type {
  SerializableVector3,
  SprueFailure,
  SprueFailureReasonCode,
  SprueGenerationInput,
  SprueGenerationResult,
  SprueSourceBody,
  SprueTolerancePolicy,
  SprueUpdatedBody,
} from "./sprueGeneration.contracts";

const failure = (
  reasonCode: SprueFailureReasonCode,
  message: string,
  details?: Readonly<Record<string, string | number | boolean>>,
): SprueFailure => ({ status: "failure", reasonCode, message, ...(details ? { details } : {}) });

const finiteVector = (value: SerializableVector3): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
const dot = (a: SerializableVector3, b: SerializableVector3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const subtract = (a: SerializableVector3, b: SerializableVector3): SerializableVector3 =>
  ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (value: SerializableVector3, amount: number): SerializableVector3 =>
  ({ x: value.x * amount, y: value.y * amount, z: value.z * amount });
const add = (a: SerializableVector3, b: SerializableVector3): SerializableVector3 =>
  ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const cross = (a: SerializableVector3, b: SerializableVector3): SerializableVector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const length = (value: SerializableVector3): number => Math.sqrt(dot(value, value));
const normalize = (value: SerializableVector3): SerializableVector3 | null => {
  const magnitude = length(value);
  return Number.isFinite(magnitude) && magnitude > 1e-12 ? scale(value, 1 / magnitude) : null;
};

function validateMesh(mesh: MoldMeshPayload | null): boolean {
  if (
    mesh === null || mesh.positions.length < 12 || mesh.positions.length % 3 !== 0 ||
    mesh.indices.length < 12 || mesh.indices.length % 3 !== 0 ||
    !mesh.positions.every(Number.isFinite)
  ) return false;
  const vertexCount = mesh.positions.length / 3;
  return mesh.indices.every((index) =>
    Number.isInteger(index) && index >= 0 && index < vertexCount,
  );
}

function maximumProjectedCoordinate(
  mesh: MoldMeshPayload,
  origin: SerializableVector3,
  direction: SerializableVector3,
  initialMaximum: number,
): number {
  let maximum = initialMaximum;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const projection =
      (mesh.positions[index]! - origin.x) * direction.x +
      (mesh.positions[index + 1]! - origin.y) * direction.y +
      (mesh.positions[index + 2]! - origin.z) * direction.z;
    maximum = Math.max(maximum, projection);
  }
  return maximum;
}

function cylinderTransform(axis: SerializableVector3, origin: SerializableVector3): Mat4 {
  const reference = Math.abs(axis.z) < 0.9
    ? { x: 0, y: 0, z: 1 }
    : { x: 0, y: 1, z: 0 };
  const xAxis = normalize(cross(reference, axis))!;
  const yAxis = cross(axis, xAxis);
  return [
    xAxis.x, xAxis.y, xAxis.z, 0,
    yAxis.x, yAxis.y, yAxis.z, 0,
    axis.x, axis.y, axis.z, 0,
    origin.x, origin.y, origin.z, 1,
  ];
}

function createCylinder(
  module: ManifoldModuleInstance,
  radius: number,
  depth: number,
  axis: SerializableVector3,
  origin: SerializableVector3,
): ManifoldSolid {
  const canonical = module.Manifold.cylinder(
    depth,
    radius,
    radius,
    SPRUE_CIRCULAR_SEGMENTS,
    false,
  );
  try {
    const transformed = canonical.transform(cylinderTransform(axis, origin));
    assertManifoldStatus(transformed, "Sprue cylinder construction");
    return transformed;
  } finally {
    canonical.delete();
  }
}

function createProfileTool(
  module: ManifoldModuleInstance,
  profile: SprueProfileDimensions,
  totalDepth: number,
  materialDepth: number,
  axis: SerializableVector3,
  origin: SerializableVector3,
  radialExpansionMm = 0,
): ManifoldSolid {
  const entryNeckLengthMm = Math.min(profile.entryNeckLengthMm, materialDepth);
  const mainSectionDepthMm = totalDepth - entryNeckLengthMm;
  const mainSection = createCylinder(
    module,
    profile.mainDiameterMm / 2 + radialExpansionMm,
    mainSectionDepthMm,
    axis,
    origin,
  );
  const entryNeck = createCylinder(
    module,
    profile.entryNeckDiameterMm / 2 + radialExpansionMm,
    entryNeckLengthMm,
    axis,
    add(origin, scale(axis, mainSectionDepthMm)),
  );
  try {
    const tool = module.Manifold.union([mainSection, entryNeck]);
    assertManifoldStatus(tool, "Sprue profile construction");
    return tool;
  } finally {
    entryNeck.delete();
    mainSection.delete();
  }
}

function bodyVersion(body: SprueSourceBody, operationId: string): string {
  let hash = 2166136261;
  const text = `${body.geometryVersion}:${operationId}`;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return `sprue:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function projectedExtent(
  meshes: readonly MoldMeshPayload[],
  origin: SerializableVector3,
  direction: SerializableVector3,
): number {
  let maximum = Number.NEGATIVE_INFINITY;
  for (const mesh of meshes) {
    maximum = maximumProjectedCoordinate(mesh, origin, direction, maximum);
  }
  return maximum;
}

export function calculateTopCoordinate(
  bodies: readonly SprueSourceBody[],
  topDirection: SerializableVector3,
): number {
  const origin = { x: 0, y: 0, z: 0 };
  let maximum = Number.NEGATIVE_INFINITY;
  for (const body of bodies) {
    maximum = maximumProjectedCoordinate(
      body.mesh,
      origin,
      topDirection,
      maximum,
    );
  }
  return maximum;
}

function firstMeshIntersectionDistance(
  mesh: MoldMeshPayload,
  origin: SerializableVector3,
  direction: SerializableVector3,
  minimumDistance: number,
): number | null {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const vertex = (offset: number): SerializableVector3 => {
      const positionIndex = mesh.indices[index + offset]! * 3;
      return {
        x: mesh.positions[positionIndex]!,
        y: mesh.positions[positionIndex + 1]!,
        z: mesh.positions[positionIndex + 2]!,
      };
    };
    const a = vertex(0);
    const edge1 = subtract(vertex(1), a);
    const edge2 = subtract(vertex(2), a);
    const h = cross(direction, edge2);
    const determinant = dot(edge1, h);
    if (Math.abs(determinant) <= 1e-12) continue;
    const inverseDeterminant = 1 / determinant;
    const fromA = subtract(origin, a);
    const u = inverseDeterminant * dot(fromA, h);
    if (u < 0 || u > 1) continue;
    const q = cross(fromA, edge1);
    const v = inverseDeterminant * dot(direction, q);
    if (v < 0 || u + v > 1) continue;
    const distance = inverseDeterminant * dot(edge2, q);
    if (distance > minimumDistance && distance < closest) closest = distance;
  }
  return Number.isFinite(closest) ? closest : null;
}

function validateInput(input: SprueGenerationInput): SprueFailure | null {
  if (input.targetBodies.length === 0) {
    return failure("SPRUE_TARGET_BODY_MISSING", "No mold bodies exist for Sprue generation.");
  }
  const bodyIds = input.targetBodies.map((body) => body.id);
  if (new Set(bodyIds).size !== bodyIds.length) {
    return failure("SPRUE_RESULT_INVALID", "Sprue target mold body IDs must be unique.");
  }
  if (input.targetBodies.some((body) =>
    !validateMesh(body.mesh) || !Number.isFinite(body.volumeMm3) || body.volumeMm3 <= 0
  )) {
    return failure("SPRUE_RESULT_INVALID", "One or more mold body geometries are unusable.");
  }
  if (!validateMesh(input.cavity)) {
    return failure("SPRUE_CAVITY_MISSING", "Cavity geometry does not exist or is unusable.");
  }
  if (!finiteVector(input.request.position)) {
    return failure("SPRUE_INVALID_PLACEMENT", "Sprue placement coordinates must be finite.");
  }
  if (!isValidSprueProfile(input.request.profileDesign.profile)) {
    return failure("SPRUE_INVALID_PROFILE", "Sprue engineering profile must be finite and valid.");
  }
  if (!finiteVector(input.moldFrame.zAxis)) {
    return failure("SPRUE_INVALID_PLACEMENT", "The mold coordinate frame is invalid.");
  }
  return null;
}

function toleranceBody(bodies: readonly SprueSourceBody[]): SprueSourceBody {
  const min = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY };
  const max = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY };
  for (const body of bodies) {
    min.x = Math.min(min.x, body.bounds.min.x);
    min.y = Math.min(min.y, body.bounds.min.y);
    min.z = Math.min(min.z, body.bounds.min.z);
    max.x = Math.max(max.x, body.bounds.max.x);
    max.y = Math.max(max.y, body.bounds.max.y);
    max.z = Math.max(max.z, body.bounds.max.z);
  }
  return {
    ...bodies[0]!,
    bounds: { min, max },
    volumeMm3: bodies.reduce((sum, body) => sum + body.volumeMm3, 0),
  };
}

/** Generates one engineering-profile Sprue across every intersected mold body without mutating inputs. */
export class SprueGenerationService {
  async generate(input: SprueGenerationInput): Promise<SprueGenerationResult> {
    const invalid = validateInput(input);
    if (invalid !== null) return invalid;
    const bodies = input.targetBodies;
    const cavity = input.cavity!;
    let tolerance: SprueTolerancePolicy;
    try {
      tolerance = buildSprueTolerancePolicy(toleranceBody(bodies), input.geometryToleranceMm);
    } catch {
      return failure("SPRUE_RESULT_INVALID", "Sprue tolerance policy could not be resolved.");
    }
    const profile = input.request.profileDesign.profile;
    if (
      profile.mainDiameterMm < tolerance.linearToleranceMm * 8 ||
      profile.entryNeckDiameterMm < tolerance.linearToleranceMm * 8
    ) {
      return failure("SPRUE_INVALID_PROFILE", "Sprue profile is too small for the geometry tolerance.");
    }
    const top = normalize(input.moldFrame.zAxis)!;
    const inward = scale(top, -1);
    const topCoordinate = calculateTopCoordinate(bodies, top);
    const placementCoordinate = dot(input.request.position, top);
    if (Math.abs(placementCoordinate - topCoordinate) > tolerance.surfaceToleranceMm) {
      return failure("SPRUE_NOT_ON_TOP_FACE", "Sprue placement is not on the canonical top exterior surface.");
    }

    const mainRadius = profile.mainDiameterMm / 2;
    const start = add(input.request.position, scale(top, tolerance.outsideMarginMm));
    const cavityEntryDistance = firstMeshIntersectionDistance(
      cavity,
      input.request.position,
      inward,
      tolerance.surfaceToleranceMm,
    );
    let validationDepth = Number.NEGATIVE_INFINITY;
    for (const body of bodies) {
      validationDepth = maximumProjectedCoordinate(
        body.mesh,
        start,
        inward,
        validationDepth,
      );
    }
    validationDepth = maximumProjectedCoordinate(
      cavity,
      start,
      inward,
      validationDepth,
    );
    validationDepth += tolerance.beyondMarginMm;
    const toolDepth = cavityEntryDistance === null
      ? validationDepth
      : tolerance.outsideMarginMm + cavityEntryDistance;
    if (!Number.isFinite(toolDepth) || toolDepth <= tolerance.outsideMarginMm) {
      return failure("SPRUE_INVALID_PLACEMENT", "A deterministic inward sprue depth could not be derived.");
    }

    const module = await getManifoldModule();
    const bodySolids: ManifoldSolid[] = [];
    let cavitySolid: ManifoldSolid | null = null;
    let tool: ManifoldSolid | null = null;
    try {
      for (const body of bodies) {
        bodySolids.push(manifoldFromPayload(module, body.mesh, tolerance.linearToleranceMm));
      }
      cavitySolid = manifoldFromPayload(module, cavity, tolerance.linearToleranceMm);
      tool = createProfileTool(
        module,
        profile,
        toolDepth,
        toolDepth - tolerance.outsideMarginMm,
        inward,
        start,
      );

      const probeDepth = Math.max(tolerance.surfaceToleranceMm * 8, mainRadius * 0.05);
      const probeOrigin = add(input.request.position, scale(inward, tolerance.surfaceToleranceMm));
      const inletProbe = createCylinder(module, mainRadius, probeDepth, inward, probeOrigin);
      try {
        let inletMaterialVolume = 0;
        for (const bodySolid of bodySolids) {
          const inletMaterial = inletProbe.intersect(bodySolid);
          try {
            inletMaterialVolume += inletMaterial.volume();
          } finally {
            inletMaterial.delete();
          }
        }
        const fillRatio = inletMaterialVolume / inletProbe.volume();
        if (!Number.isFinite(fillRatio) || fillRatio < 0.98) {
          return failure("SPRUE_INLET_OUTSIDE_BODY", "The complete sprue inlet circle must fit inside the top face.");
        }
      } finally {
        inletProbe.delete();
      }

      const affectedIndexes: number[] = [];
      for (let index = 0; index < bodySolids.length; index += 1) {
        const materialIntersection = tool.intersect(bodySolids[index]!);
        try {
          if (materialIntersection.volume() > tolerance.meaningfulVolumeMm3) {
            affectedIndexes.push(index);
          }
        } finally {
          materialIntersection.delete();
        }
      }
      if (affectedIndexes.length === 0) {
        return failure("SPRUE_DOES_NOT_ENTER_BODY", "The proposed sprue does not enter mold material.");
      }

      if (cavityEntryDistance === null) {
        const cavityIntersection = tool.intersect(cavitySolid);
        try {
          if (cavityIntersection.volume() <= tolerance.meaningfulVolumeMm3) {
            const expanded = createProfileTool(
              module,
              profile,
              toolDepth,
              toolDepth - tolerance.outsideMarginMm,
              inward,
              start,
              tolerance.surfaceToleranceMm,
            );
            try {
              const nearContact = expanded.intersect(cavitySolid);
              try {
                if (nearContact.volume() > tolerance.volumeToleranceMm3) {
                  return failure("SPRUE_TANGENTIAL_CAVITY_CONTACT", "The sprue only grazes the cavity within tolerance.");
                }
              } finally {
                nearContact.delete();
              }
            } finally {
              expanded.delete();
            }
          }
        } finally {
          cavityIntersection.delete();
        }
        return failure("SPRUE_DOES_NOT_REACH_CAVITY", "The proposed sprue axis does not reach the actual cavity geometry.");
      }

      const taggedTool = tool.asOriginal();
      const roleMap: Record<number, "sprue-funnel"> = { [(taggedTool as OriginalTaggedManifold).originalID()]: "sprue-funnel" };
      const beforeBodies: SprueSourceBody[] = [];
      const updatedBodies: SprueUpdatedBody[] = [];
      for (const index of affectedIndexes) {
        const body = bodies[index]!;
        const bodySolid = bodySolids[index]!;
        const updated = bodySolid.subtract(taggedTool);
        try {
          assertManifoldStatus(updated, "Sprue subtraction");
          const volume = updated.volume();
          if (updated.isEmpty() || !Number.isFinite(volume) || volume <= tolerance.meaningfulVolumeMm3 || bodySolid.volume() - volume <= tolerance.meaningfulVolumeMm3) {
            return failure("SPRUE_RESULT_INVALID", "Sprue subtraction produced unusable geometry.");
          }
          const mesh = payloadFromManifold(updated, roleMap);
          if (!validateMesh(mesh)) {
            return failure("SPRUE_RESULT_INVALID", "Sprue subtraction produced non-finite or invalid mesh data.");
          }
          const bounds = boundsFromManifold(updated);
          beforeBodies.push(structuredClone(body));
          updatedBodies.push({
            ...structuredClone(body),
            bounds,
            centroid: {
              x: (bounds.min.x + bounds.max.x) / 2,
              y: (bounds.min.y + bounds.max.y) / 2,
              z: (bounds.min.z + bounds.max.z) / 2,
            },
            mesh,
            triangleCount: updated.numTri(),
            volumeMm3: volume,
            geometryVersion: bodyVersion(body, input.request.operationId),
            sprueOperationId: input.request.operationId,
          });
        } finally {
          updated.delete();
        }
      }
      const replacedBodyIds = Object.freeze(affectedIndexes.map((index) => bodies[index]!.id));
      return {
          status: "success",
          operationId: input.request.operationId,
          sourceRevision: input.request.moldRevision,
          sprue: {
            operationId: input.request.operationId,
            targetBodyIds: replacedBodyIds,
            position: structuredClone(input.request.position),
            inwardDirection: inward,
            profile,
            depthMm: cavityEntryDistance,
            circularSegments: SPRUE_CIRCULAR_SEGMENTS,
            coordinateSpace: "mold-local",
            moldFrameId: input.moldFrame.frameId,
            tolerancePolicy: tolerance,
          },
          beforeBodies: Object.freeze(beforeBodies),
          updatedBodies: Object.freeze(updatedBodies),
          replacedBodyIds,
          warnings: [],
        };
    } catch (error) {
      return failure(
        "SPRUE_BOOLEAN_FAILED",
        error instanceof Error ? error.message : "Sprue Boolean generation failed.",
      );
    } finally {
      tool?.delete();
      cavitySolid?.delete();
      for (const bodySolid of bodySolids) bodySolid.delete();
    }
  }
}
