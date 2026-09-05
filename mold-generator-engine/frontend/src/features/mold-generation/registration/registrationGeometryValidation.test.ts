import { getManifoldModule, payloadFromManifold } from "../geometry/manifold";
import { buildWallThicknessField, filterByWallThickness } from "./registrationGeometryValidation";
import type { MoldInterface, RegistrationFeature, RegistrationProtectedRegion, RegistrationSourceBody } from "./registration.contracts";
import { DefaultRegistrationToleranceResolver } from "./registrationTolerance.policy";

const policy = new DefaultRegistrationToleranceResolver().resolve(null);

const moldInterface: MoldInterface = {
  id: "mold-interface:test", bodyAId: "body-a", bodyBId: "body-b", role: "primary-parting",
  axis: "z", planeCoordinateMm: 0, assemblyDirection: { x: 0, y: 0, z: 1 },
  matingBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 30, z: 0 } },
};

function linearFeature(depthMm: number): RegistrationFeature {
  return {
    id: "registration-feature:test",
    interfaceId: moldInterface.id,
    logicalKeyId: "key:test:left",
    segmentIndex: 0,
    side: "left",
    maleBodyId: "body-a",
    femaleBodyId: "body-b",
    startPoint: { x: 5, y: 5, z: 0 },
    endPoint: { x: 5, y: 25, z: 0 },
    anchor: { x: 5, y: 15, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    geometry: { shape: "linear-tongue-and-groove", widthMm: 4, depthMm, lengthMm: 20, taperAngleDeg: 12, leadInMm: 0.8, rootFilletMm: 0.5 },
    clearanceMm: policy.radialClearanceMm,
    status: "planned",
    reason: null,
  };
}

async function cubeBody(id: string, min: readonly [number, number, number], max: readonly [number, number, number]): Promise<RegistrationSourceBody> {
  const module = await getManifoldModule();
  const size: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const solid = module.Manifold.cube(size).translate(min[0], min[1], min[2]);
  try {
    return { id, name: id, visible: true, bounds: { min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] } }, triangleCount: solid.numTri(), volumeMm3: solid.volume(), watertight: true, mesh: payloadFromManifold(solid), geometryVersion: `${id}-v1` };
  } finally { solid.delete(); }
}

async function cubeRegion(id: string, kind: RegistrationProtectedRegion["kind"], min: readonly [number, number, number], max: readonly [number, number, number]): Promise<RegistrationProtectedRegion> {
  const body = await cubeBody(id, min, max);
  return { id, kind, bounds: body.bounds, mesh: body.mesh };
}

describe("exact volumetric wall-thickness validation", () => {
  it("rejects a candidate whose socket comes within minimumWallMm of a protected region, using real geometry", async () => {
    const femaleBody = await cubeBody("body-b", [0, 0, 0], [30, 30, 10]);
    const nearbyCavity = await cubeRegion("cavity", "cavity", [4, 10, 0], [8, 20, 3]);
    const field = buildWallThicknessField([nearbyCavity], policy.booleanToleranceMm);
    try {
      const safe = filterByWallThickness([linearFeature(3)], moldInterface, field, femaleBody, policy);
      expect(safe).toHaveLength(0);
    } finally { field.dispose(); }
  });

  it("accepts a candidate with ample clearance from protected regions and the female body's own surface", async () => {
    const femaleBody = await cubeBody("body-b", [0, 0, 0], [30, 30, 10]);
    const farCavity = await cubeRegion("cavity", "cavity", [20, 20, 0], [25, 25, 3]);
    const field = buildWallThicknessField([farCavity], policy.booleanToleranceMm);
    try {
      const safe = filterByWallThickness([linearFeature(3)], moldInterface, field, femaleBody, policy);
      expect(safe).toHaveLength(1);
    } finally { field.dispose(); }
  });

  it("rejects a socket that would break through the female body's own external surface, even with no protected regions", async () => {
    const shallowFemaleBody = await cubeBody("body-b", [0, 0, 0], [30, 30, 2.5]);
    const field = buildWallThicknessField([], policy.booleanToleranceMm);
    try {
      const safe = filterByWallThickness([linearFeature(3)], moldInterface, field, shallowFemaleBody, policy);
      expect(safe).toHaveLength(0);
    } finally { field.dispose(); }
  });
});
