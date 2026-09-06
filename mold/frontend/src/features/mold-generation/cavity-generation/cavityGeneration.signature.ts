import type { CavityGenerationInput, CavityQualityMode, CanonicalPartGeometry, CavitySourceBody } from "./cavityGeneration.contracts";
import type { Bounds3, CuttingPlaneRecord } from "../split-face/splitFace.contracts";

function updateHash(hash:number,text:string):number {let result=hash;for(let index=0;index<text.length;index+=1)result=Math.imul(result^text.charCodeAt(index),16777619);return result;}
const finishHash=(hash:number)=>(hash>>>0).toString(16).padStart(8,"0");

/** Hashes compact metadata. Geometry arrays use hashNumericArray to avoid giant JSON strings. */
export function hashCavityValues(value:unknown){return finishHash(updateHash(2166136261,JSON.stringify(value)));}

export function hashNumericArray(values:readonly number[],seed=2166136261):number {
  let hash=seed;
  const buffer=new ArrayBuffer(8);const view=new DataView(buffer);
  for(const value of values){view.setFloat64(0,value,true);for(let byte=0;byte<8;byte+=1)hash=Math.imul(hash^view.getUint8(byte),16777619);}
  return hash;
}

export function cavityBodyGeometryVersion(body:Pick<CavitySourceBody,"id"|"mesh"|"bounds">){let hash=updateHash(2166136261,body.id);hash=updateHash(hash,JSON.stringify(body.bounds));hash=hashNumericArray(body.mesh.positions,hash);hash=hashNumericArray(body.mesh.indices,hash);return `body:${finishHash(hash)}`;}
export interface CavitySignatureSource { readonly sourcePartMesh:CanonicalPartGeometry; readonly coordinateFrameVersion:number; readonly partBoundingBox:Bounds3; readonly referenceMoldBlockBounds:Bounds3; readonly referenceMoldBlockClearanceMm:number; readonly cuttingPlanes:readonly CuttingPlaneRecord[]; readonly moldBodies:readonly CavitySourceBody[]; readonly cavityClearanceMm:number; readonly qualityMode:CavityQualityMode; readonly toleranceVersion:string }
export function buildCavitySourceSignature(source:CavitySignatureSource){return `cavity:${hashCavityValues({partGeometryVersion:source.sourcePartMesh.geometryVersion,partSourceSignature:source.sourcePartMesh.sourceSignature,partTransform:source.sourcePartMesh.transform,coordinateFrameVersion:source.coordinateFrameVersion,partBoundingBox:source.partBoundingBox,referenceMoldBlockBounds:source.referenceMoldBlockBounds,referenceMoldBlockClearanceMm:source.referenceMoldBlockClearanceMm,cuttingPlanes:source.cuttingPlanes.map(p=>({id:p.id,sourceFaceId:p.sourceFaceId,axis:p.axis,normal:p.normal,normalizedPosition:p.normalizedPosition,enabled:p.enabled,creationOrder:p.creationOrder})),moldBodies:source.moldBodies.map(b=>({id:b.id,geometryVersion:b.geometryVersion,bounds:b.bounds})),cavityClearanceMm:source.cavityClearanceMm,qualityMode:source.qualityMode,toleranceVersion:source.toleranceVersion})}`;}
export function isCavityResultCurrent(input:CavityGenerationInput,resultSignature:string){return input.upstreamInputSignature===resultSignature;}
