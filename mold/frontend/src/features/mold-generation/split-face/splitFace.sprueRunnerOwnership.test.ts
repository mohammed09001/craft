import { createSplitFaceStoreCreator, type SplitFaceState, type SplitFaceStoreDeps } from "./splitFace.store";
import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import type { CavityGenerationInput } from "../cavity-generation/cavityGeneration.contracts";
import { generateCavityBodies } from "../cavity-generation/cavityBody.generator";
import { createCavityTool } from "../cavity-generation/manifold.engine";
import { validateAndPreparePartSolid } from "../cavity-generation/partSolid.validator";
import { designSprueProfile } from "../sprue-generation";
import type { ValidSpruePreviewPlacement } from "../sprue-generation/sprueGeneration.contracts";
import type { DerivedMoldEvaluationInput, DerivedMoldEvaluationResult } from "../workflow/derivedMoldEvaluation.contracts";
import { cancelDerivedMoldEvaluation as cancelDerivedMoldEvaluationProduction, runDerivedMoldEvaluation as runDerivedMoldEvaluationProduction } from "../workflow";
import { createStore, type StoreApi } from "zustand/vanilla";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const runCavityGenerationInWorker = Object.assign(vi.fn(async(input:CavityGenerationInput)=>{
 const validation=validateAndPreparePartSolid(input);
 if(!validation.ok||validation.prepared===null)throw new Error(validation.blockers[0]?.message??"Uploaded model is not a subtractable solid.");
 const tool=await createCavityTool(validation.prepared,input.cavityClearanceMm,input.qualityMode,input.geometryToleranceMm);
 return {result:await generateCavityBodies(input,tool),validationWarnings:validation.warnings};
}),{cancel:vi.fn()}) as SplitFaceStoreDeps["runCavityGenerationInWorker"];
const cancelActiveCavityGeneration = vi.fn();

const k1={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}};
const profileDesign=designSprueProfile(null);
const placement=(x=5):ValidSpruePreviewPlacement=>({status:"valid",topPoint:{x,y:5,z:30},cavityPoint:{x,y:5,z:20},inwardDirection:{x:0,y:0,z:-1},stemLengthMm:10,profileDesign,coordinateSpace:"mold-local"});
const waitFor=vi.waitFor;

/** A shared runner handed to BOTH stores: real production engine while
 * preparing (mold parts/cavity need real evaluations), then switchable to a
 * deferred queue so the adversarial Sprue dispatches are controllable. */
function sharedRunner(){
 type Entry={input:DerivedMoldEvaluationInput;resolve:(result:DerivedMoldEvaluationResult)=>void;reject:(error:unknown)=>void};
 const state:{mode:"real"|"deferred";pending:Entry[]}={mode:"real",pending:[]};
 const derivedOk=(input:DerivedMoldEvaluationInput):DerivedMoldEvaluationResult=>({
  requestId:input.requestId,sourceRevision:input.sourceRevision,sourceFingerprint:input.sourceFingerprint,
  sprueBodies:[],
  sprueDefinitions:input.sprueDefinitions.map(definition=>({...definition,validation:{status:"resolved" as const,reasonCode:null,message:null}})),
  resolvedSprues:input.sprueDefinitions.map(definition=>({operationId:definition.operationId,position:definition.anchor.position,inwardDirection:definition.inwardDirection,profile:definition.profileDesign.profile,depthMm:10,targetBodyIds:["b"]})),
  registration:{status:"generated",revision:input.sourceFingerprint,bodies:[],report:null},
  warnings:[],
 });
 const run=vi.fn((input:DerivedMoldEvaluationInput):Promise<DerivedMoldEvaluationResult>=>{
  if(state.mode==="real")return runDerivedMoldEvaluationProduction(input);
  return new Promise<DerivedMoldEvaluationResult>((resolve,reject)=>{
   const previous=state.pending.shift();
   previous?.reject(Object.assign(new Error("A newer mold evaluation replaced this request."),{code:"evaluation_cancelled"}));
   state.pending.push({input,resolve,reject});
  });
 });
 const cancel=vi.fn((reason?:string)=>{
  if(state.mode==="real"){cancelDerivedMoldEvaluationProduction(reason);return;}
  const active=state.pending.shift();
  active?.reject(Object.assign(new Error(reason??"Derived mold evaluation was cancelled."),{code:"evaluation_cancelled"}));
 });
 return {
  run,cancel,
  defer:()=>{state.mode="deferred";},
  pending:state.pending,
  resolveNext:()=>{const entry=state.pending.shift();entry?.resolve(derivedOk(entry.input));},
 };
}

type RunnerLike={run:(input:DerivedMoldEvaluationInput)=>Promise<DerivedMoldEvaluationResult>;cancel:(reason?:string)=>void};
function makeStore(runner:RunnerLike){
 return createStore(createSplitFaceStoreCreator({runDerivedMoldEvaluation:runner.run as unknown as SplitFaceStoreDeps["runDerivedMoldEvaluation"],cancelDerivedMoldEvaluation:runner.cancel as unknown as SplitFaceStoreDeps["cancelDerivedMoldEvaluation"],runCavityGenerationInWorker,cancelActiveCavityGeneration}));
}

async function prepareSecondStoreCavity(second:StoreApi<SplitFaceState>){
 const canonicalPartGeometry=canonicalCube("m",k1);
 const s=second.getState();
 s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
 s.enterSelection();
 s.toggleFace("front");
 expect(await second.getState().createMoldParts("m",k1)).toBe(true);
 expect(await second.getState().createCavity(canonicalPartGeometry)).toBe(true);
}

describe("Default derived-runner ownership (Article 05/19)",()=>{
 it("two stores sharing one runner instance DO cancel each other's in-flight request (adversarial proof of why the single-owner boundary matters)",async()=>{
    const runner=sharedRunner();
  const first=makeStore(runner);
  const second=makeStore(runner);
  await prepareSecondStoreCavity(first);
  await prepareSecondStoreCavity(second);
  runner.defer();

  // Store A starts an active Sprue evaluation on the shared runner.
  expect(await first.getState().createSprue(placement(2))).toBe(true);
  await waitFor(()=>expect(runner.pending).toHaveLength(1));
  expect(first.getState().sprueStatus).toBe("generating");
  const firstRequestId=runner.pending[0]!.input.requestId;

  // Store B dispatches on the SAME runner: it necessarily supersedes A.
  expect(await second.getState().createSprue(placement(8))).toBe(true);
  await waitFor(()=>expect(runner.pending).toHaveLength(1));
  expect(runner.pending[0]!.input.requestId).not.toBe(firstRequestId);

  // A's request was cancelled under B: A's stale tail must be inert (no
  // commit, no error clobber) and its un-owned busy flag must clear.
  await waitFor(()=>expect(first.getState().sprueStatus).toBe("idle"));
  const firstAfter=first.getState();
  expect(firstAfter.evaluation.phase).toBe("evaluating");
  expect(firstAfter.sprues).toHaveLength(0);
  expect(firstAfter.sprueDefinitions).toHaveLength(1);
  expect(firstAfter.error).toBeNull();

  // B proceeds normally to its own commit.
  runner.resolveNext();
  await waitFor(()=>expect(second.getState().sprueStatus).toBe("idle"));
  expect(second.getState().sprues).toHaveLength(1);
  // A never committed its killed request.
  expect(first.getState().sprues).toHaveLength(0);
 });

 it("construction boundary: exactly one production site creates the store, and it is the singleton module itself",()=>{
  const srcDir=path.join(path.dirname(fileURLToPath(import.meta.url)),"..","..","..");
  expect(existsSync(srcDir)).toBe(true);
  const skipped=new Set(["node_modules",".tmp","dist"]);
  const productionFiles:string[]=[];
  const walk=(dir:string)=>{
   for(const entry of readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){if(!skipped.has(entry.name))walk(full);continue;}
    if(!/\.tsx?$/.test(entry.name))continue;
    // Tests and the E2E-only harness may create isolated stores; the
    // invariant is about PRODUCTION modules.
    if(/\.test\.tsx?$/.test(entry.name))continue;
    if(full.includes(`${path.sep}test-harness${path.sep}`))continue;
    if(readFileSync(full,"utf8").includes("createSplitFaceStoreCreator("))productionFiles.push(path.relative(srcDir,full));
   }
  };
  walk(srcDir);
  // The singleton in splitFace.store.ts is the ONLY production consumer of
  // the module-level default runner. Any second production store created
  // with default deps would share the module-level runner's single
  // cancellation slot (proven unsafe above) and must fail this test.
  expect(productionFiles).toEqual([path.join("features","mold-generation","split-face","splitFace.store.ts")]);
 });
});

