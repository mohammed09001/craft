import { evaluateCavityGeneration } from "./cavityGeneration.evaluate";
import type { CavityFailureStage, CavityWorkerFailure, CavityWorkerRequest, CavityWorkerResponse } from "./cavityGeneration.worker.contracts";

type CavityWorkerScope={onmessage:((event:MessageEvent<CavityWorkerRequest>)=>void)|null;postMessage:(message:CavityWorkerResponse)=>void};
const workerScope=self as unknown as CavityWorkerScope;
const controllers=new Map<string,AbortController>();
const failure=(error:unknown,stage:CavityFailureStage):CavityWorkerFailure=>({code:error instanceof Error&&"code" in error?String(error.code):`cavity_${stage}_failed`,stage,message:error instanceof Error?error.message:"Cavity generation failed."});

async function processCavityRequest(request:Extract<CavityWorkerRequest,{type:"generate"}>):Promise<void>{
  const controller=new AbortController();
  controllers.set(request.requestId,controller);
  try{
    const {result,validationWarnings}=await evaluateCavityGeneration(request.input,{signal:controller.signal,onProgress:(stage,progress)=>workerScope.postMessage({type:"progress",requestId:request.requestId,stage,progress})});
    workerScope.postMessage({type:"success",requestId:request.requestId,result,validationWarnings});
  }catch(error){
    const stage=error instanceof Error&&"stage" in error?error.stage as CavityFailureStage:"validation";
    workerScope.postMessage({type:"failure",requestId:request.requestId,failure:failure(error,stage)});
  }finally{controllers.delete(request.requestId);}
}
workerScope.onmessage=event=>{const request=event.data;if(request.type==="cancel"){controllers.get(request.requestId)?.abort();return;}void processCavityRequest(request);};
