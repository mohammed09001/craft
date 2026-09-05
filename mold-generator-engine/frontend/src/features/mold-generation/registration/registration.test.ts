import { getManifoldModule, payloadFromManifold } from "../geometry/manifold";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import { RegistrationGenerationService } from "./RegistrationGenerationService";
import type { RegistrationProtectedRegion, RegistrationSourceBody } from "./registration.contracts";
import { detectMatingInterfaces, detectPrimaryMatingInterface, planRegistrationLayout } from "./registrationPlanner";
import { DefaultRegistrationToleranceResolver } from "./registrationTolerance.policy";

const policy = new DefaultRegistrationToleranceResolver().resolve(null);

async function fixture(width = 40, depth = 40): Promise<{ bodies: readonly RegistrationSourceBody[]; cavity: RegistrationProtectedRegion }> {
  const module = await getManifoldModule();
  const lowerBlank = module.Manifold.cube([width, depth, 10]);
  const upperBlank = module.Manifold.cube([width, depth, 10]).translate(0, 0, 10);
  const cavitySolid = module.Manifold.sphere(Math.min(width, depth) * 0.15, 32).translate(width / 2, depth / 2, 10);
  const lower = lowerBlank.subtract(cavitySolid), upper = upperBlank.subtract(cavitySolid);
  const body = (id: string, bounds: Bounds3, solid: typeof lower): RegistrationSourceBody => ({ id, name: id, visible: true, bounds, centroid: { x: width / 2, y: depth / 2, z: (bounds.min.z + bounds.max.z) / 2 }, triangleCount: solid.numTri(), volumeMm3: solid.volume(), watertight: true, mesh: payloadFromManifold(solid), geometryVersion: `${id}-v1` });
  try { return { bodies: [body("body-a", { min: { x: 0, y: 0, z: 0 }, max: { x: width, y: depth, z: 10 } }, lower), body("body-b", { min: { x: 0, y: 0, z: 10 }, max: { x: width, y: depth, z: 20 } }, upper)], cavity: { id: "cavity", kind: "cavity", bounds: { min: { x: width * 0.35, y: depth * 0.35, z: Math.min(width, depth) * -0.15 + 10 }, max: { x: width * 0.65, y: depth * 0.65, z: Math.min(width, depth) * 0.15 + 10 } }, mesh: payloadFromManifold(cavitySolid) } }; } finally { upper.delete(); lower.delete(); cavitySolid.delete(); upperBlank.delete(); lowerBlank.delete(); }
}

async function threeBodyFixture(width = 40, depth = 40, heightEach = 10): Promise<{ bodies: readonly RegistrationSourceBody[] }> {
  const module = await getManifoldModule();
  const bottomSolid = module.Manifold.cube([width, depth, heightEach]);
  const middleSolid = module.Manifold.cube([width, depth, heightEach]).translate(0, 0, heightEach);
  const topSolid = module.Manifold.cube([width, depth, heightEach]).translate(0, 0, heightEach * 2);
  const body = (id: string, bounds: Bounds3, solid: typeof bottomSolid): RegistrationSourceBody => ({ id, name: id, visible: true, bounds, centroid: { x: width / 2, y: depth / 2, z: (bounds.min.z + bounds.max.z) / 2 }, triangleCount: solid.numTri(), volumeMm3: solid.volume(), watertight: true, mesh: payloadFromManifold(solid), geometryVersion: `${id}-v1` });
  try {
    return {
      bodies: [
        body("body-bottom", { min: { x: 0, y: 0, z: 0 }, max: { x: width, y: depth, z: heightEach } }, bottomSolid),
        body("body-middle", { min: { x: 0, y: 0, z: heightEach }, max: { x: width, y: depth, z: heightEach * 2 } }, middleSolid),
        body("body-top", { min: { x: 0, y: 0, z: heightEach * 2 }, max: { x: width, y: depth, z: heightEach * 3 } }, topSolid),
      ]
    };
  } finally { bottomSolid.delete(); middleSolid.delete(); topSolid.delete(); }
}

describe("automatic mold registration planning", () => {
  it("detects a stable generic mating interface and produces two complementary edge-mounted linear alignment keys", async () => {
    const data = await fixture();
    const moldInterface = detectPrimaryMatingInterface(data.bodies, 1e-5)!;
    const repeated = detectPrimaryMatingInterface([...data.bodies].reverse(), 1e-5)!;
    expect(repeated).toEqual(moldInterface);
    expect(moldInterface).toMatchObject({ bodyAId: "body-a", bodyBId: "body-b", axis: "z", planeCoordinateMm: 10, role: "primary-parting" });
    const result = await new RegistrationGenerationService().generate({ sourceRevision: "layout-v1", bodies: data.bodies, protectedRegions: [data.cavity] });
    if (result.report.status !== "generated") {
      console.log("REGISTRATION TEST REPORT:", result.report);
    }
    expect(result.report.status).toBe("generated");
    const features = result.report.features;
    expect(features).toHaveLength(2);
    expect(features[0]!.geometry.shape).toBe("linear-tongue-and-groove");
    expect(features[1]!.geometry.shape).toBe("linear-tongue-and-groove");

    const sides = features.map((f) => f.side).sort();
    expect(sides).toEqual(["left", "right"]);
  });

  it("degrades without forcing keys on a narrow interface", async () => {
    const data = await fixture(8, 6);
    const moldInterface = detectPrimaryMatingInterface(data.bodies, 1e-5)!;
    expect(planRegistrationLayout(moldInterface, data.bodies, [data.cavity], policy)).toHaveLength(0);
    const result = await new RegistrationGenerationService().generate({ sourceRevision: "narrow-v1", bodies: data.bodies, protectedRegions: [data.cavity] });
    expect(result.report).toMatchObject({ status: "blocked", reasonCode: "registration_insufficient_safe_area" });
    expect(result.bodies).toBe(data.bodies);
  });

  it("derives clearance from the replaceable manufacturing policy", () => {
    const resolver = new DefaultRegistrationToleranceResolver();
    const conservative = resolver.resolve(null), resin = resolver.resolve({ process: "resin", xyAccuracyMm: 0.05, layerHeightMm: 0.05 });
    expect(conservative.policyId).toBe("registration-conservative-fdm-v1");
    expect(conservative.radialClearanceMm).toBeGreaterThan(resin.radialClearanceMm);
  });
});

describe("automatic mold registration geometry and lifecycle", () => {
  it("constructs complementary male and female linear key geometry deterministically from clean bodies", async () => {
    const data = await fixture(), service = new RegistrationGenerationService(), request = { sourceRevision: "cavity-v1", bodies: data.bodies, protectedRegions: [data.cavity] } as const;
    const first = await service.generate(request), rebuilt = await service.generate(request);
    expect(first.report.status).toBe("generated");
    expect(first.report.features).toHaveLength(2);
    expect(first.report).toEqual(rebuilt.report);
    expect(first.bodies).toEqual(rebuilt.bodies);
    const maleId = first.report.features[0]!.maleBodyId, femaleId = first.report.features[0]!.femaleBodyId;
    expect(first.bodies.find(body => body.id === maleId)!.volumeMm3).toBeGreaterThan(data.bodies.find(body => body.id === maleId)!.volumeMm3);
    expect(first.bodies.find(body => body.id === femaleId)!.volumeMm3).toBeLessThan(data.bodies.find(body => body.id === femaleId)!.volumeMm3);
    expect(first.report.features.every(feature => feature.clearanceMm === first.report.tolerancePolicy.radialClearanceMm && feature.status === "generated")).toBe(true);
  });

  it("rolls back atomically when Boolean input validation fails", async () => {
    const data = await fixture();
    const invalidBodies = [{ ...data.bodies[0]!, mesh: { positions: [0, 0, 0], indices: [] } }, data.bodies[1]!] as const;
    const result = await new RegistrationGenerationService().generate({ sourceRevision: "broken", bodies: invalidBodies, protectedRegions: [data.cavity] });
    expect(result.report.status).toBe("blocked");
    expect(result.report.reasonCode).toBe("registration_boolean_failed");
    expect(result.bodies).toBe(invalidBodies);
  });

  it("honors the explicit current-workflow eligibility boundary", async () => {
    const data = await fixture();
    const result = await new RegistrationGenerationService().generate({ sourceRevision: "large-future", bodies: data.bodies, protectedRegions: [data.cavity], eligibility: "ineligible" });
    expect(result.report.reasonCode).toBe("registration_ineligible");
    expect(result.bodies).toBe(data.bodies);
  });
});

describe("multi-interface registration after additional split faces", () => {
  it("plans and generates linear alignment on every mating interface", async () => {
    const data = await threeBodyFixture();
    const interfaces = detectMatingInterfaces(data.bodies, 1e-5);
    expect(interfaces).toHaveLength(2);

    const result = await new RegistrationGenerationService().generate({ sourceRevision: "multi-interface-v1", bodies: data.bodies, protectedRegions: [] });
    expect(result.report.status).toBe("generated");
    expect(result.report.interfaces).toHaveLength(2);
    const features = result.report.features;
    expect(features.length).toBeGreaterThanOrEqual(4);

    expect(features.some(feature => feature.maleBodyId === "body-middle")).toBe(true);
    expect(features.some(feature => feature.femaleBodyId === "body-middle")).toBe(true);

    const bottom = data.bodies.find(body => body.id === "body-bottom")!, top = data.bodies.find(body => body.id === "body-top")!;
    const outBottom = result.bodies.find(body => body.id === "body-bottom")!, outTop = result.bodies.find(body => body.id === "body-top")!;
    expect(outBottom.volumeMm3).toBeLessThan(bottom.volumeMm3);
    expect(outTop.volumeMm3).toBeGreaterThan(top.volumeMm3);
  });

  it("produces a byte-identical multi-interface result across repeated deterministic runs", async () => {
    const data = await threeBodyFixture();
    const service = new RegistrationGenerationService();
    const request = { sourceRevision: "multi-interface-determinism-v1", bodies: data.bodies, protectedRegions: [] } as const;
    const first = await service.generate(request), second = await service.generate(request);
    expect(first.report).toEqual(second.report);
    expect(first.bodies).toEqual(second.bodies);
  });
});
