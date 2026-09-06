import type {
  CavityQualityMode,
  CavityToolData,
  WatertightPartSolid,
} from "./cavityGeneration.contracts";
import {
  createDistanceFieldCavityTool as defaultCreateDistanceFieldCavityTool,
} from "./cavityDistanceField.engine";
import type { DistanceFieldQualityProfile } from "./cavityDistanceField.profile";
import {
  selectCavityOffsetEngineForPreparedSolid,
  type CavityEngineDecision,
  type CavityOffsetEngineKind,
} from "./cavityEngine.selector";
import {
  createCavityTool as defaultCreateCavityTool,
} from "./manifold.engine";

/**
 * Injectable engine seam, matching the dependency-injection convention
 * already used elsewhere for worker-backed engines (see
 * SplitFaceStoreDeps/createSplitFaceStoreCreator). `createCavityTool`
 * transitively loads the real `manifold-3d` WASM module -- statically
 * `vi.mock`-ing that module from a test does not reliably intercept this
 * orchestrator's own binding to it, so a caller that needs a deterministic
 * direct-Minkowski failure (for fallback regression coverage) must inject a
 * stub here instead of relying on module mocking.
 */
export interface CavityOffsetEngineDeps {
  readonly createCavityTool:typeof defaultCreateCavityTool;
  readonly createDistanceFieldCavityTool:typeof defaultCreateDistanceFieldCavityTool;
}
const defaultCavityOffsetEngineDeps:CavityOffsetEngineDeps={
  createCavityTool:defaultCreateCavityTool,
  createDistanceFieldCavityTool:defaultCreateDistanceFieldCavityTool,
};

export interface CavityOffsetAttempt {
  readonly engine:CavityOffsetEngineKind;
  readonly status:"succeeded"|"failed";
  readonly errorMessage:string|null;
}

export interface AutomaticCavityOffsetResult {
  readonly tool:CavityToolData;
  readonly decision:CavityEngineDecision;
  readonly attempts:readonly CavityOffsetAttempt[];
  readonly usedFallback:boolean;
  readonly distanceFieldProfile?:DistanceFieldQualityProfile;
}

function errorMessage(error:unknown):string {
  return error instanceof Error
    ?error.message
    :String(error);
}

export async function createAutomaticCavityTool(
  prepared:WatertightPartSolid,
  clearanceMm:number,
  qualityMode:CavityQualityMode,
  geometryToleranceMm:number,
  deps:CavityOffsetEngineDeps=defaultCavityOffsetEngineDeps,
):Promise<AutomaticCavityOffsetResult> {
  const {createCavityTool,createDistanceFieldCavityTool}=deps;
  if(
    !Number.isFinite(geometryToleranceMm)||
    geometryToleranceMm<=0
  ){
    throw new Error(
      "Automatic cavity geometry tolerance must be positive.",
    );
  }

  const decision=
    selectCavityOffsetEngineForPreparedSolid(
      prepared,
      clearanceMm,
      qualityMode,
    );

  const attempts:CavityOffsetAttempt[]=[];

  if(
    decision.engine==="exact-zero-clearance"
  ){
    const tool=await createCavityTool(
      prepared,
      clearanceMm,
      qualityMode,
      geometryToleranceMm,
    );

    attempts.push({
      engine:"exact-zero-clearance",
      status:"succeeded",
      errorMessage:null,
    });

    return {
      tool,
      decision,
      attempts,
      usedFallback:false,
    };
  }

  if(decision.engine==="distance-field"){
    const result=
      await createDistanceFieldCavityTool(
        prepared,
        clearanceMm,
        qualityMode,
        geometryToleranceMm,
      );

    attempts.push({
      engine:"distance-field",
      status:"succeeded",
      errorMessage:null,
    });

    return {
      tool:result.tool,
      decision,
      attempts,
      usedFallback:false,
      distanceFieldProfile:result.profile,
    };
  }

  try{
    const tool=await createCavityTool(
      prepared,
      clearanceMm,
      qualityMode,
      geometryToleranceMm,
    );

    attempts.push({
      engine:"direct-minkowski",
      status:"succeeded",
      errorMessage:null,
    });

    return {
      tool,
      decision,
      attempts,
      usedFallback:false,
    };
  }catch(error){
    attempts.push({
      engine:"direct-minkowski",
      status:"failed",
      errorMessage:errorMessage(error),
    });
  }

  const fallback=
    await createDistanceFieldCavityTool(
      prepared,
      clearanceMm,
      qualityMode,
      geometryToleranceMm,
    );

  attempts.push({
    engine:"distance-field",
    status:"succeeded",
    errorMessage:null,
  });

  return {
    tool:fallback.tool,
    decision,
    attempts,
    usedFallback:true,
    distanceFieldProfile:fallback.profile,
  };
}
