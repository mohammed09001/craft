import type { CavityGenerationInput, CavityGenerationResult, CavityIssue } from "./cavityGeneration.contracts";
import type { CavityProgressStage, CavityWorkerFailure, CavityWorkerRequest, CavityWorkerResponse } from "./cavityGeneration.worker.contracts";
type CavityWorkerLike={onmessage:((event:MessageEvent<CavityWorkerResponse>)=>void)|null;onerror:((event:ErrorEvent)=>void)|null;onmessageerror:((event:MessageEvent<unknown>)=>void)|null;postMessage:(message:CavityWorkerRequest)=>void;terminate:()=>void};
export type CavityWorkerFactory=()=>CavityWorkerLike;
export type CavityWorkerExecutionResult={readonly result:CavityGenerationResult;readonly validationWarnings:readonly CavityIssue[]};
export interface CavityWorkerRunOptions {readonly onProgress?:(stage:CavityProgressStage,progress:number)=>void;readonly signal?:AbortSignal}
export class CavityWorkerError extends Error {readonly code:string;readonly stage:CavityWorkerFailure["stage"];readonly diagnostics:Record<string,unknown>|undefined;constructor(failure:CavityWorkerFailure){super(failure.message);this.name="CavityWorkerError";this.code=failure.code;this.stage=failure.stage;this.diagnostics=failure.diagnostics;}}
const createBrowserWorker:CavityWorkerFactory=()=>new Worker(new URL("./cavityGeneration.worker.ts",import.meta.url),{type:"module"});
export const DEFAULT_CAVITY_WORKER_TIMEOUT_MS=180_000;
export function createCavityWorkerRunner(createWorker:CavityWorkerFactory=createBrowserWorker,timeoutMs=DEFAULT_CAVITY_WORKER_TIMEOUT_MS){
  let cancelActive:(reason?:string)=>void=()=>undefined;
  const run=(input:CavityGenerationInput,options:CavityWorkerRunOptions={}):Promise<CavityWorkerExecutionResult>=>{
    cancelActive("A newer cavity generation request replaced this request.");
    // The Worker-less fallback pulls in the whole manifold-3d/three.js-BVH
    // cavity-generation engine transitively (see cavityGeneration.evaluate.ts).
    // A dynamic import keeps that entire engine out of the eagerly-loaded
    // main bundle -- every real browser has `Worker`, so this branch exists
    // only for environments that genuinely lack it (this module's own test
    // suite exercises it directly), never the normal runtime path.
    if(createWorker===createBrowserWorker&&typeof Worker==="undefined")return import("./cavityGeneration.evaluate").then(({evaluateCavityGeneration})=>evaluateCavityGeneration(input,options));
    const worker=createWorker();const requestId=`${input.operationId}:${input.generationVersion}`;
    return new Promise((resolve,reject)=>{let settled=false;let timeoutHandle:ReturnType<typeof setTimeout>|null=null;
      const finish=(action:()=>void)=>{if(settled)return;settled=true;if(timeoutHandle!==null)clearTimeout(timeoutHandle);options.signal?.removeEventListener("abort",abort);worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();if(cancelActive===cancel)cancelActive=()=>undefined;action();};
      const cancel=(reason="Cavity generation was cancelled.")=>{if(settled)return;worker.postMessage({type:"cancel",requestId});finish(()=>reject(new CavityWorkerError({code:"cavity_cancelled",stage:"cancelled",message:reason})));};
      const abort=()=>cancel();cancelActive=cancel;options.signal?.addEventListener("abort",abort,{once:true});if(options.signal?.aborted){abort();return;}
      timeoutHandle=setTimeout(()=>finish(()=>reject(new CavityWorkerError({code:"cavity_timeout",stage:"timeout",message:`Cavity generation exceeded ${timeoutMs} ms. The uploaded model is too complex for the current clearance method.`,diagnostics:{timeoutMs}}))),timeoutMs);
      worker.onmessage=event=>{const response=event.data;if(response.requestId!==requestId)return;if(response.type==="progress"){options.onProgress?.(response.stage,response.progress);return;}if(response.type==="success"){finish(()=>resolve({result:response.result,validationWarnings:response.validationWarnings}));return;}finish(()=>reject(new CavityWorkerError(response.failure)));};
      worker.onerror=event=>finish(()=>reject(new CavityWorkerError({code:"cavity_worker_error",stage:"input",message:event.message||"Cavity Worker execution failed."})));
      worker.onmessageerror=()=>finish(()=>reject(new CavityWorkerError({code:"cavity_worker_message_error",stage:"input",message:"Cavity Worker returned an unreadable response."})));
      worker.postMessage({type:"generate",requestId,input});
    });
  };
  return Object.assign(run,{cancel:(reason?:string)=>cancelActive(reason)});
}
export const runCavityGenerationInWorker=createCavityWorkerRunner();
export const cancelActiveCavityGeneration=(reason?:string)=>runCavityGenerationInWorker.cancel(reason);
