import type { ReferenceMoldDefinition } from "./referenceMoldDefinition.contracts";
import { generateMoldBodies, partitionOrthogonalMold, validateMoldPartitionCoverage, type CutPlaneData } from "./orthogonalMold";

const k1={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}};
const k2={min:{x:-10,y:-10,z:-10},max:{x:20,y:20,z:20}};
const definition:ReferenceMoldDefinition={schemaVersion:1,definitionId:"partition",modelId:"model",coordinateSystem:{units:"millimeters",upAxis:"Z"},selectionBoxBounds:k1,referenceMoldBlock:{clearanceMm:10,bounds:k2},usedFaces:["left"]};
const plane=(axis:"x"|"y"|"z",coordinate=0,order=0):CutPlaneData=>({axis,coordinate,normal:{x:axis==="x"?1:0,y:axis==="y"?1:0,z:axis==="z"?1:0},sourceSketchId:`${axis}-${coordinate}`,sourceFace:axis==="x"?"left":axis==="y"?"front":"bottom",order});
const volume=(bounds:typeof k2)=>(bounds.max.x-bounds.min.x)*(bounds.max.y-bounds.min.y)*(bounds.max.z-bounds.min.z);

it("partitions the complete K2 solid and keeps material inside the K1 reference envelope",()=>{
  const result=partitionOrthogonalMold(definition,[plane("x")]);
  expect(result.bodies).toHaveLength(2);
  expect(result.sourceSolidVolumeMm3).toBe(volume(k2));
  expect(result.partitionedVolumeMm3).toBeCloseTo(volume(k2),8);
  expect(result.bodies.reduce((sum,body)=>sum+body.volumeMm3,0)).toBeCloseTo(volume(k2),8);
  expect(result.bodies.some(body=>body.bounds.min.x<5&&body.bounds.max.x>5&&body.bounds.min.y<5&&body.bounds.max.y>5&&body.bounds.min.z<5&&body.bounds.max.z>5)).toBe(true);
});

it("keeps multi-plane partitions gap-free, non-overlapping, and deterministic",()=>{
  const planes=[plane("x",0,0),plane("y",0,1),plane("z",0,2)];const first=generateMoldBodies(definition,planes);const second=generateMoldBodies(definition,planes);
  expect(first).toHaveLength(8);expect(first).toEqual(second);expect(first.reduce((sum,body)=>sum+body.volumeMm3,0)).toBeCloseTo(volume(k2),8);
  for(let left=0;left<first.length;left+=1)for(let right=left+1;right<first.length;right+=1){const a=first[left]!.bounds,b=first[right]!.bounds;const overlap=Math.max(0,Math.min(a.max.x,b.max.x)-Math.max(a.min.x,b.min.x))*Math.max(0,Math.min(a.max.y,b.max.y)-Math.max(a.min.y,b.min.y))*Math.max(0,Math.min(a.max.z,b.max.z)-Math.max(a.min.z,b.min.z));expect(overlap).toBe(0);}
});

it("rejects incomplete Stage A volume before cavity generation",()=>{
  expect(()=>validateMoldPartitionCoverage(k2,[{volumeMm3:volume(k2)-1}])).toThrowError(expect.objectContaining({code:"mold_partition_incomplete"}));
});
