import type { Mesh } from "three";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";

const hash=(values:readonly number[])=>{let h=2166136261;for(const value of values){const text=Number.isFinite(value)?value.toPrecision(12):String(value);for(let i=0;i<text.length;i+=1)h=Math.imul(h^text.charCodeAt(i),16777619);}return (h>>>0).toString(16).padStart(8,"0");};

/** Captures immutable local part triangles plus the canonical world transform without retaining Three.js objects. */
export function captureCanonicalPartGeometry(modelId:string,mesh:Mesh):CanonicalPartGeometry|null{
  const attribute=mesh.geometry.getAttribute("position");if(attribute===undefined||attribute.itemSize<3||attribute.count<3)return null;
  const positions:number[]=[];for(let i=0;i<attribute.count;i+=1)positions.push(attribute.getX(i),attribute.getY(i),attribute.getZ(i));
  const sourceIndex=mesh.geometry.getIndex();const completeIndices=sourceIndex===null?Array.from({length:attribute.count},(_,i)=>i):Array.from({length:sourceIndex.count},(_,i)=>sourceIndex.getX(i));const drawStart=Math.max(0,mesh.geometry.drawRange.start);const requestedCount=mesh.geometry.drawRange.count;const drawEnd=Math.min(completeIndices.length,Number.isFinite(requestedCount)?drawStart+requestedCount:completeIndices.length);const drawCount=Math.floor((drawEnd-drawStart)/3)*3;const indices=completeIndices.slice(drawStart,drawStart+drawCount);
  mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;if(box===null)return null;
  mesh.updateWorldMatrix(true,false);const transform=mesh.matrixWorld.toArray();const geometryVersion=`part_mesh:${hash([...positions,...indices])}`;
  const sourceSignature=`${geometryVersion}:transform:${hash(transform)}`;
  return Object.freeze({modelId,geometryVersion,units:"millimeters",sourceUnits:"millimeters",scaleToMillimeters:1,upAxis:"Z",positions:Object.freeze(positions),indices:Object.freeze(indices),transform:Object.freeze(transform),localBounds:Object.freeze({min:Object.freeze({x:box.min.x,y:box.min.y,z:box.min.z}),max:Object.freeze({x:box.max.x,y:box.max.y,z:box.max.z})}),winding:"source",validationStatus:"captured",sourceSignature});
}
