import ManifoldModule from "manifold-3d";
import type { CavityQualityMode, CavityToolData, WatertightPartSolid } from "./cavityGeneration.contracts";
import { boundsFromManifold, getManifoldModule, manifoldFromPayload, payloadFromManifold } from "../geometry/manifold";

// Execution 05 Article 04: Manifold/WASM primitives are neutral geometry
// (`../geometry/manifold`); Cavity keeps only its own clearance/tool policy.
export { boundsFromManifold, getManifoldModule, manifoldFromPayload, payloadFromManifold };

type Module=Awaited<ReturnType<typeof ManifoldModule>>;
type Solid=InstanceType<Module["Manifold"]>;
function assertStatus(solid:Solid,operation:string){const status=solid.status();if(status!=="NoError")throw new Error(`${operation} failed: ${status}.`);}

export const DIRECT_CLEARANCE_TRIANGLE_LIMIT=50_000;

export interface AdaptiveClearancePolicy {
  readonly simplify:boolean;
  readonly simplificationToleranceMm:number;
  readonly sphereSegments:number;
}

export function buildAdaptiveClearancePolicy(
  triangleCount:number,
  clearanceMm:number,
  geometryToleranceMm:number,
  qualityMode:CavityQualityMode="standard",
):AdaptiveClearancePolicy {
  if(
    !Number.isFinite(triangleCount)||
    triangleCount<0||
    !Number.isFinite(clearanceMm)||
    clearanceMm<0||
    !Number.isFinite(geometryToleranceMm)||
    geometryToleranceMm<=0
  ){
    throw new Error("Adaptive cavity-clearance inputs are invalid.");
  }

  if(clearanceMm===0||triangleCount<=DIRECT_CLEARANCE_TRIANGLE_LIMIT){
    return {
      simplify:false,
      simplificationToleranceMm:geometryToleranceMm,
      sphereSegments:
        qualityMode==="high"
          ?32
          :16,
    };
  }

  return {
    simplify:true,
    simplificationToleranceMm:Math.max(
      geometryToleranceMm,
      clearanceMm*(
        qualityMode==="high"
          ?0.2
          :0.5
      ),
    ),
    sphereSegments:
      qualityMode==="high"
        ?16
        :8,
  };
}
export async function createCavityTool(prepared:WatertightPartSolid,clearanceMm:number,qualityMode:CavityQualityMode,tolerance:number):Promise<CavityToolData>{
  if(!Number.isFinite(clearanceMm)||clearanceMm<0)throw new Error("Cavity clearance must be a non-negative millimeter value.");

  const module=await getManifoldModule();
  const source=manifoldFromPayload(module,prepared.mesh,tolerance);
  const policy=buildAdaptiveClearancePolicy(
    prepared.triangleCount,
    clearanceMm,
    tolerance,
    qualityMode,
  );

  let clearanceSource=source;
  let tool=source;

  try{
    if(clearanceMm>0){
      if(policy.simplify){
        clearanceSource=source.simplify(
          policy.simplificationToleranceMm,
        );
        assertStatus(
          clearanceSource,
          "Cavity clearance simplification",
        );

        if(clearanceSource.isEmpty()){
          throw new Error(
            "Cavity clearance simplification produced an empty solid.",
          );
        }
      }

      const segments=policy.sphereSegments;
      const sphere=module.Manifold.sphere(
        clearanceMm,
        segments,
      );

      try{
        tool=clearanceSource.minkowskiSum(sphere);
        assertStatus(tool,"Cavity offset");
      }finally{
        sphere.delete();
      }
    }

    const mesh=payloadFromManifold(tool);

    return {
      ...prepared,
      mesh,
      bounds:boundsFromManifold(tool),
      volumeMm3:tool.volume(),
      triangleCount:tool.numTri(),
      clearanceMm,
      implementationMethod:
        clearanceMm===0
          ?"exact-watertight-part-solid"
          :"manifold-minkowski-sphere",
      qualityMode,
    };
  }finally{
    if(tool!==source&&tool!==clearanceSource){
      tool.delete();
    }

    if(clearanceSource!==source){
      clearanceSource.delete();
    }

    source.delete();
  }
}
