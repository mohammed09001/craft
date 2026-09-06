import { buildFragmentBodyIdentity, classifyFragmentVolumes, compareComponentDescriptors, generateCavityBodies, validateCavityContainment } from "./cavityBody.generator";
import type { CavityGenerationInput, CavityToolData } from "./cavityGeneration.contracts";
import { assertCavityCoordinateAlignment } from "./cavityBody.generator";
import { cubeMesh } from "./cavityGeneration.testFixtures";
import { getManifoldModule, payloadFromManifold } from "./manifold.engine";
const k1={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}},k2={min:{x:-10,y:-10,z:-10},max:{x:20,y:20,z:20}};
const input={referenceMoldBlockBounds:k2,geometryToleranceMm:1e-6,minimumWallMm:1} as CavityGenerationInput;
const tool=(bounds:typeof k1)=>({bounds} as CavityToolData);
it("rejects coordinate-space and declared mesh-bound mismatches before Boolean subtraction",()=>{const sourceBounds={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}},outer={min:{x:-5,y:-5,z:-5},max:{x:15,y:15,z:15}},toolBounds={min:{x:2,y:2,z:2},max:{x:4,y:4,z:4}};const generationInput={partBoundingBox:sourceBounds,referenceMoldBlockBounds:outer,geometryToleranceMm:1e-6,moldBodies:[{id:"source",name:"Source",bounds:sourceBounds,mesh:cubeMesh(sourceBounds)}]} as unknown as CavityGenerationInput;const cavityTool={bounds:toolBounds,mesh:cubeMesh(toolBounds)} as CavityToolData;expect(()=>assertCavityCoordinateAlignment(generationInput,cavityTool)).not.toThrow();expect(()=>assertCavityCoordinateAlignment(generationInput,{...cavityTool,bounds:{...toolBounds,max:{...toolBounds.max,x:5}}})).toThrowError(expect.objectContaining({code:"cavity_coordinate_mismatch"}));expect(()=>assertCavityCoordinateAlignment({...generationInput,partBoundingBox:{min:{x:-10,y:0,z:0},max:{x:10,y:10,z:10}}},cavityTool)).toThrowError(expect.objectContaining({code:"cavity_coordinate_mismatch"}));});
it("blocks outer breakthrough and warns conservatively for thin walls",()=>{expect(validateCavityContainment(input,tool(k1)).blockers).toHaveLength(0);expect(validateCavityContainment(input,tool({...k1,min:{...k1.min,x:-10}})).blockers[0]?.reasonCode).toBe("cavity_outer_breakthrough");expect(validateCavityContainment(input,tool({...k1,min:{...k1.min,x:-9.5}})).warnings[0]?.reasonCode).toBe("cavity_thin_wall");});
it("separates meaningful material solids from negligible fragments",()=>{
  expect(
    classifyFragmentVolumes(
      [1200,25,.0000001,450],
      .001,
    ),
  ).toEqual({
    meaningfulVolumes:[1200,450,25],
    discardedVolumes:[.0000001],
  });
});

it("rejects invalid fragment volume inputs",()=>{
  expect(
    ()=>classifyFragmentVolumes([10,Number.NaN],.001),
  ).toThrow("Fragment volume classification inputs are invalid.");
});
it("builds stable identities for single and multiple cavity components",()=>{
  expect(
    buildFragmentBodyIdentity(
      "mold-1",
      "Mold 1",
      0,
      1,
    ),
  ).toEqual({
    id:"mold-1",
    name:"Mold 1",
  });

  expect(
    buildFragmentBodyIdentity(
      "mold-1",
      "Mold 1",
      0,
      2,
    ),
  ).toEqual({
    id:"mold-1:cavity-component:1",
    name:"Mold 1 — Part 1",
  });

  expect(
    buildFragmentBodyIdentity(
      "mold-1",
      "Mold 1",
      1,
      2,
    ),
  ).toEqual({
    id:"mold-1:cavity-component:2",
    name:"Mold 1 — Part 2",
  });
});

it("rejects invalid fragment body identity inputs",()=>{
  expect(
    ()=>buildFragmentBodyIdentity(
      "mold-1",
      "Mold 1",
      2,
      2,
    ),
  ).toThrow("Fragment body identity inputs are invalid.");
});
it("returns independent mold bodies when cavity subtraction separates material",async()=>{
  const sourceBounds={
    min:{x:-5,y:-5,z:-5},
    max:{x:5,y:5,z:5},
  };

  const outerBounds={
    min:{x:-10,y:-10,z:-10},
    max:{x:10,y:10,z:10},
  };

  const cutterBounds={
    min:{x:-1,y:-6,z:-6},
    max:{x:1,y:6,z:6},
  };

  const sourceMesh=cubeMesh(sourceBounds);
  const cutterMesh=cubeMesh(cutterBounds);

  const generationInput={
    operationId:"multi-component-test",
    generationVersion:1,
    upstreamInputSignature:"multi-component-signature",
    referenceMoldBlockBounds:outerBounds,
    partBoundingBox:sourceBounds,
    geometryToleranceMm:1e-6,
    minimumWallMm:1,
    moldBodies:[
      {
        id:"mold-1",
        name:"Mold 1",
        visible:true,
        bounds:sourceBounds,
        centroid:{x:0,y:0,z:0},
        triangleCount:12,
        volumeMm3:1000,
        watertight:true,
        mesh:sourceMesh,
        geometryVersion:"test-source-v1",
      },
    ],
  } as unknown as CavityGenerationInput;

  const cavityTool={
    mesh:cutterMesh,
    bounds:cutterBounds,
    volumeMm3:288,
    triangleCount:12,
    connectedComponentCount:1,
    watertight:true,
    manifold:true,
    warnings:[],
    clearanceMm:0,
    implementationMethod:"exact-watertight-part-solid",
    qualityMode:"standard",
  } as CavityToolData;

  const result=await generateCavityBodies(
    generationInput,
    cavityTool,
  );

  expect(result.bodies).toHaveLength(2);

  expect(
    result.bodies.map(body=>body.id),
  ).toEqual([
    "mold-1:cavity-component:1",
    "mold-1:cavity-component:2",
  ]);

  expect(
    result.bodies.map(body=>body.name),
  ).toEqual([
    "Mold 1 — Part 1",
    "Mold 1 — Part 2",
  ]);

  expect(
    result.bodies.every(
      body=>
        body.parentBodyId==="mold-1"&&
        body.cavityAffected&&
        body.cavityValidation.connectedComponentCount===1,
    ),
  ).toBe(true);

  const surfaceRoles=new Set(
    result.bodies.flatMap(
      body=>body.mesh.faceRuns?.map(run=>run.role)??[],
    ),
  );
  expect(surfaceRoles).toContain("outer-mold");
  expect(surfaceRoles).toContain("cavity-surface");
  expect(surfaceRoles).not.toContain("sprue-funnel");

  expect(
    result.bodies.reduce(
      (sum,body)=>sum+body.volumeMm3,
      0,
    ),
  ).toBeCloseTo(800,3);
});
it("subtracts from an L-shaped source mesh without filling empty bounding-box space",async()=>{
  const module=await getManifoldModule();
  const horizontal=module.Manifold.cube([10,4,5]);
  const vertical=module.Manifold.cube([4,10,5]);
  const sourceSolid=module.Manifold.union([horizontal,vertical]);
  const sourceMesh=payloadFromManifold(sourceSolid);
  const sourceBounds={min:{x:0,y:0,z:0},max:{x:10,y:10,z:5}};
  const cutterBounds={min:{x:6,y:6,z:1},max:{x:9,y:9,z:4}};
  const generationInput={operationId:"l-shape",generationVersion:1,upstreamInputSignature:"l-shape-v1",partBoundingBox:sourceBounds,referenceMoldBlockBounds:{min:{x:-5,y:-5,z:-5},max:{x:15,y:15,z:10}},geometryToleranceMm:1e-6,minimumWallMm:1,moldBodies:[{id:"l",name:"L Mold",bounds:sourceBounds,centroid:{x:5,y:5,z:2.5},triangleCount:sourceMesh.indices.length/3,volumeMm3:sourceSolid.volume(),watertight:true,mesh:sourceMesh,geometryVersion:"l-v1"}]} as unknown as CavityGenerationInput;
  const cavityTool={mesh:cubeMesh(cutterBounds),bounds:cutterBounds,volumeMm3:27,triangleCount:12,connectedComponentCount:1,watertight:true,manifold:true,warnings:[],clearanceMm:0,implementationMethod:"exact-watertight-part-solid",qualityMode:"standard"} as CavityToolData;
  try{
    await expect(generateCavityBodies(generationInput,cavityTool)).rejects.toMatchObject({code:"cavity_no_material_intersection"});
  }finally{sourceSolid.delete();horizontal.delete();vertical.delete();}
});
it("orders equal-volume components deterministically by quantized bounds",()=>{
  const tolerance=1e-3;

  const left={
    volumeMm3:100,
    bounds:{
      min:{x:-5,y:0,z:0},
      max:{x:-1,y:4,z:4},
    },
  };

  const right={
    volumeMm3:100,
    bounds:{
      min:{x:1,y:0,z:0},
      max:{x:5,y:4,z:4},
    },
  };

  expect(
    [right,left].sort(
      (a,b)=>
        compareComponentDescriptors(
          a,
          b,
          tolerance,
        ),
    ),
  ).toEqual([left,right]);
});

it("orders larger meaningful components before smaller components",()=>{
  const bounds={
    min:{x:0,y:0,z:0},
    max:{x:1,y:1,z:1},
  };

  const components=[
    {volumeMm3:10,bounds},
    {volumeMm3:30,bounds},
    {volumeMm3:20,bounds},
  ];

  expect(
    components.sort(
      (a,b)=>
        compareComponentDescriptors(
          a,
          b,
          1e-3,
        ),
    ).map(component=>component.volumeMm3),
  ).toEqual([30,20,10]);
});

it("rejects invalid component ordering tolerance",()=>{
  const descriptor={
    volumeMm3:1,
    bounds:{
      min:{x:0,y:0,z:0},
      max:{x:1,y:1,z:1},
    },
  };

  expect(
    ()=>compareComponentDescriptors(
      descriptor,
      descriptor,
      0,
    ),
  ).toThrow(
    "Component ordering tolerance must be positive.",
  );
});

