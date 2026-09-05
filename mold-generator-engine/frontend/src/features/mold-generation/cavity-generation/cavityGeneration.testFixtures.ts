import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { CanonicalPartGeometry } from "./cavityGeneration.contracts";
import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";

export const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] as const;
export function cubeMesh(bounds:Bounds3):MoldMeshPayload{const {min,max}=bounds;return {positions:[min.x,min.y,min.z,min.x,min.y,max.z,min.x,max.y,max.z,min.x,max.y,min.z,max.x,min.y,min.z,max.x,max.y,min.z,max.x,max.y,max.z,max.x,min.y,max.z],indices:[0,1,2,0,2,3,4,5,6,4,6,7,0,4,7,0,7,1,3,2,6,3,6,5,0,3,5,0,5,4,1,7,6,1,6,2]};}
export function canonicalCube(modelId:string,bounds:Bounds3,transform:readonly number[]=identity):CanonicalPartGeometry{const mesh=cubeMesh(bounds);return {modelId,geometryVersion:`cube:${JSON.stringify(bounds)}`,units:"millimeters",upAxis:"Z",positions:mesh.positions,indices:mesh.indices,transform,localBounds:bounds,winding:"source",validationStatus:"captured",sourceSignature:`cube:${JSON.stringify(bounds)}:${JSON.stringify(transform)}`};}
