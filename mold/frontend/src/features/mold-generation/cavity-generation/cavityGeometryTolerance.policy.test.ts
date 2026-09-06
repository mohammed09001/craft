import type { Bounds3 } from "../split-face/splitFace.contracts";
import { buildCavityGeometryTolerancePolicy } from "./cavityGeometryTolerance.policy";

it("builds finite scale-aware tolerances for tiny and huge models",()=>{
  const tiny=buildCavityGeometryTolerancePolicy({min:{x:0,y:0,z:0},max:{x:0.001,y:0.002,z:0.003}},0);
  const huge=buildCavityGeometryTolerancePolicy({min:{x:-500_000,y:-250_000,z:-100_000},max:{x:500_000,y:250_000,z:100_000}},2);
  expect(Object.values(tiny).every(value=>Number.isFinite(value)&&value>0)).toBe(true);
  expect(Object.values(huge).every(value=>Number.isFinite(value)&&value>0)).toBe(true);
  expect(huge.linearToleranceMm).toBeGreaterThan(tiny.linearToleranceMm);
  expect(huge.linearToleranceMm).toBeLessThanOrEqual(1e-3);
});

it("rejects invalid bounds and clearance",()=>{
  expect(()=>buildCavityGeometryTolerancePolicy({min:{x:0,y:0,z:0},max:{x:0,y:1,z:1}},0)).toThrow();
  expect(()=>buildCavityGeometryTolerancePolicy({min:{x:0,y:0,z:0},max:{x:1,y:1,z:1}},Number.NaN)).toThrow();
});

// Independent Float32-ULP reference (DataView bit-read, not the source's
// Float32Array/Int32Array trick) used only to sanity-check the policy's
// output against IEEE-754 behavior -- not to mirror its implementation.
function referenceFloat32Ulp(magnitude:number):number{
  const value=Math.fround(Math.abs(magnitude));
  if(value===0)return Math.pow(2,-149);
  const view=new DataView(new ArrayBuffer(4));
  view.setFloat32(0,value,true);
  view.setUint32(0,view.getUint32(0,true)+1,true);
  return view.getFloat32(0,true)-value;
}

describe("containmentToleranceMm (Float32-aware precision floor)",()=>{
  it("is never smaller than linearToleranceMm",()=>{
    const cases:ReadonlyArray<{bounds:Bounds3;clearanceMm:number}>=[
      {bounds:{min:{x:0,y:0,z:0},max:{x:20,y:20,z:20}},clearanceMm:10},
      {bounds:{min:{x:-45,y:-30,z:-21.8864392},max:{x:45,y:81.8864392,z:61.8864392}},clearanceMm:21.8864392},
      {bounds:{min:{x:-90,y:-78.9,z:-78.9},max:{x:90,y:78.9,z:78.9}},clearanceMm:78.9},
      {bounds:{min:{x:-500_000,y:-250_000,z:-100_000},max:{x:500_000,y:250_000,z:100_000}},clearanceMm:2},
    ];

    for(const {bounds,clearanceMm} of cases){
      const policy=buildCavityGeometryTolerancePolicy(bounds,clearanceMm);
      expect(policy.containmentToleranceMm).toBeGreaterThanOrEqual(policy.linearToleranceMm);
      expect(Number.isFinite(policy.containmentToleranceMm)).toBe(true);
      expect(policy.containmentToleranceMm).toBeGreaterThan(0);
    }
  });

  it("covers the empirically measured Mold Scale fractional values (21.8864392mm, 78.9mm) at realistic mold scale",()=>{
    // Matches the runtime-verified adversarial case: a Cut-by-Face body whose
    // outer wall sits exactly on K2, subtracted through the real Manifold
    // kernel, measured a 3.7595e-6mm outward excursion on X.
    const bounds:Bounds3={min:{x:-64.0361672,y:-21.8864392,z:-21.8864392},max:{x:59.7367112,y:81.8864392,z:61.8864392}};
    const policy=buildCavityGeometryTolerancePolicy(bounds,21.8864392);
    const measuredExcursionMm=3.759472647857365e-6;
    expect(policy.containmentToleranceMm).toBeGreaterThan(measuredExcursionMm);

    const bounds78=buildCavityGeometryTolerancePolicy({min:{x:-78.9,y:-78.9,z:-78.9},max:{x:158.9,y:158.9,z:158.9}},78.9);
    expect(Number.isFinite(bounds78.containmentToleranceMm)).toBe(true);
    expect(bounds78.containmentToleranceMm).toBeGreaterThan(0);
  });

  it("is at least a multiple of the Float32 ULP at the mold's own maximum absolute coordinate",()=>{
    const sizes:ReadonlyArray<Bounds3>=[
      {min:{x:0,y:0,z:0},max:{x:20,y:20,z:20}}, // small mold
      {min:{x:-50,y:-40,z:-30},max:{x:150,y:140,z:130}}, // 100-300mm mold
      {min:{x:-1000,y:-1000,z:-1000},max:{x:1000,y:1000,z:1000}}, // large mold
      {min:{x:-64.0361672,y:-21.8864392,z:-21.8864392},max:{x:-2.1497280000001,y:81.8864392,z:61.8864392}}, // negative + fractional
    ];

    for(const bounds of sizes){
      const policy=buildCavityGeometryTolerancePolicy(bounds,10);
      const maxAbsCoordinate=Math.max(
        Math.abs(bounds.min.x),Math.abs(bounds.max.x),
        Math.abs(bounds.min.y),Math.abs(bounds.max.y),
        Math.abs(bounds.min.z),Math.abs(bounds.max.z),
      );
      const ulp=referenceFloat32Ulp(maxAbsCoordinate);
      expect(policy.containmentToleranceMm).toBeGreaterThanOrEqual(ulp);
    }
  });

  it("keys the precision floor off coordinate magnitude, not diagonal, for translated-but-modest-size geometry",()=>{
    // Same 100mm-diagonal-scale box, once near the origin and once translated
    // far away. The Float32 floor must grow with the translation even though
    // the box's own dimensions/diagonal are identical in both cases.
    const nearOrigin=buildCavityGeometryTolerancePolicy({min:{x:0,y:0,z:0},max:{x:60,y:60,z:60}},10);
    const translated=buildCavityGeometryTolerancePolicy({min:{x:9_999_940,y:9_999_940,z:9_999_940},max:{x:10_000_000,y:10_000_000,z:10_000_000}},10);
    expect(translated.containmentToleranceMm).toBeGreaterThan(nearOrigin.containmentToleranceMm);
  });

  it("remains far below meaningful manufacturing thresholds for realistic mold scales",()=>{
    // At real product scale (tens to hundreds of mm) the floor must stay in
    // the sub-micron range -- proof this is not "increasing tolerance
    // blindly," it tracks a physical constant (Float32 ULP), not a guess.
    const realistic=buildCavityGeometryTolerancePolicy({min:{x:-150,y:-150,z:-150},max:{x:150,y:150,z:150}},25);
    expect(realistic.containmentToleranceMm).toBeLessThan(1e-4);
  });

  it("leaves the existing default 10mm and Automatic Segmentation 25mm clearance policies finite and unchanged in kind",()=>{
    const defaultClearance=buildCavityGeometryTolerancePolicy({min:{x:-40,y:-30,z:-20},max:{x:40,y:30,z:20}},10);
    const segmentationClearance=buildCavityGeometryTolerancePolicy({min:{x:-40,y:-30,z:-20},max:{x:40,y:30,z:20}},25);
    for(const policy of [defaultClearance,segmentationClearance]){
      expect(Object.values(policy).every(value=>Number.isFinite(value)&&value>0)).toBe(true);
      expect(policy.containmentToleranceMm).toBeGreaterThanOrEqual(policy.linearToleranceMm);
    }
  });

  it("handles zero-centered, negative, and near-power-of-two coordinate magnitudes without discontinuity",()=>{
    const zeroCentered=buildCavityGeometryTolerancePolicy({min:{x:-50,y:-50,z:-50},max:{x:50,y:50,z:50}},10);
    const justBelowPow2=buildCavityGeometryTolerancePolicy({min:{x:-63.999,y:-63.999,z:-63.999},max:{x:63.999,y:63.999,z:63.999}},10);
    const justAbovePow2=buildCavityGeometryTolerancePolicy({min:{x:-64.001,y:-64.001,z:-64.001},max:{x:64.001,y:64.001,z:64.001}},10);
    for(const policy of [zeroCentered,justBelowPow2,justAbovePow2]){
      expect(Number.isFinite(policy.containmentToleranceMm)).toBe(true);
      expect(policy.containmentToleranceMm).toBeGreaterThan(0);
    }
    // Crossing the 64mm exponent boundary should roughly double the ULP-based
    // floor (2^6 -> 2^7 exponent step), not spike or collapse.
    expect(justAbovePow2.containmentToleranceMm).toBeGreaterThan(justBelowPow2.containmentToleranceMm*0.9);
    expect(justAbovePow2.containmentToleranceMm).toBeLessThan(justBelowPow2.containmentToleranceMm*3);
  });
});
