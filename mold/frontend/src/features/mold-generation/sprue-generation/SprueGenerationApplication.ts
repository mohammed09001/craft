import { SprueGenerationService } from "./SprueGenerationService";
import type {
  SprueApplicationSnapshot,
  SprueApplicationState,
  SprueFailure,
  SprueGenerationInput,
  SprueGenerationResult,
  SprueGenerationSuccess,
  SprueSourceBody,
} from "./sprueGeneration.contracts";

const staleFailure = (message: string): SprueFailure => ({
  status: "failure",
  reasonCode: "SPRUE_STALE_INPUT",
  message,
});

const snapshot = (state: SprueApplicationState): SprueApplicationSnapshot => ({
  revision: state.revision,
  bodies: state.bodies,
  lastSuccess: state.lastSuccess,
});

/** Non-visual transactional application boundary for later store or worker integration. */
export class SprueGenerationApplication {
  private stateValue: SprueApplicationState;

  constructor(
    revision: string,
    bodies: readonly SprueSourceBody[],
    private readonly service: Pick<SprueGenerationService, "generate"> = new SprueGenerationService(),
  ) {
    this.stateValue = {
      status: "idle",
      revision,
      bodies: [...bodies],
      lastSuccess: null,
      failure: null,
      undoStack: [],
      redoStack: [],
      committedOperationIds: [],
    };
  }

  get state(): SprueApplicationState {
    return this.stateValue;
  }

  async generate(input: SprueGenerationInput): Promise<SprueGenerationResult> {
    if (this.stateValue.status === "validating" || this.stateValue.status === "generating") {
      return {
        status: "failure",
        reasonCode: "SPRUE_GENERATION_IN_PROGRESS",
        message: "Another sprue generation request is already in progress.",
      };
    }
    if (this.stateValue.committedOperationIds.includes(input.request.operationId)) {
      return staleFailure("This sprue operation has already been committed.");
    }
    const currentVersions = new Map(this.stateValue.bodies.map((body) => [body.id, body.geometryVersion]));
    if (
      input.request.moldRevision !== this.stateValue.revision ||
      input.targetBodies.length !== this.stateValue.bodies.length ||
      input.targetBodies.some((body) => currentVersions.get(body.id) !== body.geometryVersion)
    ) {
      return staleFailure("The mold bodies changed before sprue generation.");
    }

    const before = snapshot(this.stateValue);
    this.stateValue = { ...this.stateValue, status: "validating", failure: null };
    await Promise.resolve();
    this.stateValue = { ...this.stateValue, status: "generating" };
    const result = await this.service.generate(input);
    if (result.status === "failure") {
      this.stateValue = { ...this.stateValue, status: "idle", failure: result };
      return result;
    }
    const stale = this.validateCommit(result);
    if (stale !== null) {
      this.stateValue = { ...this.stateValue, status: "idle", failure: stale };
      return stale;
    }

    const replacements = new Map(result.updatedBodies.map((body) => [body.id, body]));
    const bodies = this.stateValue.bodies.map((body) => replacements.get(body.id) ?? body);
    this.stateValue = {
      ...this.stateValue,
      status: "ready",
      revision: `${this.stateValue.revision}:sprue:${result.operationId}`,
      bodies,
      lastSuccess: result,
      failure: null,
      undoStack: [...this.stateValue.undoStack.slice(-49), before],
      redoStack: [],
      committedOperationIds: [...this.stateValue.committedOperationIds, result.operationId],
    };
    return result;
  }

  undo(): boolean {
    const previous = this.stateValue.undoStack.at(-1);
    if (!previous) return false;
    const current = snapshot(this.stateValue);
    this.stateValue = {
      ...this.stateValue,
      ...previous,
      status: "idle",
      failure: null,
      undoStack: this.stateValue.undoStack.slice(0, -1),
      redoStack: [current, ...this.stateValue.redoStack].slice(0, 50),
    };
    return true;
  }

  redo(): boolean {
    const next = this.stateValue.redoStack[0];
    if (!next) return false;
    const current = snapshot(this.stateValue);
    this.stateValue = {
      ...this.stateValue,
      ...next,
      status: "ready",
      failure: null,
      undoStack: [...this.stateValue.undoStack.slice(-49), current],
      redoStack: this.stateValue.redoStack.slice(1),
    };
    return true;
  }

  private validateCommit(result: SprueGenerationSuccess): SprueFailure | null {
    const currentVersions = new Map(this.stateValue.bodies.map((body) => [body.id, body.geometryVersion]));
    if (
      this.stateValue.revision !== result.sourceRevision ||
      result.beforeBodies.some((body) => currentVersions.get(body.id) !== body.geometryVersion) ||
      this.stateValue.committedOperationIds.includes(result.operationId)
    ) {
      return staleFailure("The mold bodies changed while the sprue was generating.");
    }
    return null;
  }
}
