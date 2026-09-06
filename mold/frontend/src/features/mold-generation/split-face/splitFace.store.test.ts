import { createSplitFaceStoreCreator, selectActiveMoldBodies, selectSpruePresentationDefinitions, type SplitFaceStoreDeps, type SplitFaceState } from "./splitFace.store";
import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import type { CavityGenerationInput } from "../cavity-generation/cavityGeneration.contracts";
import { generateCavityBodies } from "../cavity-generation/cavityBody.generator";
import { createCavityTool } from "../cavity-generation/manifold.engine";
import { validateAndPreparePartSolid } from "../cavity-generation/partSolid.validator";
import { SprueGenerationService } from "../sprue-generation/SprueGenerationService";
import { designSprueProfile } from "../sprue-generation";
import type { ValidSpruePreviewPlacement } from "../sprue-generation/sprueGeneration.contracts";
import { cancelDerivedMoldEvaluation, runDerivedMoldEvaluation as runDerivedMoldEvaluationProduction } from "../workflow";
import { AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY } from "../registration";
import { createStore, type StoreApi } from "zustand/vanilla";
const runDerivedMoldEvaluation=vi.fn(runDerivedMoldEvaluationProduction);
const runCavityGenerationInWorker=Object.assign(vi.fn(async(input:CavityGenerationInput)=>{
 const validation=validateAndPreparePartSolid(input);
 if(!validation.ok||validation.prepared===null)throw new Error(validation.blockers[0]?.message??"Uploaded model is not a subtractable solid.");
 const tool=await createCavityTool(validation.prepared,input.cavityClearanceMm,input.qualityMode,input.geometryToleranceMm);
 return {result:await generateCavityBodies(input,tool),validationWarnings:validation.warnings};
}),{cancel:vi.fn()}) as SplitFaceStoreDeps["runCavityGenerationInWorker"];
const cancelActiveCavityGeneration=vi.fn();
const k1={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}};
let useSplitFaceStore:StoreApi<SplitFaceState>;
const profileDesign=designSprueProfile(null);
const placement=(x=5):ValidSpruePreviewPlacement=>({status:"valid",topPoint:{x,y:5,z:30},cavityPoint:{x,y:5,z:20},inwardDirection:{x:0,y:0,z:-1},stemLengthMm:10,profileDesign,coordinateSpace:"mold-local"});
async function prepareSprueState(...faces:Array<"front"|"right">){const canonicalPartGeometry=canonicalCube("m",k1);const s=useSplitFaceStore.getState();s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);s.enterSelection();(faces.length===0?["front"] as const:faces).forEach(face=>s.toggleFace(face));if(faces.length>1){for(const plane of useSplitFaceStore.getState().cuttingPlanes){s.beginPlaneDrag(plane.id);s.commitPlaneDrag(plane.id,.5,k1);}}expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);const result=useSplitFaceStore.getState().cavity.result!;const body=result.bodies.find(candidate=>candidate.cavityAffected&&candidate.bounds.min.x<=5&&candidate.bounds.max.x>=5&&candidate.bounds.min.y<=5&&candidate.bounds.max.y>=5&&candidate.bounds.max.z===30);expect(body).toBeDefined();return body!;}
beforeEach(()=>{useSplitFaceStore=createStore(createSplitFaceStoreCreator({runDerivedMoldEvaluation,cancelDerivedMoldEvaluation,runCavityGenerationInWorker,cancelActiveCavityGeneration}));});
afterEach(()=>vi.restoreAllMocks());
describe("face-driven mold workflow",()=>{
 it("selects, deterministically orders, toggles, clears, and resets faces",()=>{const s=useSplitFaceStore.getState();s.enterSelection();s.toggleFace("top");s.toggleFace("front");expect(useSplitFaceStore.getState().selectedFaceIds).toEqual(["front","top"]);s.toggleFace("front");expect(useSplitFaceStore.getState().selectedFaceIds).toEqual(["top"]);s.clearSelection();expect(useSplitFaceStore.getState().workflow).toBe("selectingFaces");s.toggleFace("left");s.clearForModelReplacement();expect(useSplitFaceStore.getState().selectedFaceIds).toEqual([]);});
 it.each([[ ["front"],2],[["front","right"],4],[["front","right","top"],8],[["left","right"],3]] as const)("creates geometry-derived bodies for %j",async(faces,count)=>{const s=useSplitFaceStore.getState();s.enterSelection();faces.forEach(f=>useSplitFaceStore.getState().toggleFace(f));expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);expect(useSplitFaceStore.getState().definition?.moldBodies).toHaveLength(count);expect(useSplitFaceStore.getState().workflow).toBe("partsReady");});
 it("rebases the manufactured mold frame to Z=0 and preserves bottom clearance for every downstream body",async()=>{const part=canonicalCube("m",k1);const s=useSplitFaceStore.getState();s.setCanonicalPartGeometrySignature(part.sourceSignature);s.enterSelection();s.toggleFace("front");expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);const definition=useSplitFaceStore.getState().definition!;expect(definition.referenceMoldBlock.bounds.min.z).toBe(0);expect(definition.selectionBoxBounds.min.z).toBe(definition.referenceMoldBlock.clearanceMm);expect(definition.moldFrame?.partOffset.z).toBe(definition.referenceMoldBlock.clearanceMm);expect(definition.moldFrame?.semanticFaces.top).toEqual({axis:"z",direction:1});expect(Math.min(...definition.moldBodies!.map(body=>body.bounds.min.z))).toBeGreaterThanOrEqual(0);expect(await useSplitFaceStore.getState().createCavity(part)).toBe(true);expect(useSplitFaceStore.getState().cavity.result!.cavityTool.bounds.min.z).toBe(definition.referenceMoldBlock.clearanceMm);expect(Math.min(...useSplitFaceStore.getState().lastCommittedResult!.bodies.map(body=>body.bounds.min.z))).toBeGreaterThanOrEqual(-1e-6);});
 it("undoes and redoes the atomic result with stable bodies",async()=>{const s=useSplitFaceStore.getState();s.enterSelection();s.toggleFace("front");await useSplitFaceStore.getState().createMoldParts("m",k1);const ids=useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id);useSplitFaceStore.getState().undo();expect(useSplitFaceStore.getState().definition).toBeNull();expect(useSplitFaceStore.getState().selectedFaceIds).toEqual(["front"]);expect(useSplitFaceStore.getState().workflow).toBe("planesReady");useSplitFaceStore.getState().redo();expect(useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id)).toEqual(ids);});
 it("preserves partsReady after clearance live-rebuild while invalidating derived output",async()=>{const s=useSplitFaceStore.getState();s.enterSelection();s.toggleFace("bottom");await useSplitFaceStore.getState().createMoldParts("m",k1);useSplitFaceStore.getState().setClearanceMm(11);expect(useSplitFaceStore.getState().definition?.referenceMoldBlock.clearanceMm).toBe(11);expect(useSplitFaceStore.getState().lastCommittedResult).toBeNull();expect(useSplitFaceStore.getState().cavity.status).toBe("unavailable");expect(useSplitFaceStore.getState().selectedFaceIds).toEqual(["bottom"]);expect(useSplitFaceStore.getState().workflow).toBe("partsReady");});
 it("coalesces continuous clearance updates into one reversible history transaction",async()=>{const s=useSplitFaceStore.getState();s.enterSelection();s.toggleFace("front");await useSplitFaceStore.getState().createMoldParts("m",k1);const before=useSplitFaceStore.getState().undoStack.length;s.beginClearanceEdit();s.updateClearanceEdit(12);s.updateClearanceEdit(13);s.updateClearanceEdit(14);expect(useSplitFaceStore.getState().clearanceMm).toBe(14);expect(useSplitFaceStore.getState().undoStack).toHaveLength(before);s.commitClearanceEdit();expect(useSplitFaceStore.getState().undoStack).toHaveLength(before+1);useSplitFaceStore.getState().undo();expect(useSplitFaceStore.getState().clearanceMm).toBe(10);useSplitFaceStore.getState().redo();expect(useSplitFaceStore.getState().clearanceMm).toBe(14);});
 it("commits one canonical drag action and supports undo and redo",()=>{const s=useSplitFaceStore.getState();s.enterSelection();s.toggleFace("front");const before=useSplitFaceStore.getState().undoStack.length;const id=useSplitFaceStore.getState().cuttingPlanes[0]!.id;s.beginPlaneDrag(id);s.commitPlaneDrag(id,.4,k1);expect(useSplitFaceStore.getState().cuttingPlanes[0]!.normalizedPosition).toBe(.4);expect(useSplitFaceStore.getState().undoStack).toHaveLength(before+1);useSplitFaceStore.getState().undo();expect(useSplitFaceStore.getState().cuttingPlanes[0]!.normalizedPosition).toBeCloseTo(1);useSplitFaceStore.getState().redo();expect(useSplitFaceStore.getState().cuttingPlanes[0]!.normalizedPosition).toBe(.4);});
 it("preserves generated bodies on a canceled grab and invalidates them on a moved commit",async()=>{const s=useSplitFaceStore.getState();s.enterSelection();s.toggleFace("right");await useSplitFaceStore.getState().createMoldParts("m",k1);const id=useSplitFaceStore.getState().cuttingPlanes[0]!.id;useSplitFaceStore.getState().beginPlaneDrag(id);useSplitFaceStore.getState().cancelPlaneDrag();expect(useSplitFaceStore.getState().definition?.moldBodies).toBeDefined();useSplitFaceStore.getState().beginPlaneDrag(id);useSplitFaceStore.getState().commitPlaneDrag(id,.5,k1);expect(useSplitFaceStore.getState().definition).toBeNull();expect(useSplitFaceStore.getState().selectedFaceIds).toEqual(["right"]);useSplitFaceStore.getState().undo();expect(useSplitFaceStore.getState().definition).toBeNull();});
 it("commits cavity bodies atomically and restores them deterministically through undo and redo",async()=>{const canonicalPartGeometry=canonicalCube("m",k1);const s=useSplitFaceStore.getState();s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);s.enterSelection();s.toggleFace("front");await useSplitFaceStore.getState().createMoldParts("m",k1);const base=useSplitFaceStore.getState().definition!.moldBodies!;expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);expect(useSplitFaceStore.getState().cavity.status).toBe("complete");const result=useSplitFaceStore.getState().cavity.result!;const cavity=result.bodies;expect(cavity.some(body=>body.cavityAffected)).toBe(true);expect(cavity.reduce((sum,b)=>sum+b.volumeMm3,0)).toBeCloseTo(30**3-result.cavityTool.volumeMm3,3);const ids=cavity.map(body=>body.id);useSplitFaceStore.getState().undo();expect(useSplitFaceStore.getState().cavity.status).toBe("ready");expect(useSplitFaceStore.getState().definition!.moldBodies).toEqual(base);useSplitFaceStore.getState().redo();expect(useSplitFaceStore.getState().cavity.result!.bodies.map(body=>body.id)).toEqual(ids);});
 it("processes hidden bodies and invalidates cavity and the committed result after an upstream plane move",async()=>{const canonicalPartGeometry=canonicalCube("m",k1);const s=useSplitFaceStore.getState();s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);s.enterSelection();s.toggleFace("right");await useSplitFaceStore.getState().createMoldParts("m",k1);const hidden=useSplitFaceStore.getState().definition!.moldBodies![0]!.id;useSplitFaceStore.getState().setBodyVisibility(hidden,false);await useSplitFaceStore.getState().createCavity(canonicalPartGeometry);expect(selectActiveMoldBodies(useSplitFaceStore.getState())?.find(b=>b.id===hidden)?.visible).toBe(false);const plane=useSplitFaceStore.getState().cuttingPlanes[0]!;useSplitFaceStore.getState().beginPlaneDrag(plane.id);useSplitFaceStore.getState().commitPlaneDrag(plane.id,.5,k1);expect(useSplitFaceStore.getState().cavity.status).toBe("unavailable");expect(useSplitFaceStore.getState().definition).toBeNull();expect(useSplitFaceStore.getState().lastCommittedResult).toBeNull();const moved=useSplitFaceStore.getState();expect(selectActiveMoldBodies(moved)?.find(b=>b.id===hidden)).toBeUndefined();useSplitFaceStore.getState().undo();expect(useSplitFaceStore.getState().definition).toBeNull();});
 it("blocks duplicate operations and commits nothing for invalid part solid",async()=>{const valid=canonicalCube("m",k1);const s=useSplitFaceStore.getState();s.setCanonicalPartGeometrySignature(valid.sourceSignature);s.enterSelection();s.toggleFace("top");await useSplitFaceStore.getState().createMoldParts("m",k1);const base=useSplitFaceStore.getState().definition;const running=useSplitFaceStore.getState().createCavity(valid);expect(await useSplitFaceStore.getState().createCavity(valid)).toBe(false);expect(await running).toBe(true);useSplitFaceStore.getState().undo();const invalid={...valid,indices:valid.indices.slice(0,-6),sourceSignature:"invalid"};useSplitFaceStore.getState().setCanonicalPartGeometrySignature(invalid.sourceSignature);expect(await useSplitFaceStore.getState().createCavity(invalid)).toBe(false);expect(useSplitFaceStore.getState().definition).toEqual(base);expect(useSplitFaceStore.getState().cavity.status).toBe("blocked");});
 it("rebuilds the cavity atomically: Rebuild Cavity re-runs the same action, without resetting workflow or cutting planes",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();

  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");

  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);

  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
  expect(useSplitFaceStore.getState().cavity.result).not.toBeNull();
  const firstResultBodies=useSplitFaceStore.getState().cavity.result!.bodies;

  // "Rebuild Cavity" is the same store action re-invoked, not a separate reset-to-edit-mode action.
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);

  expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  expect(useSplitFaceStore.getState().cuttingPlanes).toHaveLength(1);
  expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
  expect(useSplitFaceStore.getState().cavity.result).not.toBeNull();
  expect(useSplitFaceStore.getState().cavity.result!.bodies.map(body=>body.id)).toEqual(firstResultBodies.map(body=>body.id));
 });
 it("sends no explicit Registration sizing policy for Cut by Face, preserving the NORMAL default",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();

  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");

  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);

  expect(useSplitFaceStore.getState().definition?.segmentationLineage).not.toBe(true);
  for(const call of vi.mocked(runDerivedMoldEvaluation).mock.calls){
   expect(call[0].registrationSizingPolicy).toBeUndefined();
  }
 });
 it("commits cavity independently and records registration warning when a rebuild's registration is blocked",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();

  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");

  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
  expect(useSplitFaceStore.getState().registration.status).toBe("generated");

  const actual=await vi.importActual<typeof import("../workflow")>("../workflow");
  vi.mocked(runDerivedMoldEvaluation).mockImplementationOnce(async(input,onProgress)=>{
   const real=await actual.runDerivedMoldEvaluation(input,onProgress);
   return {...real,registration:{...real.registration,status:"blocked" as const,report:real.registration.report===null?null:{...real.registration.report,status:"blocked" as const,reasonCode:"registration_insufficient_safe_area" as const}}};
  });

  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);

  expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
  expect(useSplitFaceStore.getState().registration.status).toBe("blocked");
  expect(useSplitFaceStore.getState().lastCommittedResult?.keyed).toBe(false);
  expect(useSplitFaceStore.getState().cavity.warnings.some(w => w.reasonCode === "registration_insufficient_safe_area")).toBe(true);
  expect(selectActiveMoldBodies(useSplitFaceStore.getState())).toBeDefined();
 });
 it("keeps the previous cavity result and records a structured blocker when regeneration has no intersection",async()=>{const canonicalPartGeometry=canonicalCube("m",k1);const s=useSplitFaceStore.getState();s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);s.enterSelection();s.toggleFace("front");await useSplitFaceStore.getState().createMoldParts("m",k1);expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);const previous=useSplitFaceStore.getState().cavity.result;vi.mocked(runCavityGenerationInWorker).mockRejectedValueOnce(Object.assign(new Error("The cavity tool did not intersect any mold material."),{code:"cavity_no_material_intersection"}));expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(false);expect(useSplitFaceStore.getState().cavity.status).toBe("blocked");expect(useSplitFaceStore.getState().cavity.result).toBe(previous);expect(useSplitFaceStore.getState().cavity.blockers[0]?.reasonCode).toBe("cavity_no_material_intersection");});
 it("atomically creates multiple real Sprues and includes each success in undo/redo history",async()=>{
  const body=await prepareSprueState();
  const before=useSplitFaceStore.getState();
  const originalVersion=body.geometryVersion;
  const firstCreated=await before.createSprue(placement());
  expect({created:firstCreated,error:useSplitFaceStore.getState().error}).toEqual({created:true,error:null});
  const afterFirst=useSplitFaceStore.getState();
  const firstBody=afterFirst.lastCommittedResult!.stages.sprueBodies.find(candidate=>candidate.id===body.id)!;
  expect(firstBody.geometryVersion).not.toBe(originalVersion);
  expect(afterFirst.cavity.result!.bodies.find(candidate=>candidate.id===body.id)!.geometryVersion).toBe(originalVersion);
  expect(afterFirst.undoStack).toHaveLength(before.undoStack.length+1);
  expect(afterFirst.sprueStatus).toBe("idle");
  const secondCreated=await afterFirst.createSprue(placement(8));
  expect({created:secondCreated,error:useSplitFaceStore.getState().error}).toEqual({created:true,error:null});
  const afterSecond=useSplitFaceStore.getState();
  const secondBody=afterSecond.lastCommittedResult!.stages.sprueBodies.find(candidate=>candidate.id===body.id)!;
  expect(secondBody.geometryVersion).not.toBe(firstBody.geometryVersion);
  expect(afterSecond.undoStack).toHaveLength(before.undoStack.length+2);
  afterSecond.undo();
  expect(useSplitFaceStore.getState().lastCommittedResult!.stages.sprueBodies.find(candidate=>candidate.id===body.id)!.geometryVersion).toBe(firstBody.geometryVersion);
  useSplitFaceStore.getState().redo();
  expect(useSplitFaceStore.getState().lastCommittedResult!.stages.sprueBodies.find(candidate=>candidate.id===body.id)!.geometryVersion).toBe(secondBody.geometryVersion);
 });
 it("resizes one canonical Sprue per history entry and replays independent Sprues for undo/redo",async()=>{
  await prepareSprueState();
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  expect(await useSplitFaceStore.getState().createSprue(placement(8))).toBe(true);
  const before=useSplitFaceStore.getState();
  const [first,second]=before.sprues;
  expect(first).toBeDefined();expect(second).toBeDefined();
  const originalDiameter=first!.profile.mainDiameterMm;
  const requestedDiameter=originalDiameter+.75;
  const historyLength=before.undoStack.length;

  expect(await before.resizeSprue(first!.operationId,requestedDiameter)).toBe(true);
  const resized=useSplitFaceStore.getState();
  expect(resized.undoStack).toHaveLength(historyLength+1);
  expect(resized.sprues).toHaveLength(2);
  expect(resized.sprues[0]!.profile.mainDiameterMm).toBe(requestedDiameter);
  expect(resized.sprues[0]!.position).toEqual(first!.position);
  expect(resized.sprues[0]!.inwardDirection).toEqual(first!.inwardDirection);
  expect(resized.sprues[0]!.depthMm).toBe(first!.depthMm);
  expect(resized.sprues[1]!.profile.mainDiameterMm).toBe(second!.profile.mainDiameterMm);
  resized.undo();
  expect(useSplitFaceStore.getState().sprues[0]!.profile.mainDiameterMm).toBe(originalDiameter);
  useSplitFaceStore.getState().redo();
  expect(useSplitFaceStore.getState().sprues[0]!.profile.mainDiameterMm).toBe(requestedDiameter);

  const beforeInvalid=useSplitFaceStore.getState().undoStack.length;
  expect(await useSplitFaceStore.getState().resizeSprue(first!.operationId,Number.NaN)).toBe(false);
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(beforeInvalid);
  expect(await useSplitFaceStore.getState().resizeSprue(first!.operationId,requestedDiameter+.25)).toBe(true);
  expect(useSplitFaceStore.getState().sprues[0]!.profile.mainDiameterMm).toBe(requestedDiameter+.25);
 });
 it("resizes the entry neck (lower opening) independently of the main diameter, clamped by it",async()=>{
  await prepareSprueState();
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  const created=useSplitFaceStore.getState();
  const [createdSprue]=created.sprues;
  expect(createdSprue).toBeDefined();
  expect(await created.resizeSprue(createdSprue!.operationId,createdSprue!.profile.mainDiameterMm+2)).toBe(true);

  const before=useSplitFaceStore.getState();
  const [first]=before.sprues;
  expect(first).toBeDefined();
  const originalEntryNeck=first!.profile.entryNeckDiameterMm;
  const originalMain=first!.profile.mainDiameterMm;
  expect(originalEntryNeck).toBeLessThan(originalMain);
  const requestedDiameter=originalEntryNeck+.5;
  const historyLength=before.undoStack.length;

  expect(await before.resizeSprueEntryNeck(first!.operationId,requestedDiameter)).toBe(true);
  const resized=useSplitFaceStore.getState();
  expect(resized.undoStack).toHaveLength(historyLength+1);
  expect(resized.sprues[0]!.profile.entryNeckDiameterMm).toBe(requestedDiameter);
  expect(resized.sprues[0]!.profile.mainDiameterMm).toBe(originalMain);
  resized.undo();
  expect(useSplitFaceStore.getState().sprues[0]!.profile.entryNeckDiameterMm).toBe(originalEntryNeck);
  useSplitFaceStore.getState().redo();
  expect(useSplitFaceStore.getState().sprues[0]!.profile.entryNeckDiameterMm).toBe(requestedDiameter);

  const beforeInvalid=useSplitFaceStore.getState().undoStack.length;
  expect(await useSplitFaceStore.getState().resizeSprueEntryNeck(first!.operationId,Number.NaN)).toBe(false);
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(beforeInvalid);
  expect(await useSplitFaceStore.getState().resizeSprueEntryNeck(first!.operationId,originalMain+10)).toBe(true);
  expect(useSplitFaceStore.getState().sprues[0]!.profile.entryNeckDiameterMm).toBe(originalMain);
 });
 it("skips regenerating unaffected Sprues by reusing cached per-Sprue results",async()=>{
  await prepareSprueState();
  const generateSpy=vi.spyOn(SprueGenerationService.prototype,"generate");

  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  const callsAfterFirst=generateSpy.mock.calls.length;
  expect(callsAfterFirst).toBeGreaterThan(0);

  expect(await useSplitFaceStore.getState().createSprue(placement(8))).toBe(true);
  const callsAfterSecond=generateSpy.mock.calls.length;
  expect(callsAfterSecond-callsAfterFirst).toBe(1);

  const second=useSplitFaceStore.getState().sprues[1]!;
  expect(await useSplitFaceStore.getState().resizeSprue(second.operationId,second.profile.mainDiameterMm+.5)).toBe(true);
  const callsAfterResize=generateSpy.mock.calls.length;
  expect(callsAfterResize-callsAfterSecond).toBe(1);
 });
 it("atomically cuts four seam-sharing bodies and restores all of them through one undo/redo entry",async()=>{
  await prepareSprueState("front","right");
  const initial=useSplitFaceStore.getState();
  const hiddenId=initial.cavity.result!.bodies[1]!.id;
  initial.setBodyVisibility(hiddenId,false);
  const before=useSplitFaceStore.getState();
  const beforeBodies=before.cavity.result!.bodies;
  const beforeVersions=new Map(beforeBodies.map(body=>[body.id,body.geometryVersion]));
  const historyLength=before.undoStack.length;

  expect(await before.createSprue(placement())).toBe(true);

  const after=useSplitFaceStore.getState();
  const changed=after.lastCommittedResult!.stages.sprueBodies.filter(
   body=>body.geometryVersion!==beforeVersions.get(body.id),
  );
  expect(changed).toHaveLength(4);
  expect(selectActiveMoldBodies(after)?.find(body=>body.id===hiddenId)?.visible).toBe(false);
  expect(after.undoStack).toHaveLength(historyLength+1);

  after.undo();
  expect(useSplitFaceStore.getState().cavity.result!.bodies.map(body=>body.geometryVersion)).toEqual(
   beforeBodies.map(body=>body.geometryVersion),
  );
  useSplitFaceStore.getState().redo();
  expect(useSplitFaceStore.getState().cavity.result!.bodies.map(body=>body.geometryVersion)).toEqual(
   after.cavity.result!.bodies.map(body=>body.geometryVersion),
  );
 });
 it("preserves geometry and history on failed or duplicate in-flight Sprue requests",async()=>{
  await prepareSprueState();
  const before=useSplitFaceStore.getState();
  const bodies=before.cavity.result!.bodies;
  const historyLength=before.undoStack.length;
  expect(await before.createSprue(placement(15))).toBe(true);
  expect(useSplitFaceStore.getState().cavity.result!.bodies).toBe(bodies);
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(historyLength+1);
  expect(useSplitFaceStore.getState().sprueDefinitions.at(-1)?.validation.status).toBe("invalid");
  expect(useSplitFaceStore.getState().sprueStatus).toBe("idle");
  let release:((value:Awaited<ReturnType<SprueGenerationService["generate"]>>)=>void)|undefined;
  const pending=new Promise<Awaited<ReturnType<SprueGenerationService["generate"]>>>(resolve=>{release=resolve;});
  const service=vi.spyOn(SprueGenerationService.prototype,"generate").mockReturnValueOnce(pending);
  const requestedPlacement=placement();
  const first=useSplitFaceStore.getState().createSprue(requestedPlacement);
  expect(service.mock.calls[0]![0].request.profileDesign).toBe(requestedPlacement.profileDesign);
  expect(useSplitFaceStore.getState().sprueStatus).toBe("generating");
  expect(await useSplitFaceStore.getState().createSprue(placement(4))).toBe(false);
  release!({status:"failure",reasonCode:"SPRUE_BOOLEAN_FAILED",message:"stopped"});
  expect(await first).toBe(true);
  expect(useSplitFaceStore.getState().sprueStatus).toBe("idle");
  service.mockRejectedValueOnce(new Error("engine unavailable"));
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(false);
  expect(useSplitFaceStore.getState().sprueStatus).toBe("idle");
  expect(useSplitFaceStore.getState().error).toBe("engine unavailable");
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(historyLength+2);
 });
});
describe("segmentation extension planes",()=>{
 it("rejects an axis already used by the algorithm, leaving state unchanged",()=>{
  const s=useSplitFaceStore.getState();
  s.enterSelection();
  const before=useSplitFaceStore.getState().cuttingPlanes;
  expect(s.addExtensionCuttingPlane("right",["x"],0.5)).toBe(false);
  expect(useSplitFaceStore.getState().cuttingPlanes).toBe(before);
 });
 it("rejects a second extension request on an axis already extended by the user",()=>{
  const s=useSplitFaceStore.getState();
  s.enterSelection();
  expect(s.addExtensionCuttingPlane("top",[],0.5)).toBe(true);
  const before=useSplitFaceStore.getState().cuttingPlanes;
  expect(s.addExtensionCuttingPlane("bottom",[],0.3)).toBe(false);
  expect(useSplitFaceStore.getState().cuttingPlanes).toBe(before);
 });
 it("succeeds on an available axis, at the suggested position, with suggested provenance",()=>{
  const s=useSplitFaceStore.getState();
  s.enterSelection();
  expect(s.addExtensionCuttingPlane("back",["x","z"],0.63)).toBe(true);
  const plane=useSplitFaceStore.getState().cuttingPlanes.find(p=>p.sourceFaceId==="back")!;
  expect(plane.provenance).toBe("segmentation-extension-suggested");
  expect(plane.normalizedPosition).toBeCloseTo(0.63,5);
 });
 it("flips provenance to adjusted only for an extension plane once the user drags it",()=>{
  const s=useSplitFaceStore.getState();
  s.enterSelection();
  s.toggleFace("front");
  expect(s.addExtensionCuttingPlane("right",[],0.5)).toBe(true);
  const manualPlane=useSplitFaceStore.getState().cuttingPlanes.find(p=>p.sourceFaceId==="front")!;
  const extensionPlane=useSplitFaceStore.getState().cuttingPlanes.find(p=>p.sourceFaceId==="right")!;
  useSplitFaceStore.getState().beginPlaneDrag(manualPlane.id);
  useSplitFaceStore.getState().commitPlaneDrag(manualPlane.id,.6,k1);
  useSplitFaceStore.getState().beginPlaneDrag(extensionPlane.id);
  useSplitFaceStore.getState().commitPlaneDrag(extensionPlane.id,.4,k1);
  expect(useSplitFaceStore.getState().cuttingPlanes.find(p=>p.sourceFaceId==="front")!.provenance).toBe("manual");
  expect(useSplitFaceStore.getState().cuttingPlanes.find(p=>p.sourceFaceId==="right")!.provenance).toBe("segmentation-extension-adjusted");
 });
});
describe("adoptCommittedSegmentationResult (oversized/segmented cavity bridge)",()=>{
 it("promotes committed segmentation bodies to partsReady with a usable definition, enabling Create Cavity",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();

  // Produce real, geometry-valid mold bodies the normal way (Cut by Face),
  // then adopt them as if they were Segmentation's own committed output --
  // exercising the same code path Segmentation execution triggers, without
  // needing a full segmentation-engine harness in this store-level test.
  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  const segmentationBodies=useSplitFaceStore.getState().definition!.moldBodies!;
  const sourceDefinition=useSplitFaceStore.getState().definition!;
  const sourceDefinitionBeforeAdoption=structuredClone(sourceDefinition);

  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition,
   bodies:segmentationBodies,
   warnings:["a warning"],
  });

  expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  expect(useSplitFaceStore.getState().definition).not.toBe(sourceDefinition);
  expect(sourceDefinition).toEqual(sourceDefinitionBeforeAdoption);
  expect(useSplitFaceStore.getState().definition?.moldBodies).toEqual(segmentationBodies);
  expect(useSplitFaceStore.getState().definition?.moldFrame).toEqual(sourceDefinition.moldFrame);
  expect(useSplitFaceStore.getState().definition?.selectionBoxBounds).toEqual(sourceDefinition.selectionBoxBounds);
  expect(useSplitFaceStore.getState().definition?.referenceMoldBlock).toEqual(sourceDefinition.referenceMoldBlock);
  expect(useSplitFaceStore.getState().definition?.moldBodiesPartitionReferenceBlock).toBe(false);
  expect(useSplitFaceStore.getState().lastCommittedResult?.warnings).toEqual(["a warning"]);

  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
  expect(useSplitFaceStore.getState().cavity.result?.bodies.some(body=>body.cavityAffected)).toBe(true);
 });
 it("preserves Sprue intent (sprueDefinitions) across a committed segmentation adoption instead of wiping it to [], regression for lost Sprue intent on Segmentation/Automatic re-commit",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();

  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  const sourceDefinition=useSplitFaceStore.getState().definition!;
  const segmentationBodies=sourceDefinition.moldBodies!;

  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition,
   bodies:segmentationBodies,
   warnings:[],
  });
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  const sprueIntentBeforeReadopt=useSplitFaceStore.getState().sprueDefinitions;
  expect(sprueIntentBeforeReadopt.length).toBeGreaterThan(0);

  // A second committed segmentation plan (e.g. re-running Segmentation after
  // adding an extension axis) invalidates Sprue's geometry -- cavity is
  // reset to unavailable below -- but must not also delete the user's
  // already-durable Sprue intent, exactly as Mold Scale and re-entry
  // already preserve it elsewhere.
  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition:useSplitFaceStore.getState().definition!,
   bodies:segmentationBodies,
   warnings:[],
  });

  expect(useSplitFaceStore.getState().cavity.status).toBe("unavailable");
  // Intent (anchor/profile/operationId/creationOrder) survives untouched,
  // but its validation is demoted to pending -- the resolved geometry it
  // described belonged to the just-replaced topology and no longer exists
  // (Execution 02, Objective A: a stale "resolved" status must never
  // outlive the geometry it once described).
  expect(useSplitFaceStore.getState().sprueDefinitions).toEqual(
   sprueIntentBeforeReadopt.map(definition=>({...definition,validation:{status:"pending",reasonCode:null,message:"Mold topology changed; sprue requires revalidation."}})),
  );
 });
 it("propagates the adaptive Segmentation Registration sizing policy into committed Segmentation evaluation, regression for the lost-policy defect",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();

  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  const segmentationBodies=useSplitFaceStore.getState().definition!.moldBodies!;
  const sourceDefinition=useSplitFaceStore.getState().definition!;

  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition,
   bodies:segmentationBodies,
   warnings:[],
  });
  expect(useSplitFaceStore.getState().definition?.segmentationLineage).toBe(true);

  vi.mocked(runDerivedMoldEvaluation).mockClear();
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);

  const calls=vi.mocked(runDerivedMoldEvaluation).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  for(const call of calls){
   expect(call[0].registrationSizingPolicy).toBe(AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY);
  }

  // Rebuild Cavity re-runs the same committed evaluation: the policy must
  // survive repeated regeneration, not just the first commit.
  vi.mocked(runDerivedMoldEvaluation).mockClear();
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  for(const call of vi.mocked(runDerivedMoldEvaluation).mock.calls){
   expect(call[0].registrationSizingPolicy).toBe(AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY);
  }
 });
 it("leaves definition null when no source signature is known yet",()=>{
  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:null,
   sourceDefinition:null,
   bodies:[],
   warnings:[],
  });
  expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  expect(useSplitFaceStore.getState().definition).toBeNull();
 });
 it("rebuilds a truthful unsegmented base after Mold Scale invalidates a promoted segmentation result, instead of nulling the definition",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();

  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  const segmentationBodies=useSplitFaceStore.getState().definition!.moldBodies!;
  const sourceDefinition=useSplitFaceStore.getState().definition!;

  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition,
   bodies:segmentationBodies,
   warnings:[],
  });
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
  const staleBodyIds=useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id);

  // Mold Scale: instant commit (setClearanceMm), matching the reported
  // Segmentation regression -- clearance changes must never
  // null the definition just because the previous result came from
  // Segmentation and carries no face-cutting planes. 160mm is used (not 12)
  // because it is above AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM (100) --
  // see the dedicated clearance-floor test below for the sub-100mm case.
  useSplitFaceStore.getState().setClearanceMm(160);

  expect(useSplitFaceStore.getState().definition).not.toBeNull();
  expect(useSplitFaceStore.getState().definition!.referenceMoldBlock.clearanceMm).toBe(160);
  expect(useSplitFaceStore.getState().definition!.moldBodies).toHaveLength(1);
  expect(useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id)).not.toEqual(staleBodyIds);
  expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  // Truthful current K1/K2 provenance is preserved from the segmentation
  // source, not fabricated -- the K1 part envelope itself is unchanged by
  // Mold Scale, only the clearance-derived Z offset and K2 shell shift.
  const rebuiltK1=useSplitFaceStore.getState().definition!.selectionBoxBounds;
  expect(useSplitFaceStore.getState().definition!.modelId).toBe(sourceDefinition.modelId);
  expect(rebuiltK1.min.x).toBe(sourceDefinition.selectionBoxBounds.min.x);
  expect(rebuiltK1.max.x).toBe(sourceDefinition.selectionBoxBounds.max.x);
  expect(rebuiltK1.min.y).toBe(sourceDefinition.selectionBoxBounds.min.y);
  expect(rebuiltK1.max.y).toBe(sourceDefinition.selectionBoxBounds.max.y);
  expect(rebuiltK1.max.z-rebuiltK1.min.z).toBeCloseTo(sourceDefinition.selectionBoxBounds.max.z-sourceDefinition.selectionBoxBounds.min.z,6);
  // Not falsely presented as a completed new segmentation result or as the
  // old segmented output -- and not exportable as a current segmented
  // result via the coverage-checked Create Cavity path either.
  expect(useSplitFaceStore.getState().definition!.moldBodiesPartitionReferenceBlock).not.toBe(false);
  // Stale derived output is invalidated.
  expect(useSplitFaceStore.getState().lastCommittedResult).toBeNull();
  expect(useSplitFaceStore.getState().cavity.status).toBe("unavailable");
  expect(useSplitFaceStore.getState().registration.status).toBe("unavailable");

  expect(selectActiveMoldBodies(useSplitFaceStore.getState())?.map(b=>b.id)).toEqual(useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id));
  const scaledBodyIds=useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id);

  // Undo restores the exact prior (segmented, cavity-complete) snapshot;
  // redo reapplies the valid current-base transition, not definition:null.
  useSplitFaceStore.getState().undo();
  expect(useSplitFaceStore.getState().definition?.moldBodies?.map(b=>b.id)).toEqual(staleBodyIds);
  expect(useSplitFaceStore.getState().definition?.moldBodiesPartitionReferenceBlock).toBe(false);
  expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
  useSplitFaceStore.getState().redo();
  expect(useSplitFaceStore.getState().definition).not.toBeNull();
  expect(useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id)).toEqual(scaledBodyIds);
  expect(useSplitFaceStore.getState().cavity.status).toBe("unavailable");

  // The rebuilt base itself satisfies Create Cavity's contract (it is not
  // merely visible, it is truthfully current and usable).
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
 });
 it("survives repeated live Mold Scale drag cycles on a promoted segmentation result without a null definition, drift, or duplicated ids",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();

  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  const segmentationBodies=useSplitFaceStore.getState().definition!.moldBodies!;
  const sourceDefinition=useSplitFaceStore.getState().definition!;

  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition,
   bodies:segmentationBodies,
   warnings:[],
  });

  const before=useSplitFaceStore.getState().undoStack.length;
  const seenIds=new Set<string>();
  useSplitFaceStore.getState().beginClearanceEdit();
  // Strictly increasing clearance across the cycle so every step is a
  // genuinely distinct K2 -- no cumulative geometry drift and no duplicated
  // bodies for distinct inputs. Starts at 100 (not 11): a segmentation-lineage
  // base always resolves clearance through
  // AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM, so raw values below 100
  // would collapse to the same floored geometry and legitimately share an
  // id -- that collapsing behavior has its own dedicated test below.
  for(let i=0;i<30;i+=1){
   const mm=100+i;
   useSplitFaceStore.getState().updateClearanceEdit(mm);
   const definition=useSplitFaceStore.getState().definition;
   expect(definition).not.toBeNull();
   expect(definition!.moldBodies).toHaveLength(1);
   expect(definition!.referenceMoldBlock.clearanceMm).toBe(mm);
   expect(definition!.modelId).toBe(sourceDefinition.modelId);
   const id=definition!.moldBodies![0]!.id;
   expect(seenIds.has(id)).toBe(false);
   seenIds.add(id);
   // Live drag updates are worker-free and coalesce into one reversible
   // history transaction, exactly as for a Cut by Face base.
   expect(useSplitFaceStore.getState().undoStack).toHaveLength(before);
   expect(useSplitFaceStore.getState().cavity.status).toBe("unavailable");
  }
  // Deterministic outputs for identical inputs: repeating an already-seen
  // clearance must reproduce the exact same body id, not a new one.
  useSplitFaceStore.getState().updateClearanceEdit(100);
  const repeatedId=useSplitFaceStore.getState().definition!.moldBodies![0]!.id;
  useSplitFaceStore.getState().updateClearanceEdit(129);
  useSplitFaceStore.getState().updateClearanceEdit(100);
  expect(useSplitFaceStore.getState().definition!.moldBodies![0]!.id).toBe(repeatedId);
  useSplitFaceStore.getState().commitClearanceEdit();
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(before+1);
  expect(useSplitFaceStore.getState().definition).not.toBeNull();
  expect(useSplitFaceStore.getState().workflow).toBe("partsReady");

  useSplitFaceStore.getState().undo();
  expect(useSplitFaceStore.getState().definition?.moldBodies?.map(b=>b.id)).toEqual(segmentationBodies.map(b=>b.id));
  expect(useSplitFaceStore.getState().definition?.moldBodiesPartitionReferenceBlock).toBe(false);
 });
 it("floors a sub-100mm Mold Scale edit on a segmentation-lineage base to AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM, matching what Segmentation's own source snapshot would use",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();

  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  const sourceDefinition=useSplitFaceStore.getState().definition!;

  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition,
   bodies:sourceDefinition.moldBodies!,
   warnings:[],
  });

  // A raw clearance well under the 100mm floor must still produce a base
  // whose reported clearance truthfully matches its own geometry (100mm),
  // not the smaller raw slider value -- otherwise the base would visibly
  // jump in size the instant a Scale-triggered segmentation replan lands,
  // an unexplained geometry drift with no corresponding user action.
  useSplitFaceStore.getState().setClearanceMm(5);
  expect(useSplitFaceStore.getState().definition?.referenceMoldBlock.clearanceMm).toBe(100);
  // Two different raw sub-floor values collapse to the identical floored
  // geometry and therefore the identical body id -- not a bug, a faithful
  // reflection that Segmentation would plan against the same K2 for both.
  const flooredIdAt5=useSplitFaceStore.getState().definition!.moldBodies![0]!.id;
  useSplitFaceStore.getState().setClearanceMm(18);
  expect(useSplitFaceStore.getState().definition?.referenceMoldBlock.clearanceMm).toBe(100);
  expect(useSplitFaceStore.getState().definition!.moldBodies![0]!.id).toBe(flooredIdAt5);
 });
});
describe("promoteReplannedSegmentationResult (Scale-triggered replan promotion)",()=>{
 it("promotes atomically in place, touching neither undoStack nor redoStack -- the Scale commit's own history entry already covers this gesture",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();
  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  const originalDefinition=useSplitFaceStore.getState().definition!;

  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition:originalDefinition,
   bodies:originalDefinition.moldBodies!,
   warnings:[],
  });
  const preScaleBodyIds=useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id);

  // Scale commit: one history entry, whole-K2 base becomes current.
  useSplitFaceStore.getState().setClearanceMm(30);
  const undoStackAfterScale=useSplitFaceStore.getState().undoStack.length;
  const revisionAfterScale=useSplitFaceStore.getState().document.revision;
  const wholeBaseDefinition=useSplitFaceStore.getState().definition!;

  // Simulates the async replan/execute tail landing after the Scale commit.
  const replannedBodies=wholeBaseDefinition.moldBodies!.map(b=>({...b,id:`${b.id}:replanned`}));
  useSplitFaceStore.getState().promoteReplannedSegmentationResult({
   expectedPriorRevision:revisionAfterScale,
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition:wholeBaseDefinition,
   bodies:replannedBodies,
   warnings:[],
  });

  expect(useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id)).toEqual(replannedBodies.map(b=>b.id));
  expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  // No new history entry -- promotion is this same gesture's async tail.
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(undoStackAfterScale);

  // One Undo restores the pre-Scale segmented state directly (skips over
  // the whole-K2 intermediate entirely, since that was never a history
  // entry of its own).
  useSplitFaceStore.getState().undo();
  expect(useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id)).toEqual(preScaleBodyIds);
 });
 it("Create Cavity and Registration recover truthfully on a multi-body result promoted after Scale, matching regenerateSegmentationAfterScale's own contract",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();
  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  const originalDefinition=useSplitFaceStore.getState().definition!;
  const originalBodyCount=originalDefinition.moldBodies!.length;
  expect(originalBodyCount).toBeGreaterThan(1);

  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition:originalDefinition,
   bodies:originalDefinition.moldBodies!,
   warnings:[],
  });
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
  expect(useSplitFaceStore.getState().registration.status).toBe("generated");

  // Scale commit, then the async replan tail promotes a genuinely
  // regenerated multi-body result (the exact call
  // regenerateSegmentationAfterScale makes after a successful extension
  // replay) -- not the temporary whole-K2 base.
  useSplitFaceStore.getState().setClearanceMm(30);
  const revisionAfterScale=useSplitFaceStore.getState().document.revision;
  const wholeBaseDefinition=useSplitFaceStore.getState().definition!;
  expect(wholeBaseDefinition.moldBodies).toHaveLength(1);
  expect(useSplitFaceStore.getState().cavity.status).toBe("unavailable");
  expect(useSplitFaceStore.getState().registration.status).toBe("unavailable");

  // Reuses the original (already cavity-worthy, real, frame-aligned)
  // segmented definition+geometry as the "replanned" result -- what this
  // test needs to prove is that promotion correctly makes a multi-body
  // result (not the single-body whole-K2 base above) the truthful current
  // source for Create Cavity, not that the geometry engine itself replans
  // new coordinates correctly (already covered by real segmentation
  // execution in the cuttingWorkflow-level replay test).
  useSplitFaceStore.getState().promoteReplannedSegmentationResult({
   expectedPriorRevision:revisionAfterScale,
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition:originalDefinition,
   bodies:originalDefinition.moldBodies!,
   warnings:[],
  });

  // Body Browser/Viewport truth: current definition is the regenerated
  // multi-body result, not the whole-K2 fallback.
  const after=useSplitFaceStore.getState().definition!;
  expect(after.moldBodies).toHaveLength(originalBodyCount);
  expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  expect(useSplitFaceStore.getState().segmentationRegenerationCount).toBe(0);

  // Create/Rebuild Cavity works again on the new interfaces, and
  // Registration is generated again from them -- the same automatic
  // Cavity-evaluation path used every other time, no separate recovery
  // mechanism needed.
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
  expect(useSplitFaceStore.getState().registration.status).toBe("generated");
 });
 it("discards a stale replan result whose expectedPriorRevision no longer matches -- superseded by a newer Scale gesture or Undo",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();
  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  const originalDefinition=useSplitFaceStore.getState().definition!;
  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition:originalDefinition,
   bodies:originalDefinition.moldBodies!,
   warnings:[],
  });

  useSplitFaceStore.getState().setClearanceMm(160);
  const staleRevision=useSplitFaceStore.getState().document.revision;
  const staleBase=useSplitFaceStore.getState().definition!;

  // A second Scale gesture supersedes the first before its replan lands.
  useSplitFaceStore.getState().setClearanceMm(170);
  const currentBodyIds=useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id);

  useSplitFaceStore.getState().promoteReplannedSegmentationResult({
   expectedPriorRevision:staleRevision,
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition:staleBase,
   bodies:[{...staleBase.moldBodies![0]!,id:"stale-replan-body"}],
   warnings:[],
  });

  // The stale result must not have applied.
  expect(useSplitFaceStore.getState().definition!.moldBodies!.map(b=>b.id)).toEqual(currentBodyIds);
  expect(useSplitFaceStore.getState().definition!.referenceMoldBlock.clearanceMm).toBe(170);
 });
});
/**
 * Execution 02, Objective A: a resolved Sprue's `validation.status` describes
 * geometry actually resolved against the CURRENT topology. Every topology
 * replacement below invalidates `sprues` (resolved geometry) while
 * preserving `sprueDefinitions` (durable intent) -- these tests prove the
 * preserved intent's own validation status is demoted to "pending" in the
 * same atomic transition, so it can never keep reporting "resolved" once the
 * geometry it described is gone.
 */
describe("Sprue dependency integrity across topology replacement",()=>{
 it("Mold Scale demotes a resolved Sprue's preserved intent to pending, never leaving it reporting resolved against geometry that no longer exists",async()=>{
  await prepareSprueState();
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  expect(useSplitFaceStore.getState().sprueDefinitions[0]!.validation.status).toBe("resolved");
  expect(useSplitFaceStore.getState().sprues.length).toBeGreaterThan(0);

  useSplitFaceStore.getState().setClearanceMm(15);

  expect(useSplitFaceStore.getState().sprues).toEqual([]);
  expect(useSplitFaceStore.getState().cavity.status).toBe("unavailable");
  expect(useSplitFaceStore.getState().sprueDefinitions[0]!.validation.status).toBe("pending");
 });
 it("adoptCommittedSegmentationResult demotes a resolved Sprue's preserved intent to pending",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();
  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  expect(useSplitFaceStore.getState().sprueDefinitions[0]!.validation.status).toBe("resolved");
  const sourceDefinition=useSplitFaceStore.getState().definition!;

  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition,
   bodies:sourceDefinition.moldBodies!,
   warnings:[],
  });

  expect(useSplitFaceStore.getState().sprues).toEqual([]);
  expect(useSplitFaceStore.getState().cavity.status).toBe("unavailable");
  expect(useSplitFaceStore.getState().sprueDefinitions[0]!.validation.status).toBe("pending");
  // Intent itself (anchor/profile) is still durable -- only its resolved truth was demoted.
  expect(useSplitFaceStore.getState().sprueDefinitions).toHaveLength(1);
 });
 it("promoteReplannedSegmentationResult demotes a resolved Sprue's preserved intent to pending after a Scale-triggered segmentation replan lands",async()=>{
  const canonicalPartGeometry=canonicalCube("m",k1);
  const s=useSplitFaceStore.getState();
  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  const originalDefinition=useSplitFaceStore.getState().definition!;

  useSplitFaceStore.getState().adoptCommittedSegmentationResult({
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition:originalDefinition,
   bodies:originalDefinition.moldBodies!,
   warnings:[],
  });
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  expect(useSplitFaceStore.getState().sprueDefinitions[0]!.validation.status).toBe("resolved");
  expect(useSplitFaceStore.getState().sprues.length).toBeGreaterThan(0);

  useSplitFaceStore.getState().setClearanceMm(30);
  const revisionAfterScale=useSplitFaceStore.getState().document.revision;
  const wholeBaseDefinition=useSplitFaceStore.getState().definition!;

  useSplitFaceStore.getState().promoteReplannedSegmentationResult({
   expectedPriorRevision:revisionAfterScale,
   sourceSignature:canonicalPartGeometry.sourceSignature,
   sourceDefinition:wholeBaseDefinition,
   bodies:wholeBaseDefinition.moldBodies!.map(b=>({...b,id:`${b.id}:replanned`})),
   warnings:[],
  });

  expect(useSplitFaceStore.getState().sprues).toEqual([]);
  expect(useSplitFaceStore.getState().cavity.status).toBe("unavailable");
  expect(useSplitFaceStore.getState().sprueDefinitions[0]!.validation.status).toBe("pending");
 });
});
describe("Async evaluation commit identity (stale/cancelled results must not mutate newer state)",()=>{
 it("a genuine current failure still surfaces as evaluation.phase 'failed'",async()=>{
  await prepareSprueState();
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  const target=useSplitFaceStore.getState().sprueDefinitions[0]!;

  vi.mocked(runDerivedMoldEvaluation).mockImplementationOnce(async()=>{throw new Error("boom");});

  expect(await useSplitFaceStore.getState().resizeSprue(target.operationId,target.profileDesign.profile.mainDiameterMm+2)).toBe(false);

  const after=useSplitFaceStore.getState();
  expect(after.evaluation.phase).toBe("failed");
  expect(after.evaluation.failure?.message).toBe("boom");
  expect(after.sprueStatus).toBe("idle");
  expect(after.error).toBe("boom");
 });
 it("a stale rejection (superseded by Undo mid-flight) cannot mark the now-current state failed",async()=>{
  await prepareSprueState();
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  const target=useSplitFaceStore.getState().sprueDefinitions[0]!;

  let rejectStale:(error:unknown)=>void=()=>undefined;
  vi.mocked(runDerivedMoldEvaluation).mockImplementationOnce(()=>new Promise((_,reject)=>{rejectStale=reject;}));

  const pending=useSplitFaceStore.getState().resizeSprue(target.operationId,target.profileDesign.profile.mainDiameterMm+2);
  await Promise.resolve();
  await Promise.resolve();
  expect(useSplitFaceStore.getState().sprueStatus).toBe("generating");

  // A different action supersedes the in-flight request while it is still pending.
  useSplitFaceStore.getState().undo();
  const superseded={document:useSplitFaceStore.getState().document,evaluation:useSplitFaceStore.getState().evaluation,sprueDefinitions:useSplitFaceStore.getState().sprueDefinitions,sprueStatus:useSplitFaceStore.getState().sprueStatus,error:useSplitFaceStore.getState().error};

  rejectStale(new Error("late failure from a superseded request"));
  expect(await pending).toBe(false);

  const after=useSplitFaceStore.getState();
  expect(after.document).toEqual(superseded.document);
  expect(after.evaluation).toEqual(superseded.evaluation);
  expect(after.sprueDefinitions).toEqual(superseded.sprueDefinitions);
  expect(after.sprueStatus).toBe(superseded.sprueStatus);
  expect(after.error).toBe(superseded.error);
 });
 it("a stale/late cancellation is discarded silently, never converted into evaluation.phase 'failed'",async()=>{
  await prepareSprueState();
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  const target=useSplitFaceStore.getState().sprueDefinitions[0]!;

  let rejectStale:(error:unknown)=>void=()=>undefined;
  vi.mocked(runDerivedMoldEvaluation).mockImplementationOnce(()=>new Promise((_,reject)=>{rejectStale=reject;}));

  const pending=useSplitFaceStore.getState().resizeSprue(target.operationId,target.profileDesign.profile.mainDiameterMm+2);
  await Promise.resolve();
  await Promise.resolve();

  useSplitFaceStore.getState().undo();
  const superseded={document:useSplitFaceStore.getState().document,evaluation:useSplitFaceStore.getState().evaluation,sprueStatus:useSplitFaceStore.getState().sprueStatus};

  rejectStale(Object.assign(new Error("superseded"),{code:"evaluation_cancelled"}));
  expect(await pending).toBe(false);

  const after=useSplitFaceStore.getState();
  expect(after.evaluation.phase).not.toBe("failed");
  expect(after.document).toEqual(superseded.document);
  expect(after.evaluation).toEqual(superseded.evaluation);
  expect(after.sprueStatus).toBe(superseded.sprueStatus);
 });
 it("a stale success (topology replaced mid-flight) cannot resurrect resolved Sprue geometry over the newer pending state",async()=>{
  await prepareSprueState();
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  const target=useSplitFaceStore.getState().sprueDefinitions[0]!;

  let releaseStale:()=>void=()=>undefined;
  const gate=new Promise<void>(resolve=>{releaseStale=resolve;});
  const actual=await vi.importActual<typeof import("../workflow")>("../workflow");
  vi.mocked(runDerivedMoldEvaluation).mockImplementationOnce(async(input,onProgress)=>{
   const real=await actual.runDerivedMoldEvaluation(input,onProgress);
   await gate;
   return real;
  });

  const pending=useSplitFaceStore.getState().resizeSprue(target.operationId,target.profileDesign.profile.mainDiameterMm+2);
  await Promise.resolve();
  await Promise.resolve();

  // Topology is replaced (Mold Scale) while the resize's evaluation is still pending.
  useSplitFaceStore.getState().setClearanceMm(15);
  expect(useSplitFaceStore.getState().sprueDefinitions[0]!.validation.status).toBe("pending");
  expect(useSplitFaceStore.getState().sprues).toEqual([]);

  releaseStale();
  expect(await pending).toBe(false);

  const after=useSplitFaceStore.getState();
  // The late success from the superseded resize must not resurrect resolved geometry
  // that no longer belongs to the post-Scale topology.
  expect(after.sprues).toEqual([]);
  expect(after.sprueDefinitions[0]!.validation.status).toBe("pending");
 });
 it("createMoldParts: a genuine current failure still surfaces as evaluation.phase 'failed', not stuck at 'evaluating'",async()=>{
  const s=useSplitFaceStore.getState();
  s.enterSelection();
  s.toggleFace("front");

  vi.mocked(runDerivedMoldEvaluation).mockImplementationOnce(async()=>{throw new Error("boom");});

  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(false);

  const after=useSplitFaceStore.getState();
  expect(after.evaluation.phase).toBe("failed");
  expect(after.evaluation.failure?.message).toBe("boom");
  expect(after.workflow).toBe("error");
  expect(after.error).toBe("boom");
 });
 it("createMoldParts: a stale rejection cannot revert a model-replacement that superseded it mid-flight",async()=>{
  const s=useSplitFaceStore.getState();
  s.enterSelection();
  s.toggleFace("front");

  let rejectStale:(error:unknown)=>void=()=>undefined;
  vi.mocked(runDerivedMoldEvaluation).mockImplementationOnce(()=>new Promise((_,reject)=>{rejectStale=reject;}));

  const pending=useSplitFaceStore.getState().createMoldParts("m",k1);
  await Promise.resolve();
  await Promise.resolve();
  expect(useSplitFaceStore.getState().workflow).toBe("generatingParts");

  // A different action (new model loaded) supersedes the in-flight createMoldParts.
  useSplitFaceStore.getState().clearForModelReplacement();
  const superseded={document:useSplitFaceStore.getState().document,evaluation:useSplitFaceStore.getState().evaluation,workflow:useSplitFaceStore.getState().workflow,error:useSplitFaceStore.getState().error};

  rejectStale(new Error("late failure from a superseded request"));
  expect(await pending).toBe(false);

  const after=useSplitFaceStore.getState();
  expect(after.document).toEqual(superseded.document);
  expect(after.evaluation).toEqual(superseded.evaluation);
  expect(after.workflow).toBe(superseded.workflow);
  expect(after.error).toBe(superseded.error);
 });
});
describe("Sprue presentation: pending intent never masquerades as resolved geometry",()=>{
 it("a pending Sprue (no cavity yet) has no resolved depth or target body IDs, and its position/profile reflect the intent, not stale resolved geometry",async()=>{
  const s=useSplitFaceStore.getState();
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
  expect(useSplitFaceStore.getState().cavity.result).toBeNull();

  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  const after=useSplitFaceStore.getState();
  expect(after.sprueDefinitions[0]!.validation.status).toBe("pending");
  expect(after.sprues).toEqual([]);

  const presentation=selectSpruePresentationDefinitions(after)[0]!;
  expect(presentation.status).toBe("pending");
  expect(presentation).not.toHaveProperty("depthMm");
  expect(presentation).not.toHaveProperty("targetBodyIds");
  expect(presentation.position).toEqual(after.sprueDefinitions[0]!.anchor.position);
  expect(presentation.profile).toEqual(after.sprueDefinitions[0]!.profileDesign.profile);
 });
 it("resolved presentation requires current resolved geometry: topology invalidation strips depth/targetBodyIds and the selector reports pending again",async()=>{
  await prepareSprueState();
  expect(await useSplitFaceStore.getState().createSprue(placement())).toBe(true);
  const resolved=useSplitFaceStore.getState();
  const resolvedPresentation=selectSpruePresentationDefinitions(resolved)[0]!;
  expect(resolvedPresentation.status).toBe("resolved");
  expect(resolvedPresentation.depthMm).toBeDefined();
  expect(resolvedPresentation.targetBodyIds).toBeDefined();

  useSplitFaceStore.getState().setClearanceMm(15);

  const after=useSplitFaceStore.getState();
  const afterPresentation=selectSpruePresentationDefinitions(after)[0]!;
  expect(afterPresentation.status).toBe("pending");
  expect(afterPresentation).not.toHaveProperty("depthMm");
  expect(afterPresentation).not.toHaveProperty("targetBodyIds");
  // The old resolved position/profile must not survive as if still current --
  // they fall back to the (still-pending) intent's own anchor/profile.
  expect(afterPresentation.position).toEqual(after.sprueDefinitions[0]!.anchor.position);
  expect(afterPresentation.profile).toEqual(after.sprueDefinitions[0]!.profileDesign.profile);
 });
});
