import { createSplitFaceStoreCreator, type SplitFaceState, type SplitFaceStoreDeps } from "./splitFace.store";
import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import type { CavityGenerationInput, CavityGenerationResult } from "../cavity-generation/cavityGeneration.contracts";
import type { CanonicalPartGeometry } from "../cavity-generation/cavityGeneration.contracts";
import type { CavityWorkerExecutionResult } from "../cavity-generation/cavityGeneration.workerClient";
import { generateCavityBodies } from "../cavity-generation/cavityBody.generator";
import { createCavityTool } from "../cavity-generation/manifold.engine";
import { validateAndPreparePartSolid } from "../cavity-generation/partSolid.validator";
import { designSprueProfile } from "../sprue-generation";
import type { ValidSpruePreviewPlacement } from "../sprue-generation/sprueGeneration.contracts";
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

type ProgressCallback=((stage:"sprues"|"registration",progress:number)=>void)|undefined;
/** Deferred derived runner with production-faithful supersession semantics; captures onProgress. */
function controlled(){
 const baseline=runDerivedMoldEvaluation.mock.calls.length;
 type Entry={input:DerivedMoldEvaluationInput;onProgress:ProgressCallback;resolve:(result:DerivedMoldEvaluationResult)=>void;reject:(error:unknown)=>void};
 const pending:Entry[]=[];
 const cancelActiveEntry=(reason?:string)=>{const active=pending.shift();active?.reject(Object.assign(new Error(reason??"Derived mold evaluation was cancelled."),{code:"evaluation_cancelled"}));};
 runDerivedMoldEvaluation.mockImplementation((input:DerivedMoldEvaluationInput,onProgress?:ProgressCallback)=>new Promise<DerivedMoldEvaluationResult>((resolve,reject)=>{
  cancelActiveEntry("A newer mold evaluation replaced this request.");
  pending.push({input,onProgress,resolve,reject});
 }));
 cancelDerivedMoldEvaluation.mockImplementation((reason?:string)=>cancelActiveEntry(reason));
 const template=useSplitFaceStore.getState().sprues[0];
 const derivedOk=(input:DerivedMoldEvaluationInput):DerivedMoldEvaluationResult=>{
  const resolvedTemplate=template??{operationId:input.requestId,position:{x:5,y:5,z:30},inwardDirection:{x:0,y:0,z:-1},profile:input.sprueDefinitions[0]?.profileDesign.profile??profileDesign.profile,depthMm:10,targetBodyIds:["b"]};
  return {
   requestId:input.requestId,sourceRevision:input.sourceRevision,sourceFingerprint:input.sourceFingerprint,
   sprueBodies:[],
   sprueDefinitions:input.sprueDefinitions.map(definition=>({...definition,validation:{status:"resolved" as const,reasonCode:null,message:null}})),
   resolvedSprues:input.sprueDefinitions.map(definition=>({...resolvedTemplate,operationId:definition.operationId,position:definition.anchor.position,inwardDirection:definition.inwardDirection,profile:definition.profileDesign.profile})),
   registration:{status:"generated",revision:input.sourceFingerprint,bodies:[],report:null},
   warnings:[],
  };
 };
 return {
  pending,
  calls:()=>runDerivedMoldEvaluation.mock.calls.slice(baseline).map(call=>call[0] as DerivedMoldEvaluationInput),
  resolveNext:()=>{const entry=pending.shift();entry?.resolve(derivedOk(entry.input));},
  rejectNext:(error:unknown)=>{const entry=pending.shift();entry?.reject(error);},
 };
}
type Control=ReturnType<typeof controlled>;

/** Real committed state: mold parts + cavity (all real Manifold work). */
async function prepareCommittedCavity(faces:Array<"front"|"right">=["front"]):Promise<CanonicalPartGeometry>{
 const canonicalPartGeometry=canonicalCube("m",k1);
 const s=useSplitFaceStore.getState();
 s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
 s.enterSelection();
 faces.forEach(face=>s.toggleFace(face));
 if(faces.length>1){for(const plane of useSplitFaceStore.getState().cuttingPlanes){s.beginPlaneDrag(plane.id);s.commitPlaneDrag(plane.id,.5,k1);}}
 expect(await useSplitFaceStore.getState().createMoldParts("m",k1)).toBe(true);
 expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
 return canonicalPartGeometry;
}

/** Real resolved Sprue committed against the real engine. */
async function prepareResolvedSprue(x=5){
 await prepareCommittedCavity();
 expect(await useSplitFaceStore.getState().createSprue(placement(x))).toBe(true);
 await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
 return useSplitFaceStore.getState().sprues[0]!;
}

interface RowContext{store:StoreApi<SplitFaceState>;control:Control;geometry:CanonicalPartGeometry;}
interface InvalidationRow{
 name:string;
 setup?:(ctx:RowContext)=>Promise<void>;
 act:(ctx:RowContext)=>void|Promise<void>;
 intentPolicy:"cleared"|"pending"|"restored";
 /** True when the mutation itself dispatches its own derived evaluation. */
 selfDispatch?:boolean;
}

const idle=(store:StoreApi<SplitFaceState>)=>store.getState().sprueStatus;

/** Adds a second committed plane and rebuilds parts+cavity so one plane can be removed non-finally. */
async function addSecondCommittedPlane({store,geometry}:RowContext){
 store.getState().toggleFace("right");
 const plane=store.getState().cuttingPlanes[1]!;
 store.getState().beginPlaneDrag(plane.id);
 store.getState().commitPlaneDrag(plane.id,.5,k1);
 await expect(store.getState().createMoldParts("m",k1)).resolves.toBe(true);
 await expect(store.getState().createCavity(geometry)).resolves.toBe(true);
}

const invalidatingRows:InvalidationRow[]=[
 {name:"toggleFace",intentPolicy:"cleared",act:({store})=>store.getState().toggleFace("right")},
 {name:"removeSplitFace",intentPolicy:"cleared",act:({store})=>store.getState().removeSplitFace("front")},
 {name:"clearSelection",intentPolicy:"cleared",act:({store})=>store.getState().clearSelection()},
 {name:"commitPlaneDrag (moved)",intentPolicy:"cleared",act:({store})=>{const plane=store.getState().cuttingPlanes[0]!;store.getState().beginPlaneDrag(plane.id);store.getState().commitPlaneDrag(plane.id,.4,k1);}},
 {name:"removeSplitFaceAndRebuild (non-final)",intentPolicy:"restored",selfDispatch:true,
  setup:async(ctx)=>{await addSecondCommittedPlane(ctx);},
  act:async({store,control})=>{const before=control.calls().length;const removing=store.getState().removeSplitFaceAndRebuild("front","m",k1);await waitFor(()=>expect(control.calls()).toHaveLength(before+1));control.resolveNext();expect(await removing).toBe(true);}},
 {name:"removeSplitFaceAndRebuild (final plane)",intentPolicy:"cleared",
  act:async({store})=>{expect(await store.getState().removeSplitFaceAndRebuild("front","m",k1)).toBe(true);}},
 {name:"removeSelectedSplitFaceAndRebuild",intentPolicy:"restored",selfDispatch:true,
  setup:async(ctx)=>{await addSecondCommittedPlane(ctx);ctx.store.getState().selectSplitFace("front");},
  act:async({store,control})=>{const before=control.calls().length;const removing=store.getState().removeSelectedSplitFaceAndRebuild("m",k1);await waitFor(()=>expect(control.calls()).toHaveLength(before+1));control.resolveNext();expect(await removing).toBe(true);}},
 {name:"Mold Scale (setClearanceMm)",intentPolicy:"pending",act:({store})=>store.getState().setClearanceMm(store.getState().clearanceMm+1)},
 {name:"Mold Scale (drag transaction commit)",intentPolicy:"pending",act:({store})=>{store.getState().beginClearanceEdit();store.getState().updateClearanceEdit(store.getState().clearanceMm+2);store.getState().commitClearanceEdit();}},
 {name:"Mold Scale drag cancel",intentPolicy:"restored",act:({store})=>{store.getState().beginClearanceEdit();store.getState().updateClearanceEdit(store.getState().clearanceMm+2);store.getState().cancelClearanceEdit();}},
 {name:"canonical geometry signature replacement",intentPolicy:"restored",act:({store})=>store.getState().setCanonicalPartGeometrySignature("cube:changed")},
 {name:"orientation change",intentPolicy:"cleared",act:({store})=>store.getState().clearForOrientationChange()},
 {name:"model replacement",intentPolicy:"cleared",act:({store})=>store.getState().clearForModelReplacement()},
 {name:"undo",intentPolicy:"restored",act:({store})=>store.getState().undo()},
 {name:"redo",
  setup:async({store})=>{
   const target=store.getState().sprues[0]!;
   expect(await store.getState().resizeSprue(target.operationId,target.profile.mainDiameterMm+0.5)).toBe(true);
   await waitFor(()=>expect(idle(store)).toBe("idle"));
   store.getState().undo();
   await waitFor(()=>expect(idle(store)).toBe("idle"));
  },
  intentPolicy:"restored",
  act:({store})=>store.getState().redo()},
 {name:"fresh Segmentation adoption",intentPolicy:"pending",act:({store})=>{
   const definition=store.getState().definition!;
   store.getState().adoptCommittedSegmentationResult({sourceSignature:store.getState().partGeometrySignature,sourceDefinition:definition,bodies:definition.moldBodies??[],warnings:[]});
  }},
 {name:"Scale-triggered Segmentation promotion",intentPolicy:"pending",act:({store})=>{
   const state=store.getState();
   const definition=state.definition!;
   store.getState().promoteReplannedSegmentationResult({expectedPriorRevision:state.document.revision,sourceSignature:state.partGeometrySignature,sourceDefinition:definition,bodies:definition.moldBodies??[],warnings:[]});
  }},
];

/** Captures the post-mutation authoritative cluster; stale deliveries must not move any of it. */
function captureInertness(store:StoreApi<SplitFaceState>){
 const s=store.getState();
 return {document:s.document,registration:s.registration,lastCommittedResult:s.lastCommittedResult,bodyVisibility:s.bodyVisibility,sprues:s.sprues,undoLength:s.undoStack.length};
}
function expectInert(store:StoreApi<SplitFaceState>,captured:ReturnType<typeof captureInertness>){
 const s=store.getState();
 expect(s.document).toBe(captured.document);
 expect(s.registration).toBe(captured.registration);
 expect(s.lastCommittedResult).toBe(captured.lastCommittedResult);
 expect(s.bodyVisibility).toBe(captured.bodyVisibility);
 expect(s.sprues).toBe(captured.sprues);
 expect(s.undoStack).toHaveLength(captured.undoLength);
 expect(s.sprueStatus).toBe("idle");
}

describe("Upstream invalidation matrix: stale work is observationally inert",()=>{
 it.each(invalidatingRows)("$name: active-only cycle -- the cancelled old request commits nothing and a fresh retry is atomic",async({setup,act,intentPolicy,selfDispatch})=>{
  await prepareResolvedSprue();
  const store=useSplitFaceStore;
  const ctx:RowContext={store,control:null as unknown as Control,geometry:canonicalCube("m",k1)};
  if(setup)await setup(ctx);
  const control=controlled();
  ctx.control=control;

  expect(await store.getState().createSprue(placement(2))).toBe(true);
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  expect(idle(store)).toBe("generating");
  const dispatchesBeforeAct=control.calls().length;

  await act(ctx);
  const captured=captureInertness(store);
  if(intentPolicy==="cleared"){expect(store.getState().sprueDefinitions).toHaveLength(0);}
  if(intentPolicy==="pending"){expect(store.getState().sprueDefinitions.every(d=>d.validation.status==="pending")).toBe(true);}
  if(intentPolicy==="restored"){expect(store.getState().sprueDefinitions.some(d=>d.validation.status==="resolved")).toBe(true);}

  // The old request's tail (a cancelled rejection under production-faithful
  // cancellation semantics) settles inert: no commit, no history, no status.
  await waitFor(()=>expect(idle(store)).toBe("idle"));
  expectInert(store,captured);
  // No queued obsolete work may start beyond the mutation's own (declared) dispatch.
  expect(control.calls().length).toBe(dispatchesBeforeAct+(selfDispatch??0));

  // Retry readiness for the current document.
  if(store.getState().cavity.result!==null){
   const retry=store.getState().createSprue(placement(7));
   await waitFor(()=>expect(control.calls()).toHaveLength(2));
   // A CURRENT failure right after the mutation is atomic.
   control.rejectNext(new Error("boom"));
   await waitFor(()=>expect(idle(store)).toBe("idle"));
   expect(await retry).toBe(true);
   expectInert(store,captured);
   // An immediate retry succeeds and commits for the current document.
   const retry2=store.getState().createSprue(placement(9));
   await waitFor(()=>expect(control.calls()).toHaveLength(3));
   control.resolveNext();
   await waitFor(()=>expect(idle(store)).toBe("idle"));
   expect(await retry2).toBe(true);
   const after=store.getState();
   expect(after.sprues).toHaveLength(after.sprueDefinitions.length);
   expect(after.evaluation.phase).toBe("complete");
  }else{
   // Cavity-invalidating rows: acceptance still succeeds truthfully without dispatching.
   expect(await store.getState().createSprue(placement(7))).toBe(store.getState().definition!==null);
   expect(idle(store)).toBe("idle");
  }
 },30_000);

 it.each(invalidatingRows)("$name: active+pending-latest cycle -- queued obsolete work never starts, the old tail is silent",async({setup,act,intentPolicy,selfDispatch})=>{
  await prepareResolvedSprue();
  const store=useSplitFaceStore;
  const ctx:RowContext={store,control:null as unknown as Control,geometry:canonicalCube("m",k1)};
  if(setup)await setup(ctx);
  const control=controlled();
  ctx.control=control;

  expect(await store.getState().createSprue(placement(2))).toBe(true);
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  // A newer intent is coalesced as the latest pending snapshot.
  expect(await store.getState().createSprue(placement(8))).toBe(true);
  // Production-faithful cancellation: the superseded older request settles
  // cancelled and the LATEST pending snapshot starts immediately. This is
  // the bounded burst behavior (dispatch delta <= 2), not a regression.
  await waitFor(()=>expect(control.calls()).toHaveLength(2));
  expect(control.calls()[1]!.sprueDefinitions.at(-1)!.anchor.position.x).toBe(8);
  const dispatchesBeforeAct=control.calls().length;

  await act(ctx);
  const captured=captureInertness(store);
  if(intentPolicy==="cleared"){expect(store.getState().sprueDefinitions).toHaveLength(0);}
  if(intentPolicy==="pending"){expect(store.getState().sprueDefinitions.every(d=>d.validation.status==="pending")).toBe(true);}
  if(intentPolicy==="restored"){expect(store.getState().sprueDefinitions.some(d=>d.validation.status==="resolved")).toBe(true);}

  // The pending snapshot was discarded with the scheduler: no tail may
  // start queued obsolete work beyond the mutation's own (declared) dispatch.
  await waitFor(()=>expect(idle(store)).toBe("idle"));
  expectInert(store,captured);
  expect(control.calls().length).toBe(dispatchesBeforeAct+(selfDispatch??0));
  expect(store.getState().error).toBeNull();
 },30_000);
});

describe("Upstream preservation rows: the Sprue cycle survives and commits",()=>{
 const preserveRows:{name:string;act:(store:StoreApi<SplitFaceState>)=>void}[]=[
  {name:"addExtensionCuttingPlane",act:(store)=>{expect(store.getState().addExtensionCuttingPlane("top",["x"],0.5)).toBe(true);}},
  {name:"selectSplitFace",act:(store)=>store.getState().selectSplitFace("front")},
  {name:"setBodyVisibility",act:(store)=>store.getState().setBodyVisibility(store.getState().definition!.moldBodies![0]!.id,false)},
  {name:"begin+cancelPlaneDrag",act:(store)=>{const plane=store.getState().cuttingPlanes[0]!;store.getState().beginPlaneDrag(plane.id);store.getState().cancelPlaneDrag();}},
  {name:"beginClearanceEdit without update + commit",act:(store)=>{store.getState().beginClearanceEdit();store.getState().commitClearanceEdit();}},
  {name:"enterSelection re-entry",act:(store)=>store.getState().enterSelection()},
 ];

 it.each(preserveRows)("$name preserves the active Sprue cycle: evaluation identity holds and the commit lands",async({act})=>{
  await prepareResolvedSprue();
  const store=useSplitFaceStore;
  const control=controlled();
  expect(await store.getState().createSprue(placement(3))).toBe(true);
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  const requestId=store.getState().evaluation.requestId;

  act(store);
  expect(store.getState().evaluation.requestId).toBe(requestId);
  expect(idle(store)).toBe("generating");

  control.resolveNext();
  await waitFor(()=>expect(idle(store)).toBe("idle"));
  const after=store.getState();
  expect(after.sprues).toHaveLength(2);
  expect(after.evaluation.phase).toBe("complete");
  expect(after.lastCommittedResult?.sourceFingerprint).toBe(after.document.fingerprint);
  expect(after.registration.status).toBe("generated");
 },25_000);
});

describe("Registration-stage progress channel ownership",()=>{
 it("the cavity path's wired progress callback drives evaluation for its own request and ignores stale identities",async()=>{
  const geometry=await prepareCommittedCavity();
  const store=useSplitFaceStore;
  const control=controlled();

  // Start a second cavity attempt; hold its worker, then release it so its
  // derived dispatch (which wires onProgress) lands in the controlled queue.
  let release!:(execution:CavityWorkerExecutionResult)=>void;
  runCavityGenerationInWorker.mockImplementationOnce(()=>{
   return new Promise<CavityWorkerExecutionResult>((resolve)=>{
    release=resolve;
   });
  });
  const secondCavity=store.getState().createCavity(geometry);
  await waitFor(()=>expect(typeof release).toBe("function"));
  release({result:store.getState().cavity.result!,validationWarnings:[]});
  await waitFor(()=>expect(control.pending).toHaveLength(1));
  const cavityEntry=control.pending[0]!;

  // Current progress: the store's evaluation follows the cavity request.
  cavityEntry.onProgress?.("registration",0.9);
  expect(store.getState().evaluation.stage).toBe("registration");
  expect(store.getState().evaluation.progress).toBe(0.9);

   // A newer sprue acceptance supersedes the cavity attempt.
   expect(await store.getState().createSprue(placement(3))).toBe(true);
   await waitFor(()=>expect(control.pending).toHaveLength(1));
   const cavityEvaluation=store.getState().evaluation;

   // The stale progress callback must be inert now.
   cavityEntry.onProgress?.("registration",1);
   expect(store.getState().evaluation.requestId).toBe(cavityEvaluation.requestId);
   expect(store.getState().evaluation.progress).toBe(cavityEvaluation.progress);
   expect(store.getState().evaluation.stage).toBe(cavityEvaluation.stage);

   // Let the sprue cycle commit; the cavity attempt's held dispatch resolves stale.
   control.resolveNext();
   await waitFor(()=>expect(store.getState().sprueStatus).toBe("idle"));
   const remaining=control.pending[0];
   remaining?.resolve({
    requestId:remaining.input.requestId,sourceRevision:remaining.input.sourceRevision,sourceFingerprint:remaining.input.sourceFingerprint,
    sprueBodies:[],sprueDefinitions:remaining.input.sprueDefinitions,resolvedSprues:[],
    registration:{status:"unavailable",revision:null,bodies:null,report:null},warnings:[],
   });
   expect(await secondCavity).toBe(false);
   expect(store.getState().sprues).toHaveLength(1);
   expect(store.getState().sprueDefinitions.every(d=>d.validation.status==="resolved")).toBe(true);
  },25_000);
 });

describe("Sprue x Cavity x Registration coherence",()=>{
 it("a committed Sprue edit preserves the upstream cavity result by reference and keeps Registration keyed to the same fingerprint",async()=>{
  const resolved=await prepareResolvedSprue();
  const store=useSplitFaceStore;
  const cavityResultBefore=store.getState().cavity.result;
  const control=controlled();

  expect(await store.getState().resizeSprue(resolved.operationId,resolved.profile.mainDiameterMm+1)).toBe(true);
  await waitFor(()=>expect(control.calls()).toHaveLength(1));
  control.resolveNext();
  await waitFor(()=>expect(idle(store)).toBe("idle"));

  const after=store.getState();
  expect(after.cavity.result).toBe(cavityResultBefore);
  expect(after.registration.status).toBe("generated");
  expect(after.registration.revision).toBe(after.document.fingerprint);
  expect(after.lastCommittedResult?.sourceFingerprint).toBe(after.document.fingerprint);
  expect(after.lastCommittedResult?.stages.cavityResult).toBe(cavityResultBefore as CavityGenerationResult|null);
 });
});




