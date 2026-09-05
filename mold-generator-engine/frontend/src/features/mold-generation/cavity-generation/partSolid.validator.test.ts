import { buildCavityGenerationInput } from "./cavityGeneration.input";
import { canonicalCube, cubeMesh } from "./cavityGeneration.testFixtures";
import { analyzeBoundaryLoops, boundsFromPositions, extractBoundaryLoops, orientTriangularBoundaryRepair, validateAndPreparePartSolid } from "./partSolid.validator";
import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";
const k1={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}},k2={min:{x:-10,y:-10,z:-10},max:{x:20,y:20,z:20}};const mesh=cubeMesh(k2);const body:MoldBodyData={id:"b",name:"Mold 1",visible:true,bounds:k2,triangleCount:12,volumeMm3:27000,watertight:true,mesh};const definition:ReferenceMoldDefinition={schemaVersion:1,definitionId:"d",modelId:"m",coordinateSystem:{units:"millimeters",upAxis:"Z"},selectionBoxBounds:k1,referenceMoldBlock:{clearanceMm:10,bounds:k2},usedFaces:["front"],moldBodies:[body]};
const input=(sourcePartMesh=canonicalCube("m",k1))=>buildCavityGenerationInput({sourcePartMesh,definition,cuttingPlanes:[],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1});
it("accepts a closed cube with positive volume",()=>{const result=validateAndPreparePartSolid(input());expect(result.ok).toBe(true);expect(result.prepared?.volumeMm3).toBeCloseTo(1000);expect(result.openEdgeCount).toBe(0);});
it("normalizes winding independently for disconnected components",()=>{
  const first=cubeMesh(k1);const second=cubeMesh({min:{x:20,y:0,z:0},max:{x:30,y:10,z:10}});const offset=first.positions.length/3;
  const partGeometry={...canonicalCube("m",k1),positions:[...first.positions,...second.positions],indices:[...first.indices,...second.indices.map(index=>index+offset)],localBounds:{min:{x:0,y:0,z:0},max:{x:30,y:10,z:10}},sourceSignature:"two-components"};
  const start=first.indices.length;const reversed=[...partGeometry.indices];for(let index=start;index<reversed.length;index+=3){const swap=reversed[index+1]!;reversed[index+1]=reversed[index+2]!;reversed[index+2]=swap;}
  const result=validateAndPreparePartSolid(input({...partGeometry,indices:reversed}));
  expect(result.ok).toBe(true);expect(result.prepared?.connectedComponentCount).toBe(2);expect(result.prepared?.volumeMm3).toBeCloseTo(2000);
});
it("blocks non-repairable open meshes and non-finite meshes",()=>{
  const cube=canonicalCube("m",k1);

  const nonRepairableOpenMesh={
    ...cube,
    indices:cube.indices.slice(0,-6),
    sourceSignature:"cube-with-non-repairable-hole",
  };

  expect(
    validateAndPreparePartSolid(
      input(nonRepairableOpenMesh),
    ).blockers[0]?.reasonCode,
  ).toBe("part_solid_open_mesh");

  expect(
    validateAndPreparePartSolid(
      input({
        ...cube,
        positions:[
          Number.NaN,
          ...cube.positions.slice(1),
        ],
      }),
    ).blockers[0]?.reasonCode,
  ).toBe("part_solid_non_finite_vertex");
});
it("normalizes translated and rotated part mesh through the mold frame",()=>{const transform=[0,1,0,0,-1,0,0,0,0,0,1,0,20,30,40,1];const result=validateAndPreparePartSolid(input(canonicalCube("m",k1,transform)));expect(result.ok).toBe(true);expect(result.prepared?.bounds).toEqual(k1);});
it("calculates bounds for more than 150,000 vertices without overflowing the call stack",()=>{
  const positions:number[]=[];
  const vertexCount=150_001;

  for(let index=0;index<vertexCount;index+=1){
    positions.push(
      index-75_000,
      40_000-index,
      index%2===0?-25:25,
    );
  }

  expect(()=>boundsFromPositions(positions)).not.toThrow();

  expect(boundsFromPositions(positions)).toEqual({
    min:{x:-75_000,y:-110_000,z:-25},
    max:{x:75_000,y:40_000,z:25},
  });
});
it("detects one closed boundary loop and rejects open chains",()=>{
  expect(
    analyzeBoundaryLoops([
      [0,1],
      [1,2],
      [2,3],
      [3,0],
    ]),
  ).toEqual({
    loopCount:1,
    loopVertexCounts:[4],
    invalidOpenChains:0,
  });

  expect(
    analyzeBoundaryLoops([
      [0,1],
      [1,2],
    ]),
  ).toEqual({
    loopCount:0,
    loopVertexCounts:[],
    invalidOpenChains:1,
  });
});
it("extracts triangular boundary loops deterministically",()=>{
  expect(
    extractBoundaryLoops([
      [0,1],
      [1,2],
      [2,0],
      [3,4],
      [4,5],
      [5,3],
    ]),
  ).toEqual({
    loops:[
      [0,1,2],
      [3,4,5],
    ],
    invalidOpenChains:0,
  });
});

it("repairs a single missing triangular face safely",()=>{
  const cube=canonicalCube("m",k1);
  const missingFace={
    ...cube,
    indices:cube.indices.slice(0,-3),
    sourceSignature:"cube-with-triangular-hole",
  };

  const result=validateAndPreparePartSolid(
    input(missingFace),
  );

  expect(result.ok).toBe(true);
  expect(result.openEdgeCount).toBe(0);
  expect(
    result.warnings.some(
      warning=>
        warning.reasonCode===
        "part_solid_triangular_holes_repaired",
    ),
  ).toBe(true);
});
it("orients triangular repairs opposite to existing boundary edges",()=>{
  const directions=new Map<string,readonly [number,number]>([
    ["0:1",[0,1]],
    ["1:2",[1,2]],
    ["0:2",[2,0]],
  ]);

  expect(
    orientTriangularBoundaryRepair(
      [0,1,2],
      directions,
    ),
  ).toEqual([0,2,1]);
});

it("rejects triangular repair when directed boundary orientation is inconsistent",()=>{
  const directions=new Map<string,readonly [number,number]>([
    ["0:1",[0,1]],
    ["1:2",[1,2]],
    ["0:2",[0,2]],
  ]);

  expect(
    ()=>orientTriangularBoundaryRepair(
      [0,1,2],
      directions,
    ),
  ).toThrow(
    "Triangular boundary orientation could not be resolved safely.",
  );
});


