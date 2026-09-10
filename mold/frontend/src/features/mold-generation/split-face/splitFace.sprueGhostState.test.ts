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

/**
 * Deferred derived-mold runner with PRODUCTION-FAITHFUL supersession
 * semantics: every new dispatch first rejects the still-pending previous
 * request with `evaluation_cancelled`, exactly like the module-level
 * runner's single `cancelActive` slot does. The injected
 * `cancelDerivedMoldEvaluation` is forwarded to the live queue so
 * `cancelSprueScheduler` behaves like the production runner's cancel.
 */
function deferredDerivedRunner(){
 const baseline=runDerivedMoldEvaluation.mock.calls.length;
 type Entry={input:DerivedMoldEvaluationInput;resolve:(result:DerivedMoldEvaluationResult)=>void;reject:(error:unknown)=>void};
 const pending:Entry[]=[];
 const cancelActiveEntry=(reason?:string)=>{const active=pending.shift();active?.reject(Object.assign(new Error(reason??"Derived mold evaluation was cancelled."),{code:"evaluation_cancelled"}));};
 runDerivedMoldEvaluation.mockImplementation((input:DerivedMoldEvaluationInput)=>new Promise<DerivedMoldEvaluationResult>((resolve,reject)=>{
  cancelActiveEntry("A newer mold evaluation replaced this request.");
  pending.push({input,resolve,reject});
 }));
 cancelDerivedMoldEvaluation.mockImplementation((reason?:string)=>cancelActiveEntry(reason));
 const template=useSplitFaceStore.getState().sprues[0]!;
 const derivedOk=(input:DerivedMoldEvaluationInput):DerivedMoldEvaluationResult=>({
  requestId:input.requestId,
  sourceRevision:input.sourceRevision,
  sourceFingerprint:input.sourceFingerprint,
  sprueBodies:[],
  sprueDefinitions:input.sprueDefinitions.map(definition=>({...definition,validation:{status:"resolved" as const,reasonCode:null,message:null}})),
  resolvedSprues:input.sprueDefinitions.map(definition=>({...template,operationId:definition.operationId,position:definition.anchor.position,inwardDirection:definition.inwardDirection,profile:definition.profileDesign.profile})),
  registration:{status:"generated",revision:input.sourceFingerprint,bodies:[],report:null},
  warnings:[],
 });
 return {
  pending,
  calls:()=>runDerivedMoldEvaluation.mock.calls.slice(baseline).map(call=>call[0] as DerivedMoldEvaluationInput),
  resolveNext:()=>{const entry=pending.shift();entry?.resolve(derivedOk(entry.input));},
  rejectNext:(error:unknown)=>{const entry=pending.shift();entry?.reject(error);},
 };
}

type HeldCavity={promise:Promise<boolean>;armed:()=>boolean;reject:(error:unknown)=>void;release:(execution:CavityWorkerExecutionResult)=>void;};
/** Arms the NEXT cavity Worker run as a manually-controlled deferred promise for `createCavity`. */
function holdNextCavityWorker(canonicalPartGeometry:CanonicalPartGeometry):HeldCavity{
 let release:(result:CavityGenerationResult)=>void=()=>undefined;
 let reject:(error:unknown)=>void=()=>undefined;
 let armed=false;
 runCavityGenerationInWorker.mockImplementationOnce(()=>{
  armed=true;
  return new Promise<CavityWorkerExecutionResult>((resolve,rej)=>{release=resolve;reject=rej;});
 });
 const promise=useSplitFaceStore.getState().createCavity(canonicalPartGeometry);
 return {promise,armed:()=>armed,reject:(error:unknown)=>reject(error),release:(execution)=>release(execution)};
}

/** Prepares the real committed state: mold parts + cavity + one resolved Sprue. Returns the canonical part geometry used. */
async function prepareCommittedSprueState(){
 const canonicalPartGeometry=canonicalCube("m",k1);
 const s=useSplitFaceStore.getState();
 s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
 s.enterSelection();
 s.toggleFace("front");
 expect(await s.createMoldParts("m",k1)).toBe(true);
 expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
 expect(await useSplitFaceStore.getState().createSprue(placement(5))).toBe(true);
 await waitFor(()=>expect(useSplitFaceStore.getState().sprues.length).toBe(1));
 await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
 return canonicalPartGeometry;
}

beforeEach(()=>{
 useSplitFaceStore=createStore(createSplitFaceStoreCreator({runDerivedMoldEvaluation,cancelDerivedMoldEvaluation,runCavityGenerationInWorker,cancelActiveCavityGeneration}));
});
afterEach(()=>{
 vi.restoreAllMocks();
 runDerivedMoldEvaluation.mockClear();
 runDerivedMoldEvaluation.mockImplementation(runDerivedMoldEvaluationProduction);
 cancelDerivedMoldEvaluation.mockClear();
 cancelDerivedMoldEvaluation.mockImplementation(cancelDerivedMoldEvaluationProduction);
});

describe("Sprue/cavity scheduler ownership (ghost busy state)",()=>{
 it("re-running Create Cavity during an active Sprue cycle cannot leave ghost sprueStatus 'generating'",async()=>{
  const canonicalPartGeometry=await prepareCommittedSprueState();
  const runner=deferredDerivedRunner();
  const undoLength=useSplitFaceStore.getState().undoStack.length;

  expect(await useSplitFaceStore.getState().createSprue(placement(2))).toBe(true);
  await waitFor(()=>expect(runner.calls()).toHaveLength(1));
  expect(useSplitFaceStore.getState().sprueStatus).toBe("generating");

  // A second Create Cavity is a legal store-level action here
  // (cavity.status==="complete"): it bumps the document, superseding the
  // active Sprue cycle. Its own derived dispatch (same shared runner) is
  // what cancels the Sprue request in production.
  const held=holdNextCavityWorker(canonicalPartGeometry);
  await waitFor(()=>expect(held.armed()).toBe(true));
  held.release({result:useSplitFaceStore.getState().cavity.result!,validationWarnings:[]});
  // The cavity's derived dispatch supersedes (cancels) the held Sprue request.
  await waitFor(()=>expect(runner.pending).toHaveLength(1));
  runner.resolveNext();
  const cavityOutcome=await held.promise;
  
  expect(cavityOutcome).toBe(true);

  const after=useSplitFaceStore.getState();
  // THE GHOST INVARIANT: no sprue scheduler work is live anymore, so the
  // busy flag must be idle. createMoldParts gates on this field.
  expect(after.sprueStatus).toBe("idle");
  expect(after.evaluation.phase).toBe("complete");
  expect(after.evaluation.requestId).toContain("mold-eval:");
  expect(after.registration.status).toBe("generated");
  expect(after.lastCommittedResult?.sourceFingerprint).toBe(after.document.fingerprint);
  expect(after.lastCommittedResult?.sourceRevision).toBe(after.document.revision);
  // The cavity rebuild carried the preserved Sprue intent (both operations) through its own derived evaluation.
  expect(after.sprues).toHaveLength(2);
  expect(after.sprueDefinitions.every(definition=>definition.validation.status==="resolved")).toBe(true);
  expect(after.error).toBeNull();
  // Exactly the cavity commit's own history entry; the superseded Sprue cycle wrote none.
  expect(after.undoStack).toHaveLength(undoLength+1);
 });

 it("a Sprue cycle left in flight by a failed Create Cavity attempt cannot leave ghost sprueStatus or registration 'generating'",async()=>{
  const canonicalPartGeometry=await prepareCommittedSprueState();
  const runner=deferredDerivedRunner();

  expect(await useSplitFaceStore.getState().createSprue(placement(2))).toBe(true);
  await waitFor(()=>expect(runner.calls()).toHaveLength(1));

  const held=holdNextCavityWorker(canonicalPartGeometry);
  await waitFor(()=>expect(held.armed()).toBe(true));
  expect(useSplitFaceStore.getState().cavity.status).toBe("generating");
  held.reject(new Error("cavity exploded"));
  expect(await held.promise).toBe(false);

  const afterFailure=useSplitFaceStore.getState();
  expect(afterFailure.cavity.status).toBe("blocked");
  expect(afterFailure.evaluation.phase).toBe("failed");
  expect(afterFailure.cavity.lastError).toBe("cavity exploded");
  // The still-in-flight Sprue evaluation settles stale; the un-owned busy
  // flag and the cavity attempt's own registration marker must clear.
  runner.resolveNext();
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  const final=useSplitFaceStore.getState();
  expect(final.sprueStatus).toBe("idle");
  expect(final.registration.status).toBe("unavailable");
  expect(final.sprues).toHaveLength(1);
  expect(final.evaluation.phase).toBe("failed");
 });
});

describe("Stale cavity-failure channel ownership",()=>{
 it("a cavity failure after a newer Sprue commit cannot clobber the Sprue-owned evaluation channel",async()=>{
  const canonicalPartGeometry=await prepareCommittedSprueState();
  const runner=deferredDerivedRunner();

  // Cavity attempt #2 starts and blocks at the (held) cavity Worker.
  const held=holdNextCavityWorker(canonicalPartGeometry);
  await waitFor(()=>expect(held.armed()).toBe(true));
  expect(useSplitFaceStore.getState().cavity.status).toBe("generating");

  // A newer Sprue intent is accepted and COMMITS while the cavity Worker runs.
  expect(await useSplitFaceStore.getState().createSprue(placement(2))).toBe(true);
  await waitFor(()=>expect(runner.calls()).toHaveLength(1));
  runner.resolveNext();
  await waitFor(()=>expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
  const sprueCommitted=useSplitFaceStore.getState();
  expect(sprueCommitted.evaluation.phase).toBe("complete");
  expect(sprueCommitted.registration.status).toBe("generated");
  expect(sprueCommitted.sprues).toHaveLength(2);

  // The now-STALE cavity attempt fails: it must not write the newer
  // Sprue-owned evaluation channel.
  held.reject(new Error("cavity exploded"));
  expect(await held.promise).toBe(false);

  const after=useSplitFaceStore.getState();
  expect(after.evaluation.phase).toBe("complete");
  expect(after.evaluation.requestId).toBe(sprueCommitted.evaluation.requestId);
  expect(after.evaluation.failure).toBeNull();
  expect(after.registration.status).toBe("generated");
  // Cavity state itself is truthfully blocked (this attempt did fail and
  // still owned the cavity Worker slot).
  expect(after.cavity.status).toBe("blocked");
  expect(after.cavity.lastError).toBe("cavity exploded");
  // The stale cavity failure may not write the Sprue-owned global error channel either.
  expect(after.error).toBeNull();
 });

 it("a cavity failure after Undo cannot clobber the restored snapshot",async()=>{
  const canonicalPartGeometry=await prepareCommittedSprueState();

  const held=holdNextCavityWorker(canonicalPartGeometry);
  await waitFor(()=>expect(held.armed()).toBe(true));

  useSplitFaceStore.getState().undo();
  const restored=useSplitFaceStore.getState();
  expect(restored.cavity.status).toBe("complete");

  held.reject(new Error("cavity exploded"));
  expect(await held.promise).toBe(false);

  const after=useSplitFaceStore.getState();
  // The stale failure must be discarded silently against the restored state.
  expect(after.cavity.status).toBe("complete");
  expect(after.evaluation.phase).toBe(restored.evaluation.phase);
  expect(after.evaluation.requestId).toBe(restored.evaluation.requestId);
  expect(after.error).toBe(restored.error);
  expect(after.sprueStatus).toBe("idle");
  expect(after.sprues).toHaveLength(0);
  expect(after.registration.status).toBe(restored.registration.status);
 });

 it("a failed cavity attempt cannot leave ghost registration 'generating'",async()=>{
  const canonicalPartGeometry=await prepareCommittedSprueState();

  const held=holdNextCavityWorker(canonicalPartGeometry);
  await waitFor(()=>expect(held.armed()).toBe(true));
  expect(useSplitFaceStore.getState().registration.status).toBe("generating");

  held.reject(new Error("cavity exploded"));
  expect(await held.promise).toBe(false);

  const after=useSplitFaceStore.getState();
  expect(after.evaluation.phase).toBe("failed");
  expect(after.evaluation.failure?.message).toBe("cavity exploded");
  // THE GHOST INVARIANT: nothing is generating anymore.
  expect(after.registration.status).toBe("unavailable");
  expect(after.cavity.status).toBe("blocked");
 });

 it("a cavity attempt discarded after an upstream Mold Scale cannot resurrect the scale-invalidated cavity",async()=>{
  const canonicalPartGeometry=await prepareCommittedSprueState();

  const held=holdNextCavityWorker(canonicalPartGeometry);
  await waitFor(()=>expect(held.armed()).toBe(true));
  expect(useSplitFaceStore.getState().registration.status).toBe("generating");

  // Upstream Mold Scale during the cavity Worker run rebuilds the
  // definition synchronously and invalidates the attempt's input signature.
  const attemptResult=useSplitFaceStore.getState().cavity.result!;
  useSplitFaceStore.getState().setClearanceMm(useSplitFaceStore.getState().clearanceMm+1);
  const scaled=useSplitFaceStore.getState();
  expect(scaled.cavity.status).toBe("unavailable");
  expect(scaled.registration.status).toBe("unavailable");

  held.release({result:attemptResult,validationWarnings:[]});
  expect(await held.promise).toBe(false);

  const after=useSplitFaceStore.getState();
  // THE CLOBBER INVARIANT: the discarded attempt must not flip the
  // scale-invalidated cavity back to "ready".
  expect(after.cavity.status).toBe("unavailable");
  expect(after.registration.status).toBe("unavailable");
  expect(after.evaluation.phase).not.toBe("evaluating");
 });
});



