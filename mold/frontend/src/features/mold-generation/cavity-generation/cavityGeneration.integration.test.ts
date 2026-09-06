import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import { generateMoldBodies, type CutPlaneData } from "../reference-mold-definition/orthogonalMold";
import { validateAndPreparePartSolid } from "./partSolid.validator";
import { generateCavityBodies } from "./cavityBody.generator";
import { buildCavityGenerationInput } from "./cavityGeneration.input";
import { canonicalCube } from "./cavityGeneration.testFixtures";
import { createCavityTool, manifoldFromPayload, boundsFromManifold, getManifoldModule } from "./manifold.engine";
import { SphereGeometry } from "three";

const k1={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}},k2={min:{x:-10,y:-10,z:-10},max:{x:20,y:20,z:20}};
const cuttingPlane:CutPlaneData={axis:"x",coordinate:5,normal:{x:1,y:0,z:0},sourceSketchId:"middle",sourceFace:"left",order:0};
function definition():ReferenceMoldDefinition {const base:ReferenceMoldDefinition={schemaVersion:1,definitionId:"integration",modelId:"model",coordinateSystem:{units:"millimeters",upAxis:"Z"},selectionBoxBounds:k1,referenceMoldBlock:{clearanceMm:10,bounds:k2},usedFaces:["left"]};return {...base,moldBodies:generateMoldBodies(base,[cuttingPlane])};}

it("runs Stage A then Stage B and removes the real part volume from complete reference mold material",async()=>{
  const mold=definition();expect(mold.moldBodies!.reduce((sum,body)=>sum+body.volumeMm3,0)).toBeCloseTo(27_000,8);
  const input=buildCavityGenerationInput({sourcePartMesh:canonicalCube("model",k1),definition:mold,cuttingPlanes:[],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1});
  const validation=validateAndPreparePartSolid(input);expect(validation.ok).toBe(true);const tool=await createCavityTool(validation.prepared!,0,"standard",input.tolerancePolicy.booleanToleranceMm);const result=await generateCavityBodies(input,tool);
  expect(result.subtractionDiagnostics).toMatchObject({sourceBodyCount:2,affectedBodyCount:2,unaffectedBodyCount:0,originalVolumeMm3:27_000,removedVolumeMm3:1_000,resultVolumeMm3:26_000});
  expect(result.bodies.every(body=>body.watertight&&body.cavityValidation.manifold)).toBe(true);expect(result.bodies.reduce((sum,body)=>sum+body.volumeMm3,0)).toBeCloseTo(26_000,5);
});

it("preserves non-intersected mold bodies exactly",async()=>{
  const mold=definition();const partBounds={min:{x:6,y:2,z:2},max:{x:9,y:8,z:8}};const input=buildCavityGenerationInput({sourcePartMesh:canonicalCube("model",partBounds),definition:mold,cuttingPlanes:[],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1});const validation=validateAndPreparePartSolid(input);const tool=await createCavityTool(validation.prepared!,0,"standard",input.tolerancePolicy.booleanToleranceMm);const result=await generateCavityBodies(input,tool);const unaffected=result.bodies.find(body=>!body.cavityAffected)!;const source=input.moldBodies.find(body=>body.id===unaffected.parentBodyId)!;
  expect(result.subtractionDiagnostics?.affectedBodyCount).toBe(1);expect(result.subtractionDiagnostics?.unaffectedBodyCount).toBe(1);expect(unaffected.mesh).toEqual(source.mesh);expect(unaffected.geometryVersion).toBe(source.geometryVersion);
});

it("removes more material for positive clearance than for exact clearance",async()=>{
  const mold=definition();const sourcePartMesh=canonicalCube("model",k1);const exactInput=buildCavityGenerationInput({sourcePartMesh,definition:mold,cuttingPlanes:[],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1});const exactValidation=validateAndPreparePartSolid(exactInput);const exactTool=await createCavityTool(exactValidation.prepared!,0,"standard",exactInput.tolerancePolicy.booleanToleranceMm);const exact=await generateCavityBodies(exactInput,exactTool);
  const clearanceInput=buildCavityGenerationInput({sourcePartMesh,definition:mold,cuttingPlanes:[],cavityClearanceMm:0.2,qualityMode:"standard",generationVersion:2});const clearanceValidation=validateAndPreparePartSolid(clearanceInput);const clearanceTool=await createCavityTool(clearanceValidation.prepared!,0.2,"standard",clearanceInput.tolerancePolicy.booleanToleranceMm);const cleared=await generateCavityBodies(clearanceInput,clearanceTool);
  expect(cleared.subtractionDiagnostics!.removedVolumeMm3).toBeGreaterThan(exact.subtractionDiagnostics!.removedVolumeMm3);expect(cleared.subtractionDiagnostics!.affectedBodyCount).toBeGreaterThanOrEqual(1);
});

it("creates a non-rectangular cavity from an ellipsoid-like part fixture",async()=>{
  const geometry=new SphereGeometry(1,16,12);const attribute=geometry.getAttribute("position");const positions:number[]=[];for(let index=0;index<attribute.count;index+=1)positions.push(attribute.getX(index)*3+5,attribute.getY(index)*4+5,attribute.getZ(index)*2+5);const sourceIndex=geometry.getIndex()!;const indices=Array.from({length:sourceIndex.count},(_,index)=>sourceIndex.getX(index));const ellipsoid={...canonicalCube("model",k1),positions,indices,localBounds:{min:{x:2,y:1,z:3},max:{x:8,y:9,z:7}},geometryVersion:"ellipsoid",sourceSignature:"ellipsoid"};const input=buildCavityGenerationInput({sourcePartMesh:ellipsoid,definition:definition(),cuttingPlanes:[],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1});const validation=validateAndPreparePartSolid(input);expect(validation.ok).toBe(true);const tool=await createCavityTool(validation.prepared!,0,"standard",input.tolerancePolicy.booleanToleranceMm);const result=await generateCavityBodies(input,tool);geometry.dispose();
  expect(result.subtractionDiagnostics!.affectedBodyCount).toBeGreaterThanOrEqual(1);expect(result.subtractionDiagnostics!.removedVolumeMm3).toBeGreaterThan(0);expect(result.cavityTool.triangleCount).toBeGreaterThan(12);
});

// Regression for "Mold 1: Boolean result extends outside the reference mold
// bounds." (reason code body_outside_k2). Runtime verification measured a
// real Manifold-3D WASM subtraction on this exact Cut-by-Face body producing
// a 3.7595e-6mm outward excursion on X (min side) -- under 0.5 Float32 ULP at
// this coordinate magnitude, i.e. ordinary IEEE-754 rounding noise, not a
// genuine geometric breakthrough. Values below reproduce that measurement
// deterministically (a real scanned-part bounding box combined with a
// user-entered Mold Scale clearance rarely lands on Float32-exact decimals).
it("does not reject a Float32-rounding-only excursion after a fractional Mold Scale clearance (regression for body_outside_k2 false positive)",async()=>{
  const adversarialClearanceMm=21.8864392;
  const adversarialK1MinX=-42.14972800000001;
  const regressionK1:Bounds3={min:{x:adversarialK1MinX,y:0,z:0},max:{x:adversarialK1MinX+80,y:60,z:40}};
  const regressionCuttingPlane:CutPlaneData={axis:"x",coordinate:regressionK1.min.x+40,normal:{x:1,y:0,z:0},sourceSketchId:"middle",sourceFace:"left",order:0};
  const regressionBase:ReferenceMoldDefinition={schemaVersion:1,definitionId:"regression-body-outside-k2",modelId:"model",coordinateSystem:{units:"millimeters",upAxis:"Z"},selectionBoxBounds:regressionK1,referenceMoldBlock:{clearanceMm:adversarialClearanceMm,bounds:{min:{x:regressionK1.min.x-adversarialClearanceMm,y:regressionK1.min.y-adversarialClearanceMm,z:regressionK1.min.z-adversarialClearanceMm},max:{x:regressionK1.max.x+adversarialClearanceMm,y:regressionK1.max.y+adversarialClearanceMm,z:regressionK1.max.z+adversarialClearanceMm}}},usedFaces:["left"]};
  const regressionDefinition:ReferenceMoldDefinition={...regressionBase,moldBodies:generateMoldBodies(regressionBase,[regressionCuttingPlane])};
  const partBounds:Bounds3={min:{x:regressionK1.min.x+20,y:15,z:10},max:{x:regressionK1.min.x+60,y:45,z:30}};
  const input=buildCavityGenerationInput({sourcePartMesh:canonicalCube("model",partBounds),definition:regressionDefinition,cuttingPlanes:[],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1});

  // Independently confirm (outside the fix under test) that this case really
  // does carry a nonzero, Float32-rounding-scale excursion before asserting
  // the fixed pipeline accepts it -- otherwise this test would not be
  // exercising the reported defect at all.
  const module=await getManifoldModule();
  const failingBody=input.moldBodies.find(body=>body.name==="Mold 1")!;
  const sourceSolid=manifoldFromPayload(module,failingBody.mesh,input.tolerancePolicy.booleanToleranceMm);
  const rawBounds=boundsFromManifold(sourceSolid);
  sourceSolid.delete();
  const measuredOutwardDeltaMm=Math.max(0,input.referenceMoldBlockBounds.min.x-rawBounds.min.x,rawBounds.max.x-input.referenceMoldBlockBounds.max.x);
  expect(measuredOutwardDeltaMm).toBeGreaterThan(0);
  expect(measuredOutwardDeltaMm).toBeLessThan(1e-5); // Float32-rounding scale, not a real breakthrough
  expect(measuredOutwardDeltaMm).toBeLessThanOrEqual(input.tolerancePolicy.containmentToleranceMm);

  const validation=validateAndPreparePartSolid(input);
  expect(validation.ok).toBe(true);
  const tool=await createCavityTool(validation.prepared!,0,"standard",input.tolerancePolicy.booleanToleranceMm);
  const result=await generateCavityBodies(input,tool);

  expect(result.blockers).toHaveLength(0);
  expect(result.bodies.every(body=>body.watertight&&body.cavityValidation.manifold)).toBe(true);
  expect(result.bodies.every(body=>body.volumeMm3>0)).toBe(true);
});

it("still rejects a genuinely out-of-bounds Boolean result far larger than Float32 rounding noise",async()=>{
  // Same production pipeline and same fractional-clearance mold as above, but
  // K2 is deliberately shrunk by 0.01mm on X-min -- roughly 4,700x the
  // measured Float32 excursion and >1,000x the corrected containmentToleranceMm
  // -- so the mold body's own material (built to fit the *true* K2) now
  // genuinely, meaningfully protrudes past the (shrunk) reference bounds.
  const adversarialClearanceMm=21.8864392;
  const adversarialK1MinX=-42.14972800000001;
  const regressionK1:Bounds3={min:{x:adversarialK1MinX,y:0,z:0},max:{x:adversarialK1MinX+80,y:60,z:40}};
  const regressionCuttingPlane:CutPlaneData={axis:"x",coordinate:regressionK1.min.x+40,normal:{x:1,y:0,z:0},sourceSketchId:"middle",sourceFace:"left",order:0};
  const trueK2:Bounds3={min:{x:regressionK1.min.x-adversarialClearanceMm,y:regressionK1.min.y-adversarialClearanceMm,z:regressionK1.min.z-adversarialClearanceMm},max:{x:regressionK1.max.x+adversarialClearanceMm,y:regressionK1.max.y+adversarialClearanceMm,z:regressionK1.max.z+adversarialClearanceMm}};
  const regressionBase:ReferenceMoldDefinition={schemaVersion:1,definitionId:"regression-genuine-breakthrough",modelId:"model",coordinateSystem:{units:"millimeters",upAxis:"Z"},selectionBoxBounds:regressionK1,referenceMoldBlock:{clearanceMm:adversarialClearanceMm,bounds:trueK2},usedFaces:["left"]};
  const regressionDefinition:ReferenceMoldDefinition={...regressionBase,moldBodies:generateMoldBodies(regressionBase,[regressionCuttingPlane])};
  const partBounds:Bounds3={min:{x:regressionK1.min.x+20,y:15,z:10},max:{x:regressionK1.min.x+60,y:45,z:30}};
  const input=buildCavityGenerationInput({sourcePartMesh:canonicalCube("model",partBounds),definition:regressionDefinition,cuttingPlanes:[],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1});

  const shrunkInput={...input,referenceMoldBlockBounds:{...trueK2,min:{...trueK2.min,x:trueK2.min.x+0.01}}};
  // 0.01mm is >300x the actual containmentToleranceMm at this coordinate
  // magnitude (~3.05e-5mm) -- a meaningful breakthrough, not rounding noise.
  expect(shrunkInput.tolerancePolicy.containmentToleranceMm).toBeLessThan(0.01/300);

  const validation=validateAndPreparePartSolid(shrunkInput);
  expect(validation.ok).toBe(true);
  const tool=await createCavityTool(validation.prepared!,0,"standard",shrunkInput.tolerancePolicy.booleanToleranceMm);
  await expect(generateCavityBodies(shrunkInput,tool)).rejects.toThrow(/extends outside the reference mold bounds/);
});
