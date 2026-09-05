import type {
  CavityQualityMode,
  CavityToolData,
  WatertightPartSolid,
} from "./cavityGeneration.contracts";
import {
  buildDistanceFieldQualityProfile,
  type DistanceFieldQualityProfile,
} from "./cavityDistanceField.profile";
import {
  createCavitySignedDistanceField,
} from "./cavitySignedDistance.bvh";
import {
  boundsFromManifold,
  getManifoldModule,
  payloadFromManifold,
} from "./manifold.engine";

export interface DistanceFieldCavityToolResult {
  readonly tool:CavityToolData;
  readonly profile:DistanceFieldQualityProfile;
}

function assertDistanceFieldSolid(
  solid:{
    status:()=>string;
    isEmpty:()=>boolean;
  },
):void {
  const status=solid.status();

  if(status!=="NoError"){
    throw new Error(
      `Distance-field cavity generation failed: ${status}.`,
    );
  }

  if(solid.isEmpty()){
    throw new Error(
      "Distance-field cavity generation produced an empty solid.",
    );
  }
}

export async function createDistanceFieldCavityTool(
  prepared:WatertightPartSolid,
  clearanceMm:number,
  qualityMode:CavityQualityMode,
  geometryToleranceMm:number,
):Promise<DistanceFieldCavityToolResult> {
  if(
    !Number.isFinite(clearanceMm)||
    clearanceMm<=0
  ){
    throw new Error(
      "Distance-field cavity clearance must be positive.",
    );
  }

  const profile=
    buildDistanceFieldQualityProfile(
      prepared,
      clearanceMm,
      qualityMode,
      geometryToleranceMm,
    );

  if(profile.exceedsGridBudget){
    const dimensions=
      profile.estimatedGridDimensions.join("×");

    throw new Error(
      `Distance-field grid exceeds the safe budget: ${dimensions} cells (${profile.estimatedGridCellCount} total, maximum ${profile.maximumGridCellCount}).`,
    );
  }

  const field=
    createCavitySignedDistanceField(
      prepared,
      geometryToleranceMm,
    );

  const module=await getManifoldModule();

  let levelSetSolid:
    InstanceType<typeof module.Manifold>|
    null=null;

  try{
    levelSetSolid=module.Manifold.levelSet(
      point=>
        field.signedDistance([
          point[0],
          point[1],
          point[2],
        ]),
      {
        min:[
          profile.bounds.min[0],
          profile.bounds.min[1],
          profile.bounds.min[2],
        ],
        max:[
          profile.bounds.max[0],
          profile.bounds.max[1],
          profile.bounds.max[2],
        ],
      },
      profile.effectiveEdgeLengthMm,

      // The SDF is negative inside and positive outside.
      // Manifold levelSet uses a negative level for an outset.
      -clearanceMm,

      profile.surfaceToleranceMm,
    );

    assertDistanceFieldSolid(levelSetSolid);

    const components=levelSetSolid.decompose();
    const connectedComponentCount=components.length;

    for(const component of components){
      component.delete();
    }

    const mesh=payloadFromManifold(
      levelSetSolid,
    );

    const volumeMm3=levelSetSolid.volume();
    const triangleCount=levelSetSolid.numTri();

    if(
      !Number.isFinite(volumeMm3)||
      volumeMm3<=0
    ){
      throw new Error(
        "Distance-field cavity generation produced invalid volume.",
      );
    }

    if(
      !Number.isFinite(triangleCount)||
      triangleCount<=0
    ){
      throw new Error(
        "Distance-field cavity generation produced no triangles.",
      );
    }

    return {
      profile,

      tool:{
        mesh,
        bounds:boundsFromManifold(
          levelSetSolid,
        ),
        volumeMm3,
        triangleCount,
        connectedComponentCount,
        watertight:true,
        manifold:true,
        warnings:[
          ...prepared.warnings,
        ],
        clearanceMm,
        implementationMethod:
          "manifold-level-set-sdf",
        qualityMode,
      },
    };
  }finally{
    if(levelSetSolid!==null){
      levelSetSolid.delete();
    }

    field.dispose();
  }
}



