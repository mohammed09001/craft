import { validateAndPreparePartSolid } from "./partSolid.validator";
import { generateCavityBodies } from "./cavityBody.generator";
import { createAutomaticCavityTool } from "./cavityOffset.orchestrator";
import type { CavityGenerationInput } from "./cavityGeneration.contracts";
import type { CavityFailureStage, CavityProgressStage, CavityWorkerFailure } from "./cavityGeneration.worker.contracts";
import type { CavityWorkerExecutionResult } from "./cavityGeneration.workerClient";

export interface CavityGenerationEvaluationOptions {readonly onProgress?:(stage:CavityProgressStage,progress:number)=>void;readonly signal?:AbortSignal}

const failure=(error:unknown,stage:CavityFailureStage):CavityWorkerFailure=>({code:error instanceof Error&&"code" in error?String(error.code):`cavity_${stage}_failed`,stage,message:error instanceof Error?error.message:"Cavity generation failed."});

/**
 * The same cavity-generation pipeline `cavityGeneration.worker.ts` runs inside a dedicated Worker,
 * callable directly so `cavityGeneration.workerClient.ts` can fall back to it in environments without
 * Worker support (mirrors `evaluateDerivedMold`'s role for the derived-mold-evaluation Worker/client
 * pair) instead of throwing "Worker is not defined".
 */
export async function evaluateCavityGeneration(input:CavityGenerationInput,options:CavityGenerationEvaluationOptions={}):Promise<CavityWorkerExecutionResult>{
  const totalStarted=performance.now();
  let validationMs:number,offsetMs:number,booleanMs:number;
  let stage:CavityFailureStage="validation";
  const assertNotCancelled=()=>{if(options.signal?.aborted)throw Object.assign(new Error("Cavity generation was cancelled."),{code:"cavity_cancelled"});};
  try{
    options.onProgress?.("validating",0.05);
    const validationStarted=performance.now();
    const validation=validateAndPreparePartSolid(input);
    validationMs=performance.now()-validationStarted;
    if(!validation.ok||validation.prepared===null)throw Object.assign(new Error(validation.blockers[0]?.message??"Uploaded model is not a subtractable solid."),{code:validation.blockers[0]?.reasonCode??"a3_invalid"});
    assertNotCancelled();
    stage="offset";
    options.onProgress?.("auditing",0.2);
    options.onProgress?.("building-offset",0.3);
    const offsetStarted=performance.now();
    const offset=await createAutomaticCavityTool(validation.prepared,input.cavityClearanceMm,input.qualityMode,input.tolerancePolicy.booleanToleranceMm);
    offsetMs=performance.now()-offsetStarted;
    assertNotCancelled();
    stage="boolean";
    options.onProgress?.("subtracting-body",0.65);
    const booleanStarted=performance.now();
    const generated=await generateCavityBodies(input,offset.tool);
    booleanMs=performance.now()-booleanStarted;
    const {subtractionDiagnostics,...generatedResult}=generated;
    if(subtractionDiagnostics===undefined||subtractionDiagnostics.affectedBodyCount<1||subtractionDiagnostics.removedVolumeMm3<=input.tolerancePolicy.affectedVolumeToleranceMm3)throw Object.assign(new Error("The cavity tool did not intersect any mold material. Verify mold-body construction and coordinate alignment."),{code:"cavity_no_material_intersection"});
    assertNotCancelled();
    options.onProgress?.("validating-results",0.9);
    const result={...generatedResult,diagnostics:{selectedEngine:offset.decision.engine,engineReasonCodes:offset.decision.reasonCodes,attempts:offset.attempts,usedFallback:offset.usedFallback,timings:{validationMs,auditMs:0,offsetMs,booleanMs,totalMs:performance.now()-totalStarted},...(offset.distanceFieldProfile?{distanceFieldProfile:offset.distanceFieldProfile}:{}),tolerancePolicy:input.tolerancePolicy,subtraction:subtractionDiagnostics}};
    options.onProgress?.("complete",1);
    return {result,validationWarnings:validation.warnings};
  }catch(error){
    const resolvedStage=options.signal?.aborted?"cancelled":stage;
    const {code,message}=failure(error,resolvedStage);
    throw Object.assign(new Error(message),{code,stage:resolvedStage});
  }
}
