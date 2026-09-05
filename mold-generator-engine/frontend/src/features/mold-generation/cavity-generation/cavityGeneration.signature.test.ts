import { cavityBodyGeometryVersion, hashNumericArray } from "./cavityGeneration.signature";

it("hashes geometry incrementally and deterministically",()=>{
  const values=Array.from({length:100_000},(_,index)=>index/10);
  expect(hashNumericArray(values)).toBe(hashNumericArray(values));
  const changed=[...values];changed[99_999]!+=0.001;
  expect(hashNumericArray(changed)).not.toBe(hashNumericArray(values));
});

it("includes mesh bytes in stable body geometry versions",()=>{
  const body={id:"body",bounds:{min:{x:0,y:0,z:0},max:{x:1,y:1,z:1}},mesh:{positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2]}};
  expect(cavityBodyGeometryVersion(body)).toBe(cavityBodyGeometryVersion(body));
  expect(cavityBodyGeometryVersion({...body,mesh:{...body.mesh,positions:[...body.mesh.positions,0]}})).not.toBe(cavityBodyGeometryVersion(body));
});
