import type {
  SegmentationExecutionRequest,
  SegmentationExecutionResult,
} from "./segmentationExecution.contracts";

export type SegmentationExecutionWorkerRequest =
  | {
      readonly type: "execute";
      readonly requestId: string;
      readonly request: SegmentationExecutionRequest;
    }
  | { readonly type: "cancel"; readonly requestId: string };

export interface SegmentationExecutionWorkerFailure {
  readonly code: "execution_cancelled" | "worker_error" | "worker_timeout";
  readonly message: string;
}

export type SegmentationExecutionWorkerResponse =
  | {
      readonly type: "success";
      readonly requestId: string;
      readonly result: SegmentationExecutionResult;
    }
  | {
      readonly type: "failure";
      readonly requestId: string;
      readonly failure: SegmentationExecutionWorkerFailure;
    };

