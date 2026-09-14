import { hashNumericArray, hashStableValues, meshGeometryVersion } from "../geometry/geometryFingerprint";
import type { CavityGenerationInput, CavityQualityMode, CanonicalPartGeometry, CavitySourceBody } from "./cavityGeneration.contracts";
import type { Bounds3, CuttingPlaneRecord } from "../split-face/splitFace.contracts";

export { hashNumericArray };

/** Hashes compact metadata. Geometry arrays use hashNumericArray to avoid giant JSON strings. */
export const hashCavityValues = hashStableValues;

export const cavityBodyGeometryVersion = meshGeometryVersion;

export interface CavitySignatureSource { readonly sourcePartMesh:CanonicalPartGeometry; readonly coordinateFrameVersion:number; readonly partBoundingBox:Bounds3; readonly referenceMoldBlockBounds:Bounds3; readonly referenceMoldBlockClearanceMm:number; readonly cuttingPlanes:readonly CuttingPlaneRecord[]; readonly moldBodies:readonly CavitySourceBody[]; readonly cavityClearanceMm:number; readonly qualityMode:CavityQualityMode; readonly toleranceVersion:string }
export function buildCavitySourceSignature(source:CavitySignatureSource){return `cavity:${hashCavityValues({partGeometryVersion:source.sourcePartMesh.geometryVersion,partSourceSignature:source.sourcePartMesh.sourceSignature,partTransform:source.sourcePartMesh.transform,coordinateFrameVersion:source.coordinateFrameVersion,partBoundingBox:source.partBoundingBox,referenceMoldBlockBounds:source.referenceMoldBlockBounds,referenceMoldBlockClearanceMm:source.referenceMoldBlockClearanceMm,cuttingPlanes:source.cuttingPlanes.map(p=>({id:p.id,sourceFaceId:p.sourceFaceId,axis:p.axis,normal:p.normal,normalizedPosition:p.normalizedPosition,enabled:p.enabled,creationOrder:p.creationOrder})),moldBodies:source.moldBodies.map(b=>({id:b.id,geometryVersion:b.geometryVersion,bounds:b.bounds})),cavityClearanceMm:source.cavityClearanceMm,qualityMode:source.qualityMode,toleranceVersion:source.toleranceVersion})}`;}
export function isCavityResultCurrent(input:CavityGenerationInput,resultSignature:string){return input.upstreamInputSignature===resultSignature;}
