import { createSplitFaceStoreCreator, selectSpruePresentationDefinitions, type SplitFaceState, type SplitFaceStoreDeps } from "./splitFace.store";
import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import type { CavityGenerationInput } from "../cavity-generation/cavityGeneration.contracts";
import { generateCavityBodies } from "../cavity-generation/cavityBody.generator";
import { createCavityTool } from "../cavity-generation/manifold.engine";
import { validateAndPreparePartSolid } from "../cavity-generation/partSolid.validator";
import { designSprueProfile } from "../sprue-generation";
import type { SprueDefinition, SprueOperationDefinition, ValidSpruePreviewPlacement } from "../sprue-generation/sprueGeneration.contracts";
import type { DerivedMoldEvaluationInput, DerivedMoldEvaluationResult } from "../workflow/derivedMoldEvaluation.contracts";
import { cancelDerivedMoldEvaluation as cancelDerivedMoldEvaluationProduction, runDerivedMoldEvaluation as runDerivedMoldEvaluationProduction } from "../workflow";
import { createStore, type StoreApi } from "zustand/vanilla";

const runDerivedMoldEvaluation = vi.fn(runDerivedMoldEvaluationProduction);
const cancelDerivedMoldEvaluation = vi.fn(cancelDerivedMoldEvaluationProduction);
const runCavityGenerationInWorker = Object.assign(vi.fn(async(input:CavityGenerationInput)=>{
 const validation=validateAndPreparePartSolid(input);
 if(!validation.ok||validation.prepared===null)throw new Error(validation.blockers[0]?.message??"Uploaded model is not a subtractable solid.");
 const tool=await createCavityTool(validation.prepared,input.cavityClearanceMm,input.qualityMode,input.geometryToleranceMm);
 return {result:await generateCavityBodies(input,tool),validationWarnings:validation.warnings};
}),{cancel:vi.fn()}) as SplitFaceStoreDeps["runCavityGenerationInWorker"];
const cancelActiveCavityGeneration = vi.fn();

const k1={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}};
let useSplitFaceStore:StoreApi<SplitFaceState>;
const profileDesign=designSprueProfile(null);
const placement=(x=5):ValidSpruePreviewPlacement=>({status:"valid",topPoint:{x,y:5,z:30},cavityPoint:{x,y:5,z:20},inwardDirection:{x:0,y:0,z:-1},stemLengthMm:10,profileDesign,coordinateSpace:"mold-local"});

async function prepareSprueState(...faces:Array<"front"|"right">){const canonicalPartGeometry=canonicalCube("m",k1);const s=useSplitFaceStore.getState();s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);s.enterSelection();(faces.length===0?["front"] as const:faces).forEach(face=>s.toggleFace(face));if(faces.length>1){for(const plane of useSplitFaceStore.getState().cuttingPlanes){s.beginPlaneDrag(plane.id);s.commitPlaneDrag(plane.id,.5,k1);}}expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);const result=useSplitFaceStore.getState().cavity.result!;const body=result.bodies.find(candidate=>candidate.cavityAffected&&candidate.bounds.min.x<=5&&candidate.bounds.max.x>=5&&candidate.bounds.min.y<=5&&candidate.bounds.max.y>=5&&candidate.bounds.max.z===30);expect(body).toBeDefined();return body!;}

/** Runs one real evaluation to harvest a real resolved SprueDefinition template for deferred-result fabrication. */
async function prepareResolvedSprue(x=5):Promise<SprueDefinition>{
 await prepareSprueState();
 expect(await useSplitFaceStore.getState().createSprue(placement(x))).toBe(true);
 // Acceptance is immediate; the resolved commit lands asynchronously.
 await vi.waitFor(()=>expect(useSplitFaceStore.getState().sprues.length).toBeGreaterThan(0));
 const [resolved]=useSplitFaceStore.getState().sprues;
 expect(resolved).toBeDefined();
 return resolved!;
}

/** Seeds a second, independent store instance with the same committed cavity state. */
async function prepareSecondStore(second:StoreApi<SplitFaceState>){const canonicalPartGeometry=canonicalCube("m",k1);const s=second.getState();s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);s.enterSelection();s.toggleFace("front");expect(await second.getState().createMoldParts("m",k1)).toBe(true);expect(await second.getState().createCavity(canonicalPartGeometry)).toBe(true);}

const resolveTemplate=(definition:SprueOperationDefinition,template:SprueDefinition):SprueDefinition=>({
 ...template,
 operationId:definition.operationId,
 position:definition.anchor.position,
 inwardDirection:definition.inwardDirection,
 profile:definition.profileDesign.profile,
});

const derivedOk=(input:DerivedMoldEvaluationInput,template:SprueDefinition):DerivedMoldEvaluationResult=>({
 requestId:input.requestId,
 sourceRevision:input.sourceRevision,
 sourceFingerprint:input.sourceFingerprint,
 sprueBodies:[],
 sprueDefinitions:input.sprueDefinitions.map(definition=>({...definition,validation:{status:"resolved" as const,reasonCode:null,message:null}})),
 resolvedSprues:input.sprueDefinitions.map(definition=>resolveTemplate(definition,template)),
 registration:{status:"generated",revision:input.sourceFingerprint,bodies:[],report:null},
 warnings:[],
});

/**
 * Replaces the production runner with a fully controlled deferred queue (one
 * entry per dispatch). `calls()` counts only dispatches issued after this
 * control was created, so the real prepare runs do not pollute counts.
 */
function controlledEvaluation(){
 const baseline=runDerivedMoldEvaluation.mock.calls.length;
 const pending:Array<{input:DerivedMoldEvaluationInput;resolve:(result:DerivedMoldEvaluationResult)=>void;reject:(error:unknown)=>void}>=[];
 runDerivedMoldEvaluation.mockImplementation((input:DerivedMoldEvaluationInput)=>new Promise<DerivedMoldEvaluationResult>((resolve,reject)=>{pending.push({input,resolve,reject});}));
 const template=useSplitFaceStore.getState().sprues[0]!;
 return {
  pending,
  calls:()=>runDerivedMoldEvaluation.mock.calls.slice(baseline).map(call=>call[0] as DerivedMoldEvaluationInput),
  resolve:()=>{const next=pending.pop();if(next)next.resolve(derivedOk(next.input,template));},
  reject:(error:unknown)=>{const next=pending.pop();if(next)next.reject(error);},
 };
}

const waitFor=vi.waitFor;

beforeEach(()=>{
 useSplitFaceStore=createStore(createSplitFaceStoreCreator({runDerivedMoldEvaluation,cancelDerivedMoldEvaluation,runCavityGenerationInWorker,cancelActiveCavityGeneration}));
});
afterEach(()=>{
 vi.restoreAllMocks();
 runDerivedMoldEvaluation.mockClear();
 runDerivedMoldEvaluation.mockImplementation(runDerivedMoldEvaluationProduction);
 cancelDerivedMoldEvaluation.mockClear();
});

describe("Sprue latest-wins scheduling",()=>{
 it("accepts a newer Sprue intent immediately while an older evaluation is still running (no busy-reject)",async()=>{
  await prepareResolvedSprue();
  const historyLength=useSplitFaceStore.getState().undoStack.length;
  const control=controlledEvaluation();

  const actionA=useSplitFaceStore.getState().createSprue(placement(2));
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  expect(useSplitFaceStore.getState().sprueStatus).toBe("generating");
  expect(useSplitFaceStore.getState().sprueDefinitions).toHaveLength(2);
  const activeRequestId=useSplitFaceStore.getState().evaluation.requestId;

  // While A is still in flight, a valid newer intent must be accepted, not rejected.
  expect(await useSplitFaceStore.getState().createSprue(placement(8))).toBe(true);
  expect(useSplitFaceStore.getState().sprueDefinitions).toHaveLength(3);
  expect(useSplitFaceStore.getState().sprueStatus).toBe("generating");
  expect(useSplitFaceStore.getState().evaluation.requestId).not.toBe(activeRequestId);
  // B is coalesced as the single latest pending snapshot: it must not dispatch yet.
  expect(control.calls()).toHaveLength(1);

  control.resolve();
  await waitFor(()=>expect(control.calls()).toHaveLength(2));
  control.resolve();
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  expect(await actionA).toBe(true);
  expect(useSplitFaceStore.getState().sprues).toHaveLength(3);
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(historyLength+1);
 });

 it("coalesces 100 rapid intents during one active evaluation into at most one more dispatch, executing only the final snapshot",async()=>{
  await prepareResolvedSprue();
  const control=controlledEvaluation();
  const resolved=useSplitFaceStore.getState().sprues[0]!;
  expect(resolved).toBeDefined();

  const actionA=useSplitFaceStore.getState().createSprue(placement(2));
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  const resizeActions: Array<Promise<boolean>> = [];
  for(let index=0;index<100;index+=1){
   resizeActions.push(useSplitFaceStore.getState().resizeSprue(resolved.operationId,resolved.profile.mainDiameterMm+0.1*(index+1)));
  }
  const results=await Promise.all(resizeActions);
  expect(results).toEqual(Array.from({length:100},()=>true));
  expect(control.calls()).toHaveLength(1);
  const lastRequested=useSplitFaceStore.getState().sprueDefinitions[0]!.profileDesign.profile.mainDiameterMm;

  control.resolve();
  await waitFor(()=>expect(control.calls()).toHaveLength(2));
  expect(control.calls()[1]!.sprueDefinitions[0]!.profileDesign.profile.mainDiameterMm).toBe(lastRequested);
  control.resolve();
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  expect(await actionA).toBe(true);
  expect(useSplitFaceStore.getState().sprues[0]!.profile.mainDiameterMm).toBe(lastRequested);
 });

 it("a stale success cannot commit and cannot create history",async()=>{
  await prepareResolvedSprue();
  const historyLength=useSplitFaceStore.getState().undoStack.length;
  const control=controlledEvaluation();

  const actionA=useSplitFaceStore.getState().createSprue(placement(2));
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  expect(await useSplitFaceStore.getState().createSprue(placement(8))).toBe(true);
  const pendingDocument=useSplitFaceStore.getState().document;

  control.resolve();
  await waitFor(()=>expect(control.calls()).toHaveLength(2));
  // A's stale result must have written nothing authoritative.
  expect(useSplitFaceStore.getState().document).toBe(pendingDocument);
  expect(useSplitFaceStore.getState().sprues).toHaveLength(1);
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(historyLength);
  expect(useSplitFaceStore.getState().sprueStatus).toBe("generating");

  control.resolve();
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  expect(await actionA).toBe(true);
  expect(useSplitFaceStore.getState().sprues).toHaveLength(3);
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(historyLength+1);
 });

 it("a stale failure cannot clobber the current pending intent",async()=>{
  await prepareResolvedSprue();
  const control=controlledEvaluation();

  const actionA=useSplitFaceStore.getState().createSprue(placement(2));
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  expect(await useSplitFaceStore.getState().createSprue(placement(8))).toBe(true);
  const pendingDocument=useSplitFaceStore.getState().document;

  control.reject(new Error("older request exploded"));
  await waitFor(()=>expect(control.calls()).toHaveLength(2));
  expect(useSplitFaceStore.getState().document).toBe(pendingDocument);
  expect(useSplitFaceStore.getState().evaluation.phase).toBe("evaluating");
  expect(useSplitFaceStore.getState().sprueStatus).toBe("generating");
  expect(useSplitFaceStore.getState().error).toBeNull();

  control.resolve();
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  expect(await actionA).toBe(true);
  expect(useSplitFaceStore.getState().sprues).toHaveLength(3);
  expect(useSplitFaceStore.getState().error).toBeNull();
 });

 it("a stale result cannot present its progress state as current",async()=>{
  await prepareResolvedSprue();
  const control=controlledEvaluation();
  const actionA=useSplitFaceStore.getState().createSprue(placement(2));
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  expect(await useSplitFaceStore.getState().createSprue(placement(8))).toBe(true);
  const pendingEvaluation=useSplitFaceStore.getState().evaluation;
  control.resolve();
  await waitFor(()=>expect(control.calls()).toHaveLength(2));
  // The newer request owns evaluation state: its identity, phase, and progress.
  expect(useSplitFaceStore.getState().evaluation.requestId).toBe(pendingEvaluation.requestId);
  expect(useSplitFaceStore.getState().evaluation.phase).toBe("evaluating");
  expect(useSplitFaceStore.getState().evaluation.progress).toBe(pendingEvaluation.progress);
  control.resolve();
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  expect(await actionA).toBe(true);
 });
});

describe("Sprue history coalescing",()=>{
 it("a committed rapid burst creates exactly one undo entry and undo returns to the pre-burst resolved state",async()=>{
  const resolved=await prepareResolvedSprue();
  const originalDiameter=resolved.profile.mainDiameterMm;
  const historyLength=useSplitFaceStore.getState().undoStack.length;
  const control=controlledEvaluation();

  const first=useSplitFaceStore.getState().resizeSprue(resolved.operationId,originalDiameter+1);
  expect(await useSplitFaceStore.getState().resizeSprue(resolved.operationId,originalDiameter+2)).toBe(true);
  expect(await useSplitFaceStore.getState().resizeSprue(resolved.operationId,originalDiameter+3)).toBe(true);
  control.resolve();
  await waitFor(()=>expect(control.calls()).toHaveLength(2));
  control.resolve();
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  expect(await first).toBe(true);

  expect(useSplitFaceStore.getState().sprues[0]!.profile.mainDiameterMm).toBe(originalDiameter+3);
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(historyLength+1);
  useSplitFaceStore.getState().undo();
  const undone=useSplitFaceStore.getState();
  expect(undone.sprues[0]!.profile.mainDiameterMm).toBe(originalDiameter);
  expect(undone.sprueStatus).toBe("idle");
  expect(undone.evaluation.phase).toBe("complete");
  useSplitFaceStore.getState().redo();
  expect(useSplitFaceStore.getState().sprues[0]!.profile.mainDiameterMm).toBe(originalDiameter+3);
 });
});

describe("Sprue current-failure rollback",()=>{
 it("a current resize failure rolls the presentation back to the last valid resolved geometry and stays truthful",async()=>{
  const resolved=await prepareResolvedSprue();
  const historyLength=useSplitFaceStore.getState().undoStack.length;
  const control=controlledEvaluation();

  const resizeAction=useSplitFaceStore.getState().resizeSprue(resolved.operationId,resolved.profile.mainDiameterMm+5);
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  control.reject(new Error("engine unavailable"));
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  expect(await resizeAction).toBe(true);

  const after=useSplitFaceStore.getState();
  expect(after.evaluation.phase).toBe("failed");
  expect(after.evaluation.failure?.message).toBe("engine unavailable");
  expect(after.error).toBe("engine unavailable");
  expect(after.undoStack).toHaveLength(historyLength);
  const presentation=selectSpruePresentationDefinitions(after)[0]!;
  expect(presentation.profile).toEqual(resolved.profile);
  expect(presentation.status).toBe("invalid");
  expect(presentation.depthMm).toBe(resolved.depthMm);
 });

 it("a failed new Create with no prior resolved geometry leaves no fake resolved Sprue",async()=>{
  await prepareSprueState();
  const historyLength=useSplitFaceStore.getState().undoStack.length;
  const control=controlledEvaluation();

  const actionA=useSplitFaceStore.getState().createSprue(placement());
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  expect(useSplitFaceStore.getState().sprueStatus).toBe("generating");
  control.reject(new Error("sprue cannot be built"));
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  expect(await actionA).toBe(true);

  const after=useSplitFaceStore.getState();
  expect(after.sprues).toHaveLength(0);
  expect(after.evaluation.phase).toBe("failed");
  expect(after.error).toBe("sprue cannot be built");
  expect(after.undoStack).toHaveLength(historyLength);
  const presentation=selectSpruePresentationDefinitions(after)[0]!;
  expect(presentation.status).toBe("invalid");
  expect(presentation).not.toHaveProperty("depthMm");
  expect(presentation).not.toHaveProperty("targetBodyIds");
 });
});

describe("Sprue pending presentation precedence",()=>{
 it("pending profile beats stale resolved profile and keeps the other diameter coherent",async()=>{
  const resolved=await prepareResolvedSprue();
  const control=controlledEvaluation();

  const resizeAction=useSplitFaceStore.getState().resizeSprue(resolved.operationId,resolved.profile.mainDiameterMm+2);
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  const after=useSplitFaceStore.getState();
  const presentation=selectSpruePresentationDefinitions(after)[0]!;
  expect(presentation.status).toBe("pending");
  expect(presentation.profile.mainDiameterMm).toBe(resolved.profile.mainDiameterMm+2);
  expect(presentation.profile.entryNeckDiameterMm).toBe(resolved.profile.entryNeckDiameterMm);
  expect(presentation.position).toEqual(resolved.position);
  expect(presentation).not.toHaveProperty("depthMm");
  expect(presentation).not.toHaveProperty("targetBodyIds");
  control.resolve();
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  expect(await resizeAction).toBe(true);
 });

 it("pending move position beats stale resolved position",async()=>{
  const resolved=await prepareResolvedSprue();
  const control=controlledEvaluation();

  const moveAction=useSplitFaceStore.getState().moveSprue(resolved.operationId,{x:3,y:6,z:30});
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  const after=useSplitFaceStore.getState();
  const presentation=selectSpruePresentationDefinitions(after)[0]!;
  expect(presentation.status).toBe("pending");
  expect(presentation.position).toEqual({x:3,y:6,z:30});
  control.resolve();
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  expect(await moveAction).toBe(true);
  expect(useSplitFaceStore.getState().sprues[0]!.position).toEqual({x:3,y:6,z:30});
 });
});

describe("Sprue scheduler lifecycle",()=>{
 it("undo during an active evaluation invalidates it and clears the scheduler",async()=>{
  const resolved=await prepareResolvedSprue();
  const control=controlledEvaluation();

  const resizeAction=useSplitFaceStore.getState().resizeSprue(resolved.operationId,resolved.profile.mainDiameterMm+4);
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  useSplitFaceStore.getState().undo();
  // Undo reverts to the last committed history state (before the burst; the
  // burst itself created no history entry) and clears the scheduler.
  expect(useSplitFaceStore.getState().sprueDefinitions).toHaveLength(0);
  expect(useSplitFaceStore.getState().sprues).toHaveLength(0);
  expect(useSplitFaceStore.getState().sprueStatus).toBe("idle");
  expect(cancelDerivedMoldEvaluation).toHaveBeenCalled();

  control.resolve();
  await waitFor(()=>expect(resizeAction).resolves.toBe(true));
  // The stale result must not resurrect any state after undo.
  expect(useSplitFaceStore.getState().sprueDefinitions).toHaveLength(0);
  expect(useSplitFaceStore.getState().sprues).toHaveLength(0);
  expect(useSplitFaceStore.getState().sprueStatus).toBe("idle");
 });

 it("model replacement clears pending work so no queued Sprue job runs against the replacement model",async()=>{
  const resolved=await prepareResolvedSprue();
  const control=controlledEvaluation();

  const first=useSplitFaceStore.getState().resizeSprue(resolved.operationId,resolved.profile.mainDiameterMm+1);
  expect(await useSplitFaceStore.getState().resizeSprue(resolved.operationId,resolved.profile.mainDiameterMm+2)).toBe(true);
  expect(control.calls()).toHaveLength(1);
  useSplitFaceStore.getState().clearForModelReplacement();
  expect(useSplitFaceStore.getState().sprueDefinitions).toHaveLength(0);

  control.resolve();
  await waitFor(()=>expect(control.pending).toHaveLength(0));
  expect(control.calls()).toHaveLength(1);
  expect(useSplitFaceStore.getState().sprueDefinitions).toHaveLength(0);
  expect(useSplitFaceStore.getState().sprues).toHaveLength(0);
  expect(useSplitFaceStore.getState().sprueStatus).toBe("idle");
  expect(await first).toBe(true);
 });

 it("store instances own independent schedulers: a busy store does not block or clobber another",async()=>{
  await prepareResolvedSprue();
  const first=useSplitFaceStore;
  const runDerivedMoldEvaluationSecond=vi.fn(runDerivedMoldEvaluationProduction);
  const second=createStore(createSplitFaceStoreCreator({runDerivedMoldEvaluation:runDerivedMoldEvaluationSecond,cancelDerivedMoldEvaluation,cancelActiveCavityGeneration,runCavityGenerationInWorker}));
  await prepareSecondStore(second);

  const firstControl=controlledEvaluation();
  const actionA=first.getState().createSprue(placement(2));
  await waitFor(()=>expect(firstControl.calls()).toHaveLength(1));

  // The second store has its own scheduler: it accepts and dispatches immediately.
  const secondPending:Array<{input:DerivedMoldEvaluationInput;resolve:(result:DerivedMoldEvaluationResult)=>void;reject:(error:unknown)=>void}>=[];
  runDerivedMoldEvaluationSecond.mockImplementation((input:DerivedMoldEvaluationInput)=>new Promise<DerivedMoldEvaluationResult>((resolve,reject)=>{secondPending.push({input,resolve,reject});}));
  const actionB=second.getState().createSprue(placement(8));
  await waitFor(()=>expect(secondPending).toHaveLength(1));
  expect(second.getState().sprueStatus).toBe("generating");
  expect(first.getState().sprueDefinitions).toHaveLength(2);

  firstControl.resolve();
  await waitFor(()=>expect(firstControl.pending).toHaveLength(0));
  expect(second.getState().sprueStatus).toBe("generating");
  expect(secondPending).toHaveLength(1);
  expect(secondPending[0]!.input.sprueDefinitions[0]!.anchor.position.x).toBe(8);

  secondPending[0]!.resolve(derivedOk(secondPending[0]!.input,first.getState().sprues[0]!));
  await waitFor(()=>expect(second.getState().sprueStatus).toBe("idle"));
  expect(await actionB).toBe(true);
  expect(await actionA).toBe(true);
 });
});
