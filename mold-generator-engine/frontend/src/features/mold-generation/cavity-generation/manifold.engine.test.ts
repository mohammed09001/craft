import { buildAdaptiveClearancePolicy, createCavityTool, DIRECT_CLEARANCE_TRIANGLE_LIMIT, getManifoldModule, manifoldFromPayload } from "./manifold.engine";
import { cubeMesh } from "./cavityGeneration.testFixtures";
const bounds={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}};const prepared={mesh:cubeMesh(bounds),bounds,volumeMm3:1000,triangleCount:12,connectedComponentCount:1,watertight:true,manifold:true,warnings:[]} as const;
it("keeps zero-clearance tool exact and creates a true positive physical offset",async()=>{const exact=await createCavityTool(prepared,0,"standard",1e-6);const offset=await createCavityTool(prepared,.2,"standard",1e-6);expect(exact.volumeMm3).toBeCloseTo(1000);expect(exact.implementationMethod).toBe("exact-watertight-part-solid");expect(offset.bounds.min.x).toBeCloseTo(-.2);expect(offset.bounds.max.x).toBeCloseTo(10.2);expect(offset.volumeMm3).toBeGreaterThan(exact.volumeMm3);});
it("performs actual watertight box subtraction with an internal negative surface",async()=>{const module=await getManifoldModule();const outer=manifoldFromPayload(module,cubeMesh({min:{x:-2,y:-2,z:-2},max:{x:12,y:12,z:12}}),1e-6);const inner=manifoldFromPayload(module,cubeMesh(bounds),1e-6);const result=outer.subtract(inner);expect(result.status()).toBe("NoError");expect(result.volume()).toBeCloseTo(14**3-1000);expect(result.numTri()).toBeGreaterThan(12);outer.delete();inner.delete();result.delete();});
it("subtracts a closed sphere-like solid from a box",async()=>{const module=await getManifoldModule();const box=module.Manifold.cube([10,10,10],true);const sphere=module.Manifold.sphere(2,16);const result=box.subtract(sphere);expect(result.status()).toBe("NoError");expect(result.volume()).toBeLessThan(1000);expect(result.volume()).toBeGreaterThan(900);expect(result.numTri()).toBeGreaterThan(12);box.delete();sphere.delete();result.delete();});
it("selects direct clearance for small meshes and conservative simplification for large meshes",()=>{
  expect(
    buildAdaptiveClearancePolicy(
      DIRECT_CLEARANCE_TRIANGLE_LIMIT,
      .2,
      1e-6,
    ),
  ).toEqual({
    simplify:false,
    simplificationToleranceMm:1e-6,
    sphereSegments:16,
  });

  const largeMeshPolicy=buildAdaptiveClearancePolicy(
    DIRECT_CLEARANCE_TRIANGLE_LIMIT+1,
    .2,
    1e-6,
  );

  expect(largeMeshPolicy.simplify).toBe(true);
  expect(
    largeMeshPolicy.simplificationToleranceMm,
  ).toBeCloseTo(.1,10);

  expect(
    buildAdaptiveClearancePolicy(
      200_000,
      0,
      1e-6,
    ),
  ).toEqual({
    simplify:false,
    simplificationToleranceMm:1e-6,
    sphereSegments:16,
  });
});
it("uses a finer adaptive policy for high-quality large meshes",()=>{
  const standard=buildAdaptiveClearancePolicy(
    DIRECT_CLEARANCE_TRIANGLE_LIMIT+1,
    0.2,
    1e-6,
    "standard",
  );

  const high=buildAdaptiveClearancePolicy(
    DIRECT_CLEARANCE_TRIANGLE_LIMIT+1,
    0.2,
    1e-6,
    "high",
  );

  expect(standard.simplify).toBe(true);
  expect(high.simplify).toBe(true);

  expect(high.simplificationToleranceMm)
    .toBeLessThan(standard.simplificationToleranceMm);

  expect(high.sphereSegments)
    .toBeGreaterThan(standard.sphereSegments);

  expect(standard.simplificationToleranceMm)
    .toBeCloseTo(0.1);

  expect(high.simplificationToleranceMm)
    .toBeCloseTo(0.04);

  expect(standard.sphereSegments).toBe(8);
  expect(high.sphereSegments).toBe(16);
});

it("keeps small high-quality meshes unsimplified with 32 sphere segments",()=>{
  const policy=buildAdaptiveClearancePolicy(
    DIRECT_CLEARANCE_TRIANGLE_LIMIT,
    0.2,
    1e-6,
    "high",
  );

  expect(policy.simplify).toBe(false);
  expect(policy.sphereSegments).toBe(32);
});



