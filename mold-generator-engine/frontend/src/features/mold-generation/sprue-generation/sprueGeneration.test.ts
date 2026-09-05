import {
  getManifoldModule,
  manifoldFromPayload,
  payloadFromManifold,
  type ManifoldSolid,
} from "../geometry/manifold";
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import { SprueGenerationApplication } from "./SprueGenerationApplication";
import {
  calculateTopCoordinate,
  projectedExtent,
  SprueGenerationService,
} from "./SprueGenerationService";
import type {
  SprueGenerationInput,
  SprueGenerationResult,
  SprueSourceBody,
} from "./sprueGeneration.contracts";
import type { SprueProfileDesignResult } from "./sprueProfileDesigner";

const frame = {
  frameId: "frame-z",
  units: "millimeters" as const,
  origin: { x: 0, y: 0, z: 0 },
  xAxis: { x: 1, y: 0, z: 0 },
  yAxis: { x: 0, y: 1, z: 0 },
  zAxis: { x: 0, y: 0, z: 1 },
};

interface Fixture {
  readonly body: SprueSourceBody;
  readonly cavity: MoldMeshPayload;
}

async function fixture(): Promise<Fixture> {
  const module = await getManifoldModule();
  const blank = module.Manifold.cube([10, 10, 10]);
  const cavitySolid = module.Manifold.sphere(2, 24).translate(5, 5, 5);
  const bodySolid = blank.subtract(cavitySolid);
  try {
    return {
      body: {
        id: "body-1",
        name: "Mold 1",
        visible: true,
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
        centroid: { x: 5, y: 5, z: 5 },
        triangleCount: bodySolid.numTri(),
        volumeMm3: bodySolid.volume(),
        watertight: true,
        mesh: payloadFromManifold(bodySolid),
        geometryVersion: "body-v1",
      },
      cavity: payloadFromManifold(cavitySolid),
    };
  } finally {
    bodySolid.delete();
    cavitySolid.delete();
    blank.delete();
  }
}

async function layeredFixture(layerCount: number): Promise<{
  readonly bodies: readonly SprueSourceBody[];
  readonly cavity: MoldMeshPayload;
}> {
  const module = await getManifoldModule();
  const cavitySolid = module.Manifold.sphere(0.5, 24).translate(5, 5, 1);
  const bodies: SprueSourceBody[] = [];
  try {
    for (let index = layerCount - 1; index >= 0; index -= 1) {
      const minZ = index * (10 / layerCount);
      const maxZ = (index + 1) * (10 / layerCount);
      const blank = module.Manifold.cube([10, 10, maxZ - minZ]).translate(0, 0, minZ);
      const bodySolid = blank.subtract(cavitySolid);
      try {
        bodies.push({
          id: `body-${index}`,
          name: `Mold ${index}`,
          visible: index !== 1,
          bounds: { min: { x: 0, y: 0, z: minZ }, max: { x: 10, y: 10, z: maxZ } },
          centroid: { x: 5, y: 5, z: (minZ + maxZ) / 2 },
          triangleCount: bodySolid.numTri(),
          volumeMm3: bodySolid.volume(),
          watertight: true,
          mesh: payloadFromManifold(bodySolid),
          geometryVersion: `body-${index}-v1`,
        });
      } finally {
        bodySolid.delete();
        blank.delete();
      }
    }
    return { bodies, cavity: payloadFromManifold(cavitySolid) };
  } finally {
    cavitySolid.delete();
  }
}

async function boxCavityFixture(
  moldHeight: number,
  cavityTopZ: number,
): Promise<Fixture> {
  const module = await getManifoldModule();
  const blank = module.Manifold.cube([10, 10, moldHeight]);
  const cavitySolid = module.Manifold.cube([2, 2, 1]).translate(4, 4, cavityTopZ - 1);
  const bodySolid = blank.subtract(cavitySolid);
  try {
    return {
      body: {
        id: "body-1",
        name: "Mold 1",
        visible: true,
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: moldHeight } },
        centroid: { x: 5, y: 5, z: moldHeight / 2 },
        triangleCount: bodySolid.numTri(),
        volumeMm3: bodySolid.volume(),
        watertight: true,
        mesh: payloadFromManifold(bodySolid),
        geometryVersion: `body-${moldHeight}-${cavityTopZ}`,
      },
      cavity: payloadFromManifold(cavitySolid),
    };
  } finally {
    bodySolid.delete();
    cavitySolid.delete();
    blank.delete();
  }
}

function previewEntryDistance(cavity: MoldMeshPayload, x: number, y: number, topZ: number): number {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(cavity.positions), 3));
  geometry.setIndex([...cavity.indices]);
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const target = new Mesh(geometry, material);
  const raycaster = new Raycaster(
    new Vector3(x, y, topZ - 1e-5),
    new Vector3(0, 0, -1),
  );
  try {
    return raycaster.intersectObject(target, false)[0]!.distance + 1e-5;
  } finally {
    geometry.dispose();
    material.dispose();
  }
}

function input(
  data: Fixture,
  position = { x: 5, y: 5, z: 10 },
  profileDesign = engineeringProfile(),
  targetBodies: readonly SprueSourceBody[] = [data.body],
): SprueGenerationInput {
  return {
    request: {
      operationId: `op:${position.x}:${position.y}:${profileDesign.profile.mainDiameterMm}:${profileDesign.profile.entryNeckDiameterMm}`,
      position,
      profileDesign,
      moldRevision: "revision-1",
    },
    targetBodies,
    cavity: data.cavity,
    moldFrame: frame,
    geometryToleranceMm: 1e-6,
  };
}

function engineeringProfile(
  mainDiameterMm = 1,
  entryNeckDiameterMm = mainDiameterMm,
  entryNeckLengthMm = 4,
): SprueProfileDesignResult {
  return {
    profile: { mainDiameterMm, entryNeckDiameterMm, entryNeckLengthMm },
    source: "geometry-derived",
    mainSection: null,
    entryNeckDiameter: null,
    entryNeckLength: null,
    warnings: [],
  };
}

describe("SprueGenerationService contracts and geometry", () => {
  it("safely reduces projected extent and top coordinate for a very large mesh", async () => {
    const data = await fixture();
    const vertexCount = 150_000;
    const positions = new Array<number>(vertexCount * 3).fill(0);
    positions[(vertexCount - 2) * 3 + 2] = 42;
    positions[(vertexCount - 1) * 3 + 2] = -20;
    const largeMesh: MoldMeshPayload = {
      positions,
      indices: data.body.mesh.indices.slice(),
    };
    const largeBody: SprueSourceBody = {
      ...data.body,
      mesh: largeMesh,
    };

    expect(
      projectedExtent(
        [largeMesh],
        { x: 0, y: 0, z: 50 },
        { x: 0, y: 0, z: -1 },
      ),
    ).toBe(70);
    expect(
      calculateTopCoordinate([largeBody], { x: 0, y: 0, z: 1 }),
    ).toBe(42);
    await expect(
      new SprueGenerationService().generate(
        input(data, { x: 5, y: 5, z: 42 }, undefined, [largeBody]),
      ),
    ).resolves.toHaveProperty("status");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a profile with invalid main diameter %s",
    async (mainDiameterMm) => {
      const data = await fixture();
      const result = await new SprueGenerationService().generate(
        input(data, undefined, engineeringProfile(mainDiameterMm)),
      );
      expect(result).toMatchObject({ status: "failure", reasonCode: "SPRUE_INVALID_PROFILE" });
    },
  );

  it("rejects missing inputs and non-finite placement", async () => {
    const data = await fixture();
    const service = new SprueGenerationService();
    await expect(service.generate({ ...input(data), targetBodies: [] })).resolves.toMatchObject({ reasonCode: "SPRUE_TARGET_BODY_MISSING" });
    await expect(service.generate({ ...input(data), cavity: null })).resolves.toMatchObject({ reasonCode: "SPRUE_CAVITY_MISSING" });
    await expect(service.generate(input(data, { x: Number.NaN, y: 5, z: 10 }))).resolves.toMatchObject({ reasonCode: "SPRUE_INVALID_PLACEMENT" });
    await expect(service.generate({
      ...input(data),
      targetBodies: [data.body, data.body],
    })).resolves.toMatchObject({ reasonCode: "SPRUE_RESULT_INVALID" });
  });

  it("rejects side, bottom, and an inlet crossing the top boundary", async () => {
    const data = await fixture();
    const service = new SprueGenerationService();
    await expect(service.generate(input(data, { x: 0, y: 5, z: 5 }))).resolves.toMatchObject({ reasonCode: "SPRUE_NOT_ON_TOP_FACE" });
    await expect(service.generate(input(data, { x: 5, y: 5, z: 0 }))).resolves.toMatchObject({ reasonCode: "SPRUE_NOT_ON_TOP_FACE" });
    await expect(service.generate(input(data, { x: 0.2, y: 5, z: 10 }, engineeringProfile()))).resolves.toMatchObject({ reasonCode: "SPRUE_INLET_OUTSIDE_BODY" });
  });

  it("creates centered and off-center passages reaching the actual cavity", async () => {
    const data = await fixture();
    const service = new SprueGenerationService();
    const centered = await service.generate(input(data));
    const offCenter = await service.generate(input(data, { x: 5.8, y: 5, z: 10 }));
    expect(centered.status).toBe("success");
    expect(offCenter.status).toBe("success");
    if (centered.status === "success") {
      expect(centered.updatedBodies[0]!.volumeMm3).toBeLessThan(data.body.volumeMm3);
      expect(centered.updatedBodies[0]!.mesh.positions.every(Number.isFinite)).toBe(true);
      expect(centered.updatedBodies[0]!.mesh.indices.length).toBeGreaterThan(0);
      expect(centered.sprue.inwardDirection).toEqual({ x: -0, y: -0, z: -1 });
      expect(centered.sprue.depthMm).toBeCloseTo(
        previewEntryDistance(data.cavity, 5, 5, 10),
        5,
      );
      const module = await getManifoldModule();
      const updated = new module.Manifold(new module.Mesh({
        numProp: 3,
        vertProperties: new Float32Array(centered.updatedBodies[0]!.mesh.positions),
        triVerts: new Uint32Array(centered.updatedBodies[0]!.mesh.indices),
        tolerance: 1e-6,
      }));
      const cavity = new module.Manifold(new module.Mesh({
        numProp: 3,
        vertProperties: new Float32Array(data.cavity.positions),
        triVerts: new Uint32Array(data.cavity.indices),
        tolerance: 1e-6,
      }));
      const passageAboveCavity = module.Manifold.cylinder(3, 0.5, 0.5, 32).translate(5, 5, 7);
      const materialBelowCavity = module.Manifold.cylinder(2, 0.5, 0.5, 32).translate(5, 5, 0);
      const original = manifoldFromPayload(module, data.body.mesh, 1e-6);
      const remainingAbove = updated.intersect(passageAboveCavity);
      const updatedBelow = updated.intersect(materialBelowCavity);
      const originalBelow = original.intersect(materialBelowCavity);
      try {
        expect(remainingAbove.volume()).toBeLessThan(1e-6);
        expect(updatedBelow.volume()).toBeCloseTo(originalBelow.volume(), 6);
      } finally {
        originalBelow.delete();
        updatedBelow.delete();
        remainingAbove.delete();
        original.delete();
        materialBelowCavity.delete();
        passageAboveCavity.delete();
        cavity.delete();
        updated.delete();
      }
    }
  });

  it("cuts the stepped main section and entry neck from the supplied engineering profile", async () => {
    const data = await fixture();
    const profileDesign = engineeringProfile(2, 1, 2);
    const result = await new SprueGenerationService().generate(
      input(data, undefined, profileDesign),
    );

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.sprue.profile).toBe(profileDesign.profile);
    expect(result.sprue.profile).toEqual({
      mainDiameterMm: 2,
      entryNeckDiameterMm: 1,
      entryNeckLengthMm: 2,
    });

    const module = await getManifoldModule();
    const updated = manifoldFromPayload(module, result.updatedBodies[0]!.mesh, 1e-6);
    const neckCore = module.Manifold.cylinder(1, 0.45, 0.45, 32).translate(5, 5, 7.5);
    const neckOuter = module.Manifold.cylinder(1, 0.9, 0.9, 32).translate(5, 5, 7.5);
    const remainingCore = updated.intersect(neckCore);
    const remainingOuter = updated.intersect(neckOuter);
    try {
      expect(remainingCore.volume()).toBeLessThan(1e-6);
      expect(remainingOuter.volume()).toBeGreaterThan(1);
    } finally {
      remainingOuter.delete();
      remainingCore.delete();
      neckOuter.delete();
      neckCore.delete();
      updated.delete();
    }
  });

  it.each([
    { label: "shallow cavity", moldHeight: 10, cavityTopZ: 9 },
    { label: "deep cavity", moldHeight: 10, cavityTopZ: 2 },
    { label: "very tall mold", moldHeight: 100, cavityTopZ: 20 },
    { label: "very short mold", moldHeight: 4, cavityTopZ: 2 },
  ])("terminates at the first cavity entry for $label", async ({ moldHeight, cavityTopZ }) => {
    const data = await boxCavityFixture(moldHeight, cavityTopZ);
    const result = await new SprueGenerationService().generate(
      input(data, { x: 5, y: 5, z: moldHeight }),
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.sprue.depthMm).toBeCloseTo(moldHeight - cavityTopZ, 6);
      expect(result.sprue.depthMm).toBeLessThan(moldHeight);
    }
  });

  it.each([2, 4])("cuts one Sprue through all %i intersected bodies in deterministic order", async (layerCount) => {
    const data = await layeredFixture(layerCount);
    const unaffectedFixture = await fixture();
    const unaffected = {
      ...unaffectedFixture.body,
      id: "unaffected",
      bounds: { min: { x: 20, y: 0, z: 0 }, max: { x: 30, y: 10, z: 10 } },
      centroid: { x: 25, y: 5, z: 5 },
      mesh: {
        ...unaffectedFixture.body.mesh,
        positions: unaffectedFixture.body.mesh.positions.map((value, index) =>
          index % 3 === 0 ? value + 20 : value
        ),
      },
    };
    const request: SprueGenerationInput = {
      ...input({ body: data.bodies[0]!, cavity: data.cavity }),
      targetBodies: [...data.bodies, unaffected],
      cavity: data.cavity,
    };

    const result = await new SprueGenerationService().generate(request);

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.replacedBodyIds).toEqual(data.bodies.map((body) => body.id));
      expect(result.updatedBodies).toHaveLength(layerCount);
      expect(result.updatedBodies.map((body) => body.visible)).toEqual(
        data.bodies.map((body) => body.visible),
      );
      expect(result.updatedBodies.every((body, index) =>
        body.volumeMm3 < data.bodies[index]!.volumeMm3
      )).toBe(true);
      expect(result.updatedBodies.some((body) => body.id === unaffected.id)).toBe(false);
      expect(Object.isFrozen(result.replacedBodyIds)).toBe(true);
      expect(Object.isFrozen(result.sprue.targetBodyIds)).toBe(true);
    }
  });

  it("rejects a path that enters material but misses the cavity", async () => {
    const data = await fixture();
    const result = await new SprueGenerationService().generate(input(data, { x: 8.5, y: 5, z: 10 }));
    expect(result).toMatchObject({ status: "failure", reasonCode: "SPRUE_DOES_NOT_REACH_CAVITY" });
  });

  it("rejects cavity-AABB overlap without actual cavity intersection", async () => {
    const data = await fixture();
    const result = await new SprueGenerationService().generate(input(data, { x: 6.8, y: 6.8, z: 10 }, engineeringProfile(0.4)));
    expect(result).toMatchObject({ status: "failure", reasonCode: "SPRUE_DOES_NOT_REACH_CAVITY" });
  });

  it("rejects tangential cavity contact", async () => {
    const data = await fixture();
    const result = await new SprueGenerationService().generate(input(data, { x: 7.5, y: 5, z: 10 }, engineeringProfile()));
    expect(result).toMatchObject({ status: "failure", reasonCode: "SPRUE_TANGENTIAL_CAVITY_CONTACT" });
  });

  it("uses the rotated frame top direction instead of a world-axis assumption", async () => {
    const data = await fixture();
    const rotatedInput = {
      ...input(data, { x: 10, y: 5, z: 5 }),
      moldFrame: {
        ...frame,
        frameId: "frame-x",
        xAxis: { x: 0, y: 0, z: -1 },
        zAxis: { x: 1, y: 0, z: 0 },
      },
    };
    const result = await new SprueGenerationService().generate(rotatedInput);
    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.sprue.inwardDirection).toEqual({ x: -1, y: -0, z: -0 });
  });

  it("does not mutate inputs and is deterministic", async () => {
    const data = await fixture();
    const request = input(data);
    const before = structuredClone(request);
    const service = new SprueGenerationService();
    const first = await service.generate(request);
    const second = await service.generate(request);
    expect(request).toEqual(before);
    expect(first).toEqual(second);
  });
});

describe("SprueGenerationApplication", () => {
  it("atomically replaces only the selected body and supports undo/redo", async () => {
    const data = await fixture();
    const unaffected = {
      ...data.body,
      id: "body-2",
      geometryVersion: "body-2-v1",
      bounds: { min: { x: 20, y: 0, z: 0 }, max: { x: 30, y: 10, z: 10 } },
      centroid: { x: 25, y: 5, z: 5 },
      mesh: {
        ...data.body.mesh,
        positions: data.body.mesh.positions.map((value, index) =>
          index % 3 === 0 ? value + 20 : value
        ),
      },
    };
    const application = new SprueGenerationApplication("revision-1", [data.body, unaffected]);
    const result = await application.generate(input(data, undefined, undefined, [data.body, unaffected]));
    expect(result.status).toBe("success");
    expect(application.state.bodies[1]).toBe(unaffected);
    expect(application.state.bodies[0]).not.toBe(data.body);
    expect(application.undo()).toBe(true);
    expect(application.state.bodies[0]).toBe(data.body);
    expect(application.redo()).toBe(true);
    expect(application.state.lastSuccess?.operationId).toBe(input(data).request.operationId);
  });

  it("commits nothing on failure and recovers to idle", async () => {
    const data = await fixture();
    const application = new SprueGenerationApplication("revision-1", [data.body]);
    const result = await application.generate(input(data, { x: 8.5, y: 5, z: 10 }));
    expect(result.status).toBe("failure");
    expect(application.state.bodies[0]).toBe(data.body);
    expect(application.state.undoStack).toHaveLength(0);
    expect(application.state.status).toBe("idle");
  });

  it("commits three changed bodies as one operation and restores all with undo/redo", async () => {
    const data = await layeredFixture(3);
    const application = new SprueGenerationApplication("revision-1", data.bodies);
    const request = input(
      { body: data.bodies[0]!, cavity: data.cavity },
      undefined,
      undefined,
      data.bodies,
    );

    const result = await application.generate(request);

    expect(result.status).toBe("success");
    expect(application.state.undoStack).toHaveLength(1);
    expect(application.state.bodies.every((body, index) =>
      body.geometryVersion !== data.bodies[index]!.geometryVersion
    )).toBe(true);
    expect(application.undo()).toBe(true);
    expect(application.state.bodies).toEqual(data.bodies);
    expect(application.redo()).toBe(true);
    expect(application.state.bodies.every((body, index) =>
      body.geometryVersion !== data.bodies[index]!.geometryVersion
    )).toBe(true);
  });

  it("rejects stale and duplicate operations", async () => {
    const data = await fixture();
    const stale = new SprueGenerationApplication("revision-2", [data.body]);
    await expect(stale.generate(input(data))).resolves.toMatchObject({ reasonCode: "SPRUE_STALE_INPUT" });
    const application = new SprueGenerationApplication("revision-1", [data.body]);
    expect((await application.generate(input(data))).status).toBe("success");
    await expect(application.generate({ ...input(data), request: { ...input(data).request, moldRevision: application.state.revision } })).resolves.toMatchObject({ reasonCode: "SPRUE_STALE_INPUT" });
  });

  it("prevents concurrent generation", async () => {
    const data = await fixture();
    let release: ((result: SprueGenerationResult) => void) | undefined;
    const pending = new Promise<SprueGenerationResult>((resolve) => { release = resolve; });
    const application = new SprueGenerationApplication("revision-1", [data.body], { generate: () => pending });
    const first = application.generate(input(data));
    await Promise.resolve();
    await expect(application.generate(input(data))).resolves.toMatchObject({ reasonCode: "SPRUE_GENERATION_IN_PROGRESS" });
    release!({ status: "failure", reasonCode: "SPRUE_BOOLEAN_FAILED", message: "stopped" });
    await first;
  });
});

afterAll(async () => {
  const module = await getManifoldModule();
  const disposable: ManifoldSolid = module.Manifold.cube([1, 1, 1]);
  disposable.delete();
});
