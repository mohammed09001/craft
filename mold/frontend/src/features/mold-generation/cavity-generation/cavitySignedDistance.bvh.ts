import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Ray,
  Uint32BufferAttribute,
  Vector3,
} from "three";
import { MeshBVH } from "three-mesh-bvh";

import type {
  MoldMeshPayload,
} from "../reference-mold-definition/orthogonalMold";
import type {
  WatertightPartSolid,
} from "./cavityGeneration.contracts";

export interface CavitySignedDistanceField {
  readonly triangleCount:number;
  readonly signedDistance:(point:readonly [number,number,number])=>number;
  readonly dispose:()=>void;
}

const DEFAULT_SURFACE_EPSILON_MM=1e-7;
export const RAY_INTERSECTION_EPSILON_MM=1e-7;

export const rayDirections=Object.freeze([
  new Vector3(
    1,
    Math.SQRT1_2,
    Math.sqrt(3)/3,
  ).normalize(),

  new Vector3(
    Math.sqrt(2)/5,
    1,
    Math.sqrt(5)/7,
  ).normalize(),

  new Vector3(
    Math.sqrt(7)/9,
    Math.sqrt(3)/4,
    1,
  ).normalize(),
]);

export function buildGeometry(
  mesh:MoldMeshPayload,
):BufferGeometry {
  if(
    mesh.positions.length%3!==0||
    mesh.indices.length%3!==0
  ){
    throw new Error(
      "Signed-distance mesh payload is malformed.",
    );
  }

  if(
    mesh.positions.length===0||
    mesh.indices.length===0
  ){
    throw new Error(
      "Signed-distance mesh payload is empty.",
    );
  }

  const geometry=new BufferGeometry();

  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      mesh.positions,
      3,
    ),
  );

  geometry.setIndex(
    new Uint32BufferAttribute(
      mesh.indices,
      1,
    ),
  );

  return geometry;
}

export function countUniqueForwardIntersections(
  bvh:MeshBVH,
  origin:Vector3,
  direction:Vector3,
):number {
  const ray=new Ray(
    origin,
    direction,
  );

  const intersections=bvh
    .raycast(
      ray,
      DoubleSide,
      RAY_INTERSECTION_EPSILON_MM,
      Infinity,
    )
    .map(intersection=>intersection.distance)
    .filter(
      distance=>
        Number.isFinite(distance)&&
        distance>RAY_INTERSECTION_EPSILON_MM,
    )
    .sort((left,right)=>left-right);

  let uniqueCount=0;
  let previousDistance=-Infinity;

  for(const distance of intersections){
    if(
      distance-previousDistance>
        RAY_INTERSECTION_EPSILON_MM
    ){
      uniqueCount+=1;
      previousDistance=distance;
    }
  }

  return uniqueCount;
}

export function classifyPointInside(
  bvh:MeshBVH,
  point:Vector3,
):boolean {
  let insideVotes=0;

  for(const direction of rayDirections){
    const intersectionCount=
      countUniqueForwardIntersections(
        bvh,
        point,
        direction,
      );

    if(intersectionCount%2===1){
      insideVotes+=1;
    }
  }

  return insideVotes>
    rayDirections.length/2;
}

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

  const geometry=buildGeometry(
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



