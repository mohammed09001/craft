import { Matrix4 } from "three";

import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import { validateMoldPartitionCoverage } from "../reference-mold-definition/orthogonalMold";
import type { CuttingPlaneRecord } from "../split-face/splitFace.contracts";
import {
  CAVITY_GENERATION_SCHEMA_VERSION,
  DEFAULT_MINIMUM_WALL_MM,
  type CanonicalPartGeometry,
  type CavityGenerationInput,
  type CavityQualityMode,
  type CavitySourceBody,
  type MoldCoordinateFrameSnapshot,
} from "./cavityGeneration.contracts";
import {
  buildCavitySourceSignature,
  cavityBodyGeometryVersion,
} from "./cavityGeneration.signature";
import { buildCavityGeometryTolerancePolicy, CAVITY_TOLERANCE_POLICY_VERSION } from "./cavityGeometryTolerance.policy";

const clone = <T>(value: T): T => structuredClone(value);

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);

    for (const nested of Object.values(value)) {
      freezeDeep(nested);
    }
  }

  return value;
}

function validateCanonicalPartGeometry(
  partGeometry: CanonicalPartGeometry,
): void {
  if (
    partGeometry.positions.length < 9 ||
    partGeometry.positions.length % 3 !== 0
  ) {
    throw new Error("Part positions are invalid.");
  }

  if (
    partGeometry.indices.length < 3 ||
    partGeometry.indices.length % 3 !== 0
  ) {
    throw new Error("Part triangle indices are invalid.");
  }

  const vertexCount = partGeometry.positions.length / 3;

  for (let index = 0; index < partGeometry.indices.length; index += 3) {
    const a = partGeometry.indices[index];
    const b = partGeometry.indices[index + 1];
    const c = partGeometry.indices[index + 2];

    if (
      a === undefined ||
      b === undefined ||
      c === undefined ||
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      !Number.isInteger(c) ||
      a < 0 ||
      b < 0 ||
      c < 0 ||
      a >= vertexCount ||
      b >= vertexCount ||
      c >= vertexCount
    ) {
      throw new Error("Part contains an invalid vertex index.");
    }

    if (a === b || b === c || c === a) {
      throw new Error("Part contains a degenerate triangle.");
    }
  }
}

export function buildMoldCoordinateFrameSnapshot(
  partGeometry: CanonicalPartGeometry,
  definition?: ReferenceMoldDefinition,
): MoldCoordinateFrameSnapshot {
  if (
    partGeometry.transform.length !== 16 ||
    !partGeometry.transform.every(Number.isFinite)
  ) {
    throw new Error("Part transform is invalid.");
  }

  const worldFromMold = definition?.moldFrame === undefined
    ? new Matrix4().fromArray([...partGeometry.transform])
    : new Matrix4();

  const determinant = worldFromMold.determinant();

  if (
    !Number.isFinite(determinant) ||
    Math.abs(determinant) <= 1e-12
  ) {
    throw new Error("Part transform is not invertible.");
  }

  const moldFromWorld = Array.from(
    worldFromMold.clone().invert().elements,
  );

  return freezeDeep({
    frameId: `mold-coordinate-frame:${partGeometry.modelId}`,
    version: 1,
    units: "millimeters",
    upAxis: "Z",
    origin: { x: 0, y: 0, z: 0 },
    xAxis: { x: 1, y: 0, z: 0 },
    yAxis: { x: 0, y: 1, z: 0 },
    zAxis: { x: 0, y: 0, z: 1 },
    worldFromMold: Object.freeze(
      Array.from(worldFromMold.elements),
    ),
    moldFromWorld: Object.freeze(moldFromWorld),
  });
}

function placePartInAuthoritativeMoldFrame(
  partGeometry: CanonicalPartGeometry,
  definition: ReferenceMoldDefinition,
): CanonicalPartGeometry {
  const offset = definition.moldFrame?.partOffset ?? { x: 0, y: 0, z: 0 };
  const sourceTransform = new Matrix4().fromArray([...partGeometry.transform]);
  const transform = new Matrix4()
    .makeTranslation(offset.x, offset.y, offset.z)
    .multiply(sourceTransform)
    .toArray();

  return {
    ...partGeometry,
    transform: Object.freeze(transform),
    sourceSignature:
      `${partGeometry.sourceSignature}:mold-frame:` +
      (definition.moldFrame?.frameId ?? "legacy"),
  };
}

export interface BuildCavityInputOptions {
  readonly sourcePartMesh: CanonicalPartGeometry;
  readonly definition: ReferenceMoldDefinition;
  readonly cuttingPlanes: readonly CuttingPlaneRecord[];
  readonly cavityClearanceMm: number;
  readonly qualityMode: CavityQualityMode;
  readonly generationVersion: number;
}

export function buildCavityGenerationInput(
  options: BuildCavityInputOptions,
): CavityGenerationInput {
  const sourcePartMesh = placePartInAuthoritativeMoldFrame(
    options.sourcePartMesh,
    options.definition,
  );
  validateCanonicalPartGeometry(sourcePartMesh);

  const bodies = options.definition.moldBodies;

  if (bodies === undefined || bodies.length === 0) {
    throw new Error("Mold bodies are not available.");
  }

  // Segmentation-derived definitions declare moldBodiesPartitionReferenceBlock
  // = false because their bodies are irregular part-derived pieces, not an
  // exact partition of a rectangular reference block -- this coverage check
  // only holds Cut by Face's own invariant, so it doesn't apply to them.
  if (options.definition.moldBodiesPartitionReferenceBlock !== false) {
    validateMoldPartitionCoverage(
      options.definition.referenceMoldBlock.bounds,
      bodies,
    );
  }

  const moldBodies: CavitySourceBody[] = bodies.map(
    ({ visible: _, ...body }) => {
      void _;

      const copied = clone(body);

      return {
        ...copied,
        geometryVersion: cavityBodyGeometryVersion(copied),
      };
    },
  );

  const coordinateFrame =
    buildMoldCoordinateFrameSnapshot(sourcePartMesh, options.definition);
  const tolerancePolicy = buildCavityGeometryTolerancePolicy(
    options.definition.referenceMoldBlock.bounds,
    options.cavityClearanceMm,
  );

  const source = {
    sourcePartMesh,
    coordinateFrameVersion: coordinateFrame.version,
    partBoundingBox: options.definition.selectionBoxBounds,
    referenceMoldBlockBounds:
      options.definition.referenceMoldBlock.bounds,
    referenceMoldBlockClearanceMm:
      options.definition.referenceMoldBlock.clearanceMm,
    cuttingPlanes: options.cuttingPlanes,
    moldBodies,
    cavityClearanceMm: options.cavityClearanceMm,
    qualityMode: options.qualityMode,
    toleranceVersion:
      CAVITY_TOLERANCE_POLICY_VERSION,
  };

  const upstreamInputSignature =
    buildCavitySourceSignature(source);

  return freezeDeep({
    schemaVersion: CAVITY_GENERATION_SCHEMA_VERSION,
    operationId:
      `cavity-operation:${options.generationVersion}:` +
      upstreamInputSignature,
    generationVersion: options.generationVersion,
    sourcePartMesh: clone(sourcePartMesh),
    coordinateFrame,
    partBoundingBox: clone(source.partBoundingBox),
    referenceMoldBlockBounds: clone(source.referenceMoldBlockBounds),
    referenceMoldBlockClearanceMm: source.referenceMoldBlockClearanceMm,
    cuttingPlanes: clone(options.cuttingPlanes),
    moldBodies,
    cavityClearanceMm: options.cavityClearanceMm,
    geometryToleranceMm: tolerancePolicy.booleanToleranceMm,
    tolerancePolicy,
    minimumWallMm: DEFAULT_MINIMUM_WALL_MM,
    qualityMode: options.qualityMode,
    upstreamInputSignature,
  });
}
