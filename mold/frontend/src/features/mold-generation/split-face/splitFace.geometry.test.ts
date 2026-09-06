import { buildPartBoundingBoxFacePlanes, clampNormalizedPosition, createCuttingPlane, cuttingPlanesToCutPlaneData, normalizedToWorldCoordinate, selectedPartBoundingBoxFacesToCutPlanes, worldToNormalizedPosition } from "./splitFace.geometry";
import type { PartBoundingBoxFacePlane } from "./splitFace.contracts";
const bounds={min:{x:1,y:2,z:3},max:{x:11,y:22,z:33}};
describe("Part bounding box canonical face planes",()=>{
 it("builds six deterministic Z-up faces without mutating input",()=>{const before=structuredClone(bounds);const faces=buildPartBoundingBoxFacePlanes(bounds)!;expect(faces.map((f: PartBoundingBoxFacePlane)=>[f.id,f.axis,f.coordinate,f.normal])).toEqual([
  ["front","y",22,{x:0,y:1,z:0}],["back","y",2,{x:0,y:-1,z:0}],["left","x",1,{x:-1,y:0,z:0}],["right","x",11,{x:1,y:0,z:0}],["top","z",33,{x:0,y:0,z:1}],["bottom","z",3,{x:0,y:0,z:-1}],
 ]);expect(bounds).toEqual(before);expect(faces[0]?.center).toEqual({x:6,y:22,z:18});expect(faces[0]?.oppositeFaceId).toBe("back");});
 it("rejects invalid bounds",()=>{expect(buildPartBoundingBoxFacePlanes({...bounds,max:{...bounds.max,x:1}})).toBeNull();expect(buildPartBoundingBoxFacePlanes({...bounds,min:{...bounds.min,z:Number.NaN}})).toBeNull();});
 it("converts selected faces in canonical order with tolerance-safe opposite coordinates",()=>{const planes=selectedPartBoundingBoxFacesToCutPlanes(bounds,["right","left"]);expect(planes.map(p=>[p.sourceFace,p.axis])).toEqual([["left","x"],["right","x"]]);expect(planes[0]!.coordinate).toBeCloseTo(1.000001);expect(planes[1]!.coordinate).toBeCloseTo(10.999999);});
 it("creates deterministic serializable plane records for all face mappings",()=>{expect((["front","back","left","right","top","bottom"] as const).map(face=>createCuttingPlane(face)).map(p=>[p.id,p.axis,p.initialNormalizedPosition])).toEqual([
  ["cutting-plane:front","y",1],["cutting-plane:back","y",0],["cutting-plane:left","x",0],["cutting-plane:right","x",1],["cutting-plane:top","z",1],["cutting-plane:bottom","z",0],
 ]);});
 it("round trips finite positions and clamps to the documented millimeter inset",()=>{expect(normalizedToWorldCoordinate(bounds,"x",.4)).toBe(5);expect(worldToNormalizedPosition(bounds,"x",5)).toBe(.4);expect(normalizedToWorldCoordinate(bounds,"x",0)).toBeCloseTo(1.000001);expect(normalizedToWorldCoordinate(bounds,"x",1)).toBeCloseTo(10.999999);expect(()=>clampNormalizedPosition(Number.NaN)).toThrow(/finite/u);});
 it("adapts current plane positions into partition coordinates",()=>{const planes=[{...createCuttingPlane("front"),normalizedPosition:.25},{...createCuttingPlane("right"),normalizedPosition:.75}];expect(cuttingPlanesToCutPlaneData(bounds,planes).map(p=>[p.axis,p.coordinate])).toEqual([["y",7],["x",8.5]]);});
});
