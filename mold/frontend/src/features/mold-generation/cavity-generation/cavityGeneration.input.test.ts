import { generateMoldBodies } from "../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import { createCuttingPlane } from "../split-face/splitFace.geometry";
import { buildCavityGenerationInput } from "./cavityGeneration.input";
import { canonicalCube } from "./cavityGeneration.testFixtures";

const k1={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}},k2={min:{x:-10,y:-10,z:-10},max:{x:20,y:20,z:20}};
function definition():ReferenceMoldDefinition{const base:ReferenceMoldDefinition={schemaVersion:1,definitionId:"m:parts",modelId:"m",coordinateSystem:{units:"millimeters",upAxis:"Z"},selectionBoxBounds:k1,referenceMoldBlock:{clearanceMm:10,bounds:k2},usedFaces:["front"]};return {...base,moldBodies:generateMoldBodies(base,[{axis:"y",coordinate:5,normal:{x:0,y:1,z:0},sourceSketchId:"p",sourceFace:"front",order:0}]).map((b,i)=>({...b,visible:i===0}))};}
it("builds an immutable serializable production snapshot and excludes visibility",()=>{const input=buildCavityGenerationInput({sourcePartMesh:canonicalCube("m",k1),definition:definition(),cuttingPlanes:[{...createCuttingPlane("front"),normalizedPosition:.5}],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1});expect(Object.isFrozen(input)).toBe(true);expect(JSON.stringify(input)).not.toContain('"visible"');expect(input.coordinateFrame.moldFromWorld).toEqual(input.coordinateFrame.worldFromMold);expect(input.moldBodies).toHaveLength(2);});
it("changes geometry signatures but ignores source body visibility",()=>{const base=definition();const common={sourcePartMesh:canonicalCube("m",k1),cuttingPlanes:[createCuttingPlane("front")],cavityClearanceMm:0,qualityMode:"standard" as const,generationVersion:1};const a=buildCavityGenerationInput({...common,definition:base});const b=buildCavityGenerationInput({...common,definition:{...base,moldBodies:base.moldBodies!.map(body=>({...body,visible:!body.visible}))}});const c=buildCavityGenerationInput({...common,cavityClearanceMm:.2,definition:base});expect(a.upstreamInputSignature).toBe(b.upstreamInputSignature);expect(c.upstreamInputSignature).not.toBe(a.upstreamInputSignature);});
it("rejects an incomplete K2 partition before starting cavity work",()=>{const base=definition();const incomplete={...base,moldBodies:base.moldBodies!.map((body,index)=>index===0?{...body,volumeMm3:body.volumeMm3-1}:body)};expect(()=>buildCavityGenerationInput({sourcePartMesh:canonicalCube("m",k1),definition:incomplete,cuttingPlanes:[createCuttingPlane("front")],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1})).toThrowError(expect.objectContaining({code:"mold_partition_incomplete"}));});
it("skips the K2 partition-coverage check for a Segmentation-derived definition (moldBodiesPartitionReferenceBlock: false)",()=>{const base=definition();const incomplete={...base,moldBodiesPartitionReferenceBlock:false as const,moldBodies:base.moldBodies!.map((body,index)=>index===0?{...body,volumeMm3:body.volumeMm3-1}:body)};expect(()=>buildCavityGenerationInput({sourcePartMesh:canonicalCube("m",k1),definition:incomplete,cuttingPlanes:[createCuttingPlane("front")],cavityClearanceMm:0,qualityMode:"standard",generationVersion:1})).not.toThrow();});
it("changes signatures for transforms, moved planes, and Mold Part geometry",()=>{const base=definition();const common={sourcePartMesh:canonicalCube("m",k1),definition:base,cuttingPlanes:[createCuttingPlane("front")],cavityClearanceMm:0,qualityMode:"standard" as const,generationVersion:1};const source=buildCavityGenerationInput(common).upstreamInputSignature;expect(buildCavityGenerationInput({...common,sourcePartMesh:canonicalCube("m",k1,[1,0,0,0,0,1,0,0,0,0,1,0,1,0,0,1])}).upstreamInputSignature).not.toBe(source);expect(buildCavityGenerationInput({...common,cuttingPlanes:[{...createCuttingPlane("front"),normalizedPosition:.4}]}).upstreamInputSignature).not.toBe(source);const changed={...base,moldBodies:base.moldBodies!.map((body,i)=>i?body:{...body,mesh:{...body.mesh,positions:[...body.mesh.positions.slice(0,-1),body.mesh.positions.at(-1)!+.01]}})};expect(buildCavityGenerationInput({...common,definition:changed}).upstreamInputSignature).not.toBe(source);});
it("accepts a Segmentation-derived definition with multiple ordered planes on the same axis (e.g. two Z cuts producing three layers)", () => {
  const base: ReferenceMoldDefinition = {
    schemaVersion: 1,
    definitionId: "m:segmentation",
    modelId: "m",
    coordinateSystem: { units: "millimeters", upAxis: "Z" },
    selectionBoxBounds: k1,
    referenceMoldBlock: { clearanceMm: 10, bounds: k2 },
    usedFaces: [],
  };
  // Two boundaries on the same axis (z), the way multiple ordered
  // Segmentation planes on one axis would commit -- unlike Split by Face's
  // one-plane-per-selected-face model, this is not "one cut per axis".
  const threeZLayerBodies = generateMoldBodies(base, [
    { axis: "z", coordinate: 3, normal: { x: 0, y: 0, z: 1 }, sourceSketchId: "segmentation", sourceFace: "bottom", order: 0 },
    { axis: "z", coordinate: 7, normal: { x: 0, y: 0, z: 1 }, sourceSketchId: "segmentation", sourceFace: "top", order: 1 },
  ]);
  expect(threeZLayerBodies).toHaveLength(3);

  const segmentationDerived: ReferenceMoldDefinition = {
    ...base,
    moldBodies: threeZLayerBodies,
    moldBodiesPartitionReferenceBlock: false,
  };

  const input = buildCavityGenerationInput({
    sourcePartMesh: canonicalCube("m", k1),
    definition: segmentationDerived,
    cuttingPlanes: [],
    cavityClearanceMm: 0,
    qualityMode: "standard",
    generationVersion: 1,
  });

  expect(input.moldBodies).toHaveLength(3);
});

it("accepts a closed STL triangle soup before welded worker validation", () => {
  const indexed = canonicalCube("m", k1);
  const positions: number[] = [];
  const indices: number[] = [];

  for (const sourceIndex of indexed.indices) {
    positions.push(
      indexed.positions[sourceIndex * 3]!,
      indexed.positions[sourceIndex * 3 + 1]!,
      indexed.positions[sourceIndex * 3 + 2]!,
    );
    indices.push(indices.length);
  }

  const triangleSoup = {
    ...indexed,
    positions,
    indices,
    geometryVersion: `${indexed.geometryVersion}:triangle-soup`,
    sourceSignature: `${indexed.sourceSignature}:triangle-soup`,
  };

  expect(() =>
    buildCavityGenerationInput({
      sourcePartMesh: triangleSoup,
      definition: definition(),
      cuttingPlanes: [createCuttingPlane("front")],
      cavityClearanceMm: 0,
      qualityMode: "high",
      generationVersion: 1,
    }),
  ).not.toThrow();
});

