import type { CavityGenerationInput, CavityGenerationResult, CavityIssue } from "./cavityGeneration.contracts";

export type CavityProgressStage="validating"|"auditing"|"building-offset"|"building-distance-field"|"subtracting-body"|"decomposing-results"|"validating-results"|"complete";
export type CavityFailureStage="input"|"validation"|"audit"|"offset-selection"|"offset"|"containment"|"boolean"|"decomposition"|"result-validation"|"timeout"|"cancelled";
export interface CavityWorkerFailure {readonly code:string;readonly stage:CavityFailureStage;readonly message:string;readonly bodyId?:string;readonly engine?:string;readonly diagnostics?:Record<string,unknown>}
export type CavityWorkerRequest=
  |{readonly type:"generate";readonly requestId:string;readonly input:CavityGenerationInput}
  |{readonly type:"cancel";readonly requestId:string};
export type CavityWorkerProgressResponse={readonly type:"progress";readonly requestId:string;readonly stage:CavityProgressStage;readonly progress:number};
export type CavityWorkerSuccessResponse={readonly type:"success";readonly requestId:string;readonly result:CavityGenerationResult;readonly validationWarnings:readonly CavityIssue[]};
export type CavityWorkerFailureResponse={readonly type:"failure";readonly requestId:string;readonly failure:CavityWorkerFailure};
export type CavityWorkerResponse=CavityWorkerProgressResponse|CavityWorkerSuccessResponse|CavityWorkerFailureResponse;
