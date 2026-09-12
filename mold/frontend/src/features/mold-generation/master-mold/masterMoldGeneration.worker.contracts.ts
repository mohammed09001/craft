import type { MasterMoldRequest, MasterMoldResult } from "./masterMold.contracts";

export interface MasterMoldWorkerFailure {
  readonly code: string;
  readonly message: string;
}

export type MasterMoldWorkerRequest =
  | { readonly type: "generate"; readonly requestId: string; readonly request: MasterMoldRequest }
  | { readonly type: "cancel"; readonly requestId: string };

export type MasterMoldWorkerResponse =
  | { readonly type: "progress"; readonly requestId: string; readonly completed: number; readonly total: number }
  | { readonly type: "success"; readonly requestId: string; readonly result: MasterMoldResult }
  | { readonly type: "failure"; readonly requestId: string; readonly failure: MasterMoldWorkerFailure };
