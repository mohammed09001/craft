import { SphereGeometry } from "three";
import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";
import { validateAndPreparePartSolid } from "./partSolid.validator";
import { generateCavityBodies } from "./cavityBody.generator";
import { buildCavityGenerationInput } from "./cavityGeneration.input";
import { cubeMesh, identity } from "./cavityGeneration.testFixtures";
import { createAutomaticCavityTool } from "./cavityOffset.orchestrator";

const describeBenchmark=import.meta.env.VITE_RUN_CAVITY_BENCHMARK==="1"?describe:describe.skip;
const targets=[10_000,50_000,250_000,1_000_000] as const;

describeBenchmark("manual cavity performance benchmark",()=>{
  it.each(targets)("benchmarks approximately %i part triangles",async target=>{
    const segments=Math.max(8,Math.ceil(Math.sqrt(target/2)));const geometry=new SphereGeometry(10,segments,segments);
    const attribute=geometry.getAttribute("position");const positions:number[]=[];for(let index=0;index<attribute.count;index+=1)positions.push(attribute.getX(index),attribute.getY(index),attribute.getZ(index));
    const sourceIndex=geometry.getIndex();const indices=sourceIndex===null?Array.from({length:attribute.count},(_,index)=>index):Array.from({length:sourceIndex.count},(_,index)=>sourceIndex.getX(index));
    const k1={min:{x:-10,y:-10,z:-10},max:{x:10,y:10,z:10}},k2={min:{x:-20,y:-20,z:-20},max:{x:20,y:20,z:20}};const moldMesh=cubeMesh(k2);
    const body:MoldBodyData={id:"benchmark-body",name:"Benchmark Mold",visible:true,bounds:k2,centroid:{x:0,y:0,z:0},triangleCount:12,volumeMm3:64_000,watertight:true,mesh:moldMesh};
    const definition:ReferenceMoldDefinition={schemaVersion:1,definitionId:"benchmark",modelId:"benchmark",coordinateSystem:{units:"millimeters",upAxis:"Z"},selectionBoxBounds:k1,referenceMoldBlock:{clearanceMm:10,bounds:k2},usedFaces:["front"],moldBodies:[body]};
    const input=buildCavityGenerationInput({sourcePartMesh:{modelId:"benchmark",geometryVersion:`sphere:${indices.length}`,units:"millimeters",sourceUnits:"millimeters",scaleToMillimeters:1,upAxis:"Z",positions,indices,transform:identity,localBounds:k1,winding:"source",validationStatus:"captured",sourceSignature:`sphere:${indices.length}`},definition,cuttingPlanes:[],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1});
    const preparationStarted=performance.now();const validation=validateAndPreparePartSolid(input);const preparationMs=performance.now()-preparationStarted;if(!validation.ok||validation.prepared===null)throw new Error(validation.blockers[0]?.message??"Benchmark preparation failed.");
    const offsetStarted=performance.now();const offset=await createAutomaticCavityTool(validation.prepared,0,"standard",input.tolerancePolicy.booleanToleranceMm);const offsetMs=performance.now()-offsetStarted;
    const booleanStarted=performance.now();const result=await generateCavityBodies(input,offset.tool);const booleanMs=performance.now()-booleanStarted;
    const estimatedPeakBytes=(positions.length+indices.length+offset.tool.mesh.positions.length+offset.tool.mesh.indices.length+result.bodies.reduce((sum,item)=>sum+item.mesh.positions.length+item.mesh.indices.length,0))*8;
    console.table([{targetTriangles:target,inputTriangles:indices.length/3,preparationMs,offsetMs,booleanMs,peakEstimatedMemoryMiB:estimatedPeakBytes/1024/1024,resultTriangleCount:result.bodies.reduce((sum,item)=>sum+item.triangleCount,0)}]);geometry.dispose();
  },600_000);
});
