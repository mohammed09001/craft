import type {
  CavityQualityMode,
  CavityToolData,
  WatertightPartSolid,
} from "./cavityGeneration.contracts";
import {
  createDistanceFieldCavityTool,
} from "./cavityDistanceField.engine";
import type { DistanceFieldQualityProfile } from "./cavityDistanceField.profile";
import {
  selectCavityOffsetEngineForPreparedSolid,
  type CavityEngineDecision,
  type CavityOffsetEngineKind,
} from "./cavityEngine.selector";
import {
  createCavityTool,
} from "./manifold.engine";

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
):Promise<AutomaticCavityOffsetResult> {
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
