import { validateAndPreparePartSolid } from "./partSolid.validator";
import { generateCavityBodies } from "./cavityBody.generator";
import { createAutomaticCavityTool } from "./cavityOffset.orchestrator";
import type { CavityFailureStage, CavityProgressStage, CavityWorkerFailure, CavityWorkerRequest, CavityWorkerResponse } from "./cavityGeneration.worker.contracts";

type CavityWorkerScope={onmessage:((event:MessageEvent<CavityWorkerRequest>)=>void)|null;postMessage:(message:CavityWorkerResponse)=>void};
const workerScope=self as unknown as CavityWorkerScope;
const cancelledRequests=new Set<string>();
const progress=(requestId:string,stage:CavityProgressStage,value:number)=>workerScope.postMessage({type:"progress",requestId,stage,progress:value});
const failure=(error:unknown,stage:CavityFailureStage):CavityWorkerFailure=>({code:error instanceof Error&&"code" in error?String(error.code):`cavity_${stage}_failed`,stage,message:error instanceof Error?error.message:"Cavity generation failed."});
function assertNotCancelled(requestId:string){if(cancelledRequests.has(requestId)){const error=new Error("Cavity generation was cancelled.");Object.assign(error,{code:"cavity_cancelled"});throw error;}}

async function processCavityRequest(request:Extract<CavityWorkerRequest,{type:"generate"}>):Promise<void>{
  const totalStarted=performance.now();let validationMs:number,offsetMs:number,booleanMs:number;let stage:CavityFailureStage="validation";
  try{
    progress(request.requestId,"validating",0.05);const validationStarted=performance.now();const validation=validateAndPreparePartSolid(request.input);validationMs=performance.now()-validationStarted;
    if(!validation.ok||validation.prepared===null)throw Object.assign(new Error(validation.blockers[0]?.message??"Uploaded model is not a subtractable solid."),{code:validation.blockers[0]?.reasonCode??"a3_invalid"});
    assertNotCancelled(request.requestId);stage="offset";progress(request.requestId,"auditing",0.2);progress(request.requestId,"building-offset",0.3);
    const offsetStarted=performance.now();const offset=await createAutomaticCavityTool(validation.prepared,request.input.cavityClearanceMm,request.input.qualityMode,request.input.tolerancePolicy.booleanToleranceMm);offsetMs=performance.now()-offsetStarted;
    assertNotCancelled(request.requestId);stage="boolean";progress(request.requestId,"subtracting-body",0.65);const booleanStarted=performance.now();const generated=await generateCavityBodies(request.input,offset.tool);booleanMs=performance.now()-booleanStarted;
    const {subtractionDiagnostics,...generatedResult}=generated;if(subtractionDiagnostics===undefined||subtractionDiagnostics.affectedBodyCount<1||subtractionDiagnostics.removedVolumeMm3<=request.input.tolerancePolicy.affectedVolumeToleranceMm3)throw Object.assign(new Error("The cavity tool did not intersect any mold material. Verify mold-body construction and coordinate alignment."),{code:"cavity_no_material_intersection"});
    assertNotCancelled(request.requestId);progress(request.requestId,"validating-results",0.9);const result={...generatedResult,diagnostics:{selectedEngine:offset.decision.engine,engineReasonCodes:offset.decision.reasonCodes,attempts:offset.attempts,usedFallback:offset.usedFallback,timings:{validationMs,auditMs:0,offsetMs,booleanMs,totalMs:performance.now()-totalStarted},...(offset.distanceFieldProfile?{distanceFieldProfile:offset.distanceFieldProfile}:{}),tolerancePolicy:request.input.tolerancePolicy,subtraction:subtractionDiagnostics}};
    progress(request.requestId,"complete",1);workerScope.postMessage({type:"success",requestId:request.requestId,result,validationWarnings:validation.warnings});
  }catch(error){const resolvedStage=cancelledRequests.has(request.requestId)?"cancelled":stage;workerScope.postMessage({type:"failure",requestId:request.requestId,failure:failure(error,resolvedStage)});
  }finally{cancelledRequests.delete(request.requestId);}
}
workerScope.onmessage=event=>{const request=event.data;if(request.type==="cancel"){cancelledRequests.add(request.requestId);return;}void processCavityRequest(request);};
