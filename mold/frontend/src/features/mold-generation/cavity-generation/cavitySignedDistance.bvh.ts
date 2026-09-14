import { Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import type {
  WatertightPartSolid,
} from "./cavityGeneration.contracts";
import { buildMeshGeometry, classifyPointInside } from "../geometry/meshBvh";

export interface CavitySignedDistanceField {
  readonly triangleCount:number;
  readonly signedDistance:(point:readonly [number,number,number])=>number;
  readonly dispose:()=>void;
}

const DEFAULT_SURFACE_EPSILON_MM=1e-7;

export function createCavitySignedDistanceField(
  prepared:WatertightPartSolid,
  surfaceEpsilonMm=DEFAULT_SURFACE_EPSILON_MM,
):CavitySignedDistanceField {
  if(
    !prepared.watertight||
    !prepared.manifold
  ){
    throw new Error(
      "Signed-distance generation requires a watertight manifold.",
    );
  }

  if(
    !Number.isFinite(surfaceEpsilonMm)||
    surfaceEpsilonMm<=0
  ){
    throw new Error(
      "Signed-distance surface epsilon must be positive.",
    );
  }

  const geometry=buildMeshGeometry(
    prepared.mesh,
  );

  const bvh=new MeshBVH(geometry);

  const queryPoint=new Vector3();

  const signedDistance=(
    point:readonly [number,number,number],
  ):number=>{
    if(
      point.length!==3||
      !point.every(Number.isFinite)
    ){
      throw new Error(
        "Signed-distance query point is invalid.",
      );
    }

    queryPoint.set(
      point[0],
      point[1],
      point[2],
    );

    const closest=bvh.closestPointToPoint(
      queryPoint,
    );

    if(
      closest===null||
      !Number.isFinite(closest.distance)
    ){
      throw new Error(
        "BVH closest-point query failed.",
      );
    }

    if(closest.distance<=surfaceEpsilonMm){
      return 0;
    }

    const isInside=
      classifyPointInside(
        bvh,
        queryPoint,
      );

    // Manifold.levelSet retains the region where the field is
    // greater than or equal to the requested level.
    // Therefore solid material must be positive inside.
    return isInside
      ?closest.distance
      :-closest.distance;
  };

  let disposed=false;

  return {
    triangleCount:
      prepared.mesh.indices.length/3,

    signedDistance,

    dispose:()=>{
      if(disposed){
        return;
      }

      disposed=true;
      geometry.dispose();
    },
  };
}



