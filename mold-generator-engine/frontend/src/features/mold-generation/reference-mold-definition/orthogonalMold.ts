import type { ReferenceMoldDefinition } from "./referenceMoldDefinition.contracts";
import type { PartBoundingBoxFaceId } from "../split-face/splitFace.contracts";

/** Millimeter tolerance shared by the scoped orthogonal solid kernel. */
export const MOLD_GEOMETRY_TOLERANCE_MM = 1e-6;

export type Axis = "x" | "y" | "z";
export interface CutPlaneData { readonly axis: Axis; readonly coordinate: number; readonly normal: { readonly x: number; readonly y: number; readonly z: number }; readonly sourceSketchId: string; readonly sourceFace: PartBoundingBoxFaceId; readonly order: number }
export interface MoldMeshFaceRun { readonly startTriangle: number; readonly triangleCount: number; readonly role: "outer-mold" | "cavity-surface" | "registration-key" | "sprue-funnel" }
export interface MoldMeshPayload { readonly positions: readonly number[]; readonly indices: readonly number[]; readonly faceRuns?: readonly MoldMeshFaceRun[] }
export interface MoldBodyData { readonly id: string; readonly name: string; readonly visible: boolean; readonly bounds: ReferenceMoldDefinition["selectionBoxBounds"]; readonly centroid?: {readonly x:number;readonly y:number;readonly z:number}; readonly generationOrder?:number; readonly sourceSelectedFaceSignature?:string; readonly triangleCount: number; readonly volumeMm3: number; readonly watertight: true; readonly mesh: MoldMeshPayload }
export interface MoldPartitionResult { readonly bodies:readonly MoldBodyData[]; readonly sourceSolidVolumeMm3:number; readonly partitionedVolumeMm3:number; readonly coordinateSpace:"mold-local"; readonly strategy:"orthogonal" }

export interface WholeMoldBodyIdentity {
  readonly id: string;
  readonly name: string;
  readonly geometryVersion?: string;
}

const finiteBounds = (bounds: ReferenceMoldDefinition["selectionBoxBounds"]) =>
  [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite) &&
  bounds.max.x - bounds.min.x > MOLD_GEOMETRY_TOLERANCE_MM && bounds.max.y - bounds.min.y > MOLD_GEOMETRY_TOLERANCE_MM && bounds.max.z - bounds.min.z > MOLD_GEOMETRY_TOLERANCE_MM;

type Cell = { ix: number; iy: number; iz: number };
const unique = (values: readonly number[]) => [...values].sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1]! > MOLD_GEOMETRY_TOLERANCE_MM);
const key = (c: Cell) => `${c.ix}:${c.iy}:${c.iz}`;

function meshCells(cells: readonly Cell[], coordinates: Record<Axis, readonly number[]>): { mesh: MoldMeshPayload; volume: number; bounds: ReferenceMoldDefinition["selectionBoxBounds"] } {
  const occupied = new Set(cells.map(key)); const positions: number[] = []; const indices: number[] = []; const vertices = new Map<string, number>(); let volume = 0;
  const addVertex = (x: number, y: number, z: number) => { const k = `${x},${y},${z}`; const found = vertices.get(k); if (found !== undefined) return found; const i = positions.length / 3; positions.push(x, y, z); vertices.set(k, i); return i; };
  const addQuad = (points: readonly (readonly [number, number, number])[]) => { const q = points.map((p) => addVertex(...p)); indices.push(q[0]!, q[1]!, q[2]!, q[0]!, q[2]!, q[3]!); };
  for (const c of cells) {
    const x0=coordinates.x[c.ix]!, x1=coordinates.x[c.ix+1]!, y0=coordinates.y[c.iy]!, y1=coordinates.y[c.iy+1]!, z0=coordinates.z[c.iz]!, z1=coordinates.z[c.iz+1]!; volume += (x1-x0)*(y1-y0)*(z1-z0);
    if (!occupied.has(key({ ...c, ix:c.ix-1 }))) addQuad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]]);
    if (!occupied.has(key({ ...c, ix:c.ix+1 }))) addQuad([[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]]);
    if (!occupied.has(key({ ...c, iy:c.iy-1 }))) addQuad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]]);
    if (!occupied.has(key({ ...c, iy:c.iy+1 }))) addQuad([[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]]);
    if (!occupied.has(key({ ...c, iz:c.iz-1 }))) addQuad([[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0]]);
    if (!occupied.has(key({ ...c, iz:c.iz+1 }))) addQuad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]]);
  }
  const xs=cells.flatMap(c=>[coordinates.x[c.ix]!,coordinates.x[c.ix+1]!]), ys=cells.flatMap(c=>[coordinates.y[c.iy]!,coordinates.y[c.iy+1]!]), zs=cells.flatMap(c=>[coordinates.z[c.iz]!,coordinates.z[c.iz+1]!]);
  return { mesh:{positions,indices}, volume, bounds:{min:{x:Math.min(...xs),y:Math.min(...ys),z:Math.min(...zs)},max:{x:Math.max(...xs),y:Math.max(...ys),z:Math.max(...zs)}} };
}

const boundsVolume=(bounds:ReferenceMoldDefinition["selectionBoxBounds"])=>
  (bounds.max.x-bounds.min.x)*(bounds.max.y-bounds.min.y)*(bounds.max.z-bounds.min.z);

export function validateMoldPartitionCoverage(
  outer:ReferenceMoldDefinition["selectionBoxBounds"],
  bodies:readonly Pick<MoldBodyData,"volumeMm3">[],
):{readonly sourceSolidVolumeMm3:number;readonly partitionedVolumeMm3:number;readonly toleranceMm3:number} {
  if(!finiteBounds(outer)||bodies.length===0||bodies.some(body=>!Number.isFinite(body.volumeMm3)||body.volumeMm3<=0))throw new Error("Mold partition coverage inputs are invalid.");
  const sourceSolidVolumeMm3=boundsVolume(outer);const partitionedVolumeMm3=bodies.reduce((sum,body)=>sum+body.volumeMm3,0);const toleranceMm3=Math.max(MOLD_GEOMETRY_TOLERANCE_MM**3,sourceSolidVolumeMm3*1e-10);
  if(Math.abs(partitionedVolumeMm3-sourceSolidVolumeMm3)>toleranceMm3)throw Object.assign(new Error("Mold bodies do not completely partition the K2 source solid."),{code:"mold_partition_incomplete"});
  return {sourceSolidVolumeMm3,partitionedVolumeMm3,toleranceMm3};
}

/** Canonical unpartitioned K2 source body used by preview and execution. */
export function createWholeMoldBody(
  definition: ReferenceMoldDefinition,
  identity: WholeMoldBodyIdentity,
): MoldBodyData & { readonly geometryVersion?: string } {
  const outer = definition.referenceMoldBlock.bounds;
  if (!finiteBounds(outer)) throw new Error("Reference mold block bounds are invalid.");
  const coordinates = {
    x: [outer.min.x, outer.max.x],
    y: [outer.min.y, outer.max.y],
    z: [outer.min.z, outer.max.z],
  };
  const result = meshCells([{ ix: 0, iy: 0, iz: 0 }], coordinates);
  return {
    id: identity.id,
    name: identity.name,
    visible: true,
    bounds: result.bounds,
    centroid: {
      x: (result.bounds.min.x + result.bounds.max.x) / 2,
      y: (result.bounds.min.y + result.bounds.max.y) / 2,
      z: (result.bounds.min.z + result.bounds.max.z) / 2,
    },
    triangleCount: result.mesh.indices.length / 3,
    volumeMm3: result.volume,
    watertight: true,
    mesh: result.mesh,
    ...(identity.geometryVersion === undefined
      ? {}
      : { geometryVersion: identity.geometryVersion }),
  };
}

function partitionReferenceMoldBlock(
  definition: ReferenceMoldDefinition,
  planes: readonly CutPlaneData[],
  coordinateSeeds: Readonly<Record<Axis, readonly number[]>>,
): MoldPartitionResult {
  const outer=definition.referenceMoldBlock.bounds;
  if (!finiteBounds(outer)) throw new Error("K2 bounds are invalid.");
  if (!planes.length) throw new Error("Select at least one K1 face.");
  const coordinates={x:unique([outer.min.x,...coordinateSeeds.x,outer.max.x,...planes.filter(p=>p.axis==="x").map(p=>p.coordinate)]),y:unique([outer.min.y,...coordinateSeeds.y,outer.max.y,...planes.filter(p=>p.axis==="y").map(p=>p.coordinate)]),z:unique([outer.min.z,...coordinateSeeds.z,outer.max.z,...planes.filter(p=>p.axis==="z").map(p=>p.coordinate)])};
  const planeCoordinates = new Set(planes.map(p=>`${p.axis}:${p.coordinate}`)); const cells: Cell[]=[];
  for(let ix=0;ix<coordinates.x.length-1;ix++)for(let iy=0;iy<coordinates.y.length-1;iy++)for(let iz=0;iz<coordinates.z.length-1;iz++)cells.push({ix,iy,iz});
  const remaining=new Map(cells.map(c=>[key(c),c])); const groups: Cell[][]=[]; const axes:[Axis,keyof Cell][]=[["x","ix"],["y","iy"],["z","iz"]];
  while(remaining.size){const seed=remaining.values().next().value as Cell; const group:Cell[]=[]; const queue=[seed]; remaining.delete(key(seed)); while(queue.length){const c=queue.pop()!;group.push(c);for(const [axis,index] of axes)for(const direction of [-1,1]){const n={...c,[index]:c[index]+direction};const boundary=coordinates[axis][direction>0?c[index]+1:c[index]]!;if(planeCoordinates.has(`${axis}:${boundary}`))continue;const found=remaining.get(key(n));if(found){remaining.delete(key(n));queue.push(found);}}}groups.push(group);}
  const sourceSelectedFaceSignature=planes.map(p=>p.sourceFace).join(":");
  const bodies=groups.map(mesh=>meshCells(mesh,coordinates)).filter(r=>r.volume>MOLD_GEOMETRY_TOLERANCE_MM).sort((a,b)=>((a.bounds.min.x+a.bounds.max.x)-(b.bounds.min.x+b.bounds.max.x))||((a.bounds.min.y+a.bounds.max.y)-(b.bounds.min.y+b.bounds.max.y))||((a.bounds.min.z+a.bounds.max.z)-(b.bounds.min.z+b.bounds.max.z))).map((r,i)=>({id:`${definition.definitionId}:mold:${i+1}`,name:`Mold ${i+1}`,visible:true,bounds:r.bounds,centroid:{x:(r.bounds.min.x+r.bounds.max.x)/2,y:(r.bounds.min.y+r.bounds.max.y)/2,z:(r.bounds.min.z+r.bounds.max.z)/2},generationOrder:i+1,sourceSelectedFaceSignature,triangleCount:r.mesh.indices.length/3,volumeMm3:r.volume,watertight:true as const,mesh:r.mesh}));
  const coverage=validateMoldPartitionCoverage(outer,bodies);
  return {bodies,sourceSolidVolumeMm3:coverage.sourceSolidVolumeMm3,partitionedVolumeMm3:coverage.partitionedVolumeMm3,coordinateSpace:"mold-local",strategy:"orthogonal"};
}

/** Stage A: partitions the complete K2 source solid. K1 is a reference envelope, not a pre-cut cavity. */
export function partitionOrthogonalMold(definition: ReferenceMoldDefinition, planes: readonly CutPlaneData[]): MoldPartitionResult {
  const outer=definition.referenceMoldBlock.bounds, inner=definition.selectionBoxBounds;
  if (!finiteBounds(outer)||!finiteBounds(inner)||(["x","y","z"] as const).some(a=>inner.min[a]<=outer.min[a]+MOLD_GEOMETRY_TOLERANCE_MM||inner.max[a]>=outer.max[a]-MOLD_GEOMETRY_TOLERANCE_MM)) throw new Error("K1 must be fully contained by K2 with positive shell thickness.");
  return partitionReferenceMoldBlock(definition,planes,{
    x:[inner.min.x,inner.max.x],
    y:[inner.min.y,inner.max.y],
    z:[inner.min.z,inner.max.z],
  });
}

export function generateMoldBodies(definition: ReferenceMoldDefinition, planes: readonly CutPlaneData[]): readonly MoldBodyData[] {
  return partitionOrthogonalMold(definition,planes).bodies;
}
