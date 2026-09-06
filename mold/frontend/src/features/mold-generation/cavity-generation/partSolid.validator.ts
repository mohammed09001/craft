import { Matrix4, Vector3 } from "three";
import type { CavityGenerationInput, CavityIssue, WatertightPartSolid } from "./cavityGeneration.contracts";

export interface PartSolidValidationResult { readonly ok:boolean; readonly prepared:WatertightPartSolid|null; readonly warnings:readonly CavityIssue[]; readonly blockers:readonly CavityIssue[]; readonly openEdgeCount:number; readonly nonManifoldEdgeCount:number }

/** Backward compatibility alias */
export type A3SolidValidationResult = PartSolidValidationResult;

const issue=(severity:"warning"|"blocker",reasonCode:string,message:string):CavityIssue=>({severity,reasonCode,message});
const edgeKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;



interface EdgeTopology {
  readonly edgeUses:Map<string,number[]>;
  readonly boundaryEdges:[number,number][];
  readonly boundaryDirections:Map<string,[number,number]>;
  readonly openEdgeCount:number;
  readonly nonManifoldEdgeCount:number;
}

function buildEdgeTopology(
  indices:readonly number[],
):EdgeTopology {
  const edgeUses=new Map<string,number[]>();
  const firstDirections=new Map<string,[number,number]>();

  for(let triangleIndex=0;triangleIndex<indices.length/3;triangleIndex+=1){
    const triangle=[
      indices[triangleIndex*3]!,
      indices[triangleIndex*3+1]!,
      indices[triangleIndex*3+2]!,
    ];

    for(let edgeIndex=0;edgeIndex<3;edgeIndex+=1){
      const from=triangle[edgeIndex]!;
      const to=triangle[(edgeIndex+1)%3]!;
      const key=edgeKey(from,to);
      const uses=edgeUses.get(key)??[];

      uses.push(triangleIndex);
      edgeUses.set(key,uses);

      if(!firstDirections.has(key)){
        firstDirections.set(key,[from,to]);
      }
    }
  }

  const boundaryEdges:[number,number][]=[];
  const boundaryDirections=new Map<string,[number,number]>();
  let nonManifoldEdgeCount=0;

  for(const [key,uses] of edgeUses){
    if(uses.length===1){
      const direction=firstDirections.get(key);

      if(direction!==undefined){
        boundaryEdges.push(direction);
        boundaryDirections.set(key,direction);
      }
    }else if(uses.length>2){
      nonManifoldEdgeCount+=1;
    }
  }

  return {
    edgeUses,
    boundaryEdges,
    boundaryDirections,
    openEdgeCount:boundaryEdges.length,
    nonManifoldEdgeCount,
  };
}

export function orientTriangularBoundaryRepair(
  loop:readonly number[],
  boundaryDirections:ReadonlyMap<string,readonly [number,number]>,
):readonly [number,number,number] {
  if(loop.length!==3){
    throw new Error("Triangular boundary repair requires exactly three vertices.");
  }

  const candidates:readonly (readonly [number,number,number])[]=[
    [loop[0]!,loop[1]!,loop[2]!],
    [loop[0]!,loop[2]!,loop[1]!],
  ];

  for(const candidate of candidates){
    let reverseMatches=0;

    for(let edgeIndex=0;edgeIndex<3;edgeIndex+=1){
      const from=candidate[edgeIndex]!;
      const to=candidate[(edgeIndex+1)%3]!;
      const existing=boundaryDirections.get(edgeKey(from,to));

      if(
        existing!==undefined&&
        existing[0]===to&&
        existing[1]===from
      ){
        reverseMatches+=1;
      }
    }

    if(reverseMatches===3){
      return candidate;
    }
  }

  throw new Error(
    "Triangular boundary orientation could not be resolved safely.",
  );
}

export interface BoundaryLoopAnalysis {
  readonly loopCount:number;
  readonly loopVertexCounts:readonly number[];
  readonly invalidOpenChains:number;
}

export interface BoundaryLoopExtraction {
  readonly loops:readonly (readonly number[])[];
  readonly invalidOpenChains:number;
}

export function extractBoundaryLoops(
  boundaryEdges:readonly (readonly [number,number])[],
):BoundaryLoopExtraction {
  const adjacency=new Map<number,number[]>();

  for(const [a,b] of boundaryEdges){
    const fromA=adjacency.get(a)??[];
    const fromB=adjacency.get(b)??[];

    fromA.push(b);
    fromB.push(a);

    adjacency.set(a,fromA);
    adjacency.set(b,fromB);
  }

  const unvisited=new Set(
    boundaryEdges.map(([a,b])=>edgeKey(a,b)),
  );
  const loops:number[][]=[];
  let invalidOpenChains=0;

  while(unvisited.size>0){
    const firstKey=unvisited.values().next().value as string;
    const [startText,nextText]=firstKey.split(":");
    const start=Number(startText);
    let previous=start;
    let current=Number(nextText);
    const loop=[start,current];

    unvisited.delete(firstKey);

    while(current!==start){
      const neighbors=adjacency.get(current)??[];
      const next=neighbors.find(
        candidate=>
          candidate!==previous&&
          unvisited.has(edgeKey(current,candidate)),
      );

      if(next===undefined){
        invalidOpenChains+=1;
        break;
      }

      unvisited.delete(edgeKey(current,next));
      previous=current;
      current=next;

      if(current!==start){
        loop.push(current);
      }

      if(loop.length>boundaryEdges.length+1){
        invalidOpenChains+=1;
        break;
      }
    }

    if(current===start){
      loops.push(loop);
    }
  }

  return {
    loops,
    invalidOpenChains,
  };
}

export function analyzeBoundaryLoops(
  boundaryEdges:readonly (readonly [number,number])[],
):BoundaryLoopAnalysis {
  const extraction=extractBoundaryLoops(boundaryEdges);
  const loopVertexCounts=extraction.loops
    .map(loop=>loop.length)
    .sort((a,b)=>a-b);

  return {
    loopCount:loopVertexCounts.length,
    loopVertexCounts,
    invalidOpenChains:extraction.invalidOpenChains,
  };
}

export function boundsFromPositions(positions:readonly number[]){
  let minX=Infinity,minY=Infinity,minZ=Infinity;
  let maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;

  for(let i=0;i<positions.length;i+=3){
    const x=positions[i]!;
    const y=positions[i+1]!;
    const z=positions[i+2]!;

    if(x<minX)minX=x;
    if(y<minY)minY=y;
    if(z<minZ)minZ=z;
    if(x>maxX)maxX=x;
    if(y>maxY)maxY=y;
    if(z>maxZ)maxZ=z;
  }

  return {
    min:{x:minX,y:minY,z:minZ},
    max:{x:maxX,y:maxY,z:maxZ},
  };
}

/** Validates, transforms to mold space, welds triangle-soup vertices, and normalizes outward winding. */
export function validateAndPreparePartSolid(input:CavityGenerationInput):PartSolidValidationResult{
  const blockers:CavityIssue[]=[];const warnings:CavityIssue[]=[];const source=input.sourcePartMesh;
  if(source.positions.length<9||source.positions.length%3!==0)blockers.push(issue("blocker","part_solid_empty","Uploaded model has no valid triangles."));
  if(source.indices.length<3||source.indices.length%3!==0)blockers.push(issue("blocker","part_solid_indices_invalid","Uploaded model triangle indices are invalid."));
  if(!source.positions.every(Number.isFinite))blockers.push(issue("blocker","part_solid_non_finite_vertex","Uploaded model contains non-finite coordinates."));
  if(!source.indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<source.positions.length/3))blockers.push(issue("blocker","part_solid_triangle_reference_invalid","Uploaded model contains invalid triangle references."));
  if(blockers.length)return {ok:false,prepared:null,warnings,blockers,openEdgeCount:0,nonManifoldEdgeCount:0};
  const localToMold=new Matrix4().fromArray([...input.coordinateFrame.moldFromWorld]).multiply(new Matrix4().fromArray([...source.transform]));
  if(!localToMold.elements.every(Number.isFinite)||Math.abs(localToMold.determinant())<=1e-12)return {ok:false,prepared:null,warnings,blockers:[issue("blocker","part_solid_transform_invalid","Uploaded model transform is invalid.")],openEdgeCount:0,nonManifoldEdgeCount:0};
  const tolerance=Math.max(input.tolerancePolicy?.weldToleranceMm??input.geometryToleranceMm,1e-9);
  const areaTolerance=input.tolerancePolicy?.areaToleranceMm2??tolerance*tolerance;
  const volumeTolerance=input.tolerancePolicy?.volumeToleranceMm3??tolerance**3;
  const positions:number[]=[];const indices:number[]=[];const spatialCells=new Map<string,number[]>();const sourceToWelded=new Map<number,number>();
  const cell=(x:number,y:number,z:number)=>`${x}:${y}:${z}`;
  const vertex=(sourceIndex:number)=>{
    const prior=sourceToWelded.get(sourceIndex);if(prior!==undefined)return prior;
    const p=new Vector3(source.positions[sourceIndex*3]!,source.positions[sourceIndex*3+1]!,source.positions[sourceIndex*3+2]!).applyMatrix4(localToMold);
    const cx=Math.floor(p.x/tolerance),cy=Math.floor(p.y/tolerance),cz=Math.floor(p.z/tolerance);
    let target:number|undefined;let bestDistance=Infinity;
    for(let x=cx-1;x<=cx+1;x+=1)for(let y=cy-1;y<=cy+1;y+=1)for(let z=cz-1;z<=cz+1;z+=1){
      for(const candidate of spatialCells.get(cell(x,y,z))??[]){
        const dx=positions[candidate*3]!-p.x,dy=positions[candidate*3+1]!-p.y,dz=positions[candidate*3+2]!-p.z;
        const distance=Math.hypot(dx,dy,dz);
        if(distance<=tolerance&&(distance<bestDistance||(distance===bestDistance&&candidate<(target??Infinity)))){target=candidate;bestDistance=distance;}
      }
    }
    if(target===undefined){target=positions.length/3;positions.push(p.x,p.y,p.z);const key=cell(cx,cy,cz);spatialCells.set(key,[...(spatialCells.get(key)??[]),target]);}
    sourceToWelded.set(sourceIndex,target);return target;
  };
  const orientationKey=(a:number,b:number,c:number)=>{const rotations:[number,number,number][]=[[a,b,c],[b,c,a],[c,a,b]];rotations.sort((l,r)=>l[0]-r[0]||l[1]-r[1]||l[2]-r[2]);return rotations[0]!.join(":");};
  const faceOrientations=new Map<string,string>();let degenerateCount=0,duplicateCount=0,oppositeDuplicateCount=0;
  for(let i=0;i<source.indices.length;i+=3){
    const a=vertex(source.indices[i]!),b=vertex(source.indices[i+1]!),c=vertex(source.indices[i+2]!);if(a===b||b===c||c===a){degenerateCount+=1;continue;}
    const pa=new Vector3(positions[a*3],positions[a*3+1],positions[a*3+2]),pb=new Vector3(positions[b*3],positions[b*3+1],positions[b*3+2]),pc=new Vector3(positions[c*3],positions[c*3+1],positions[c*3+2]);
    if(pb.sub(pa).cross(pc.sub(pa)).length()<=areaTolerance){degenerateCount+=1;continue;}
    const unordered=[a,b,c].sort((x,y)=>x-y).join(":");const orientation=orientationKey(a,b,c);const existing=faceOrientations.get(unordered);
    if(existing!==undefined){if(existing===orientation)duplicateCount+=1;else oppositeDuplicateCount+=1;continue;}
    faceOrientations.set(unordered,orientation);indices.push(a,b,c);
  }
  if(degenerateCount)warnings.push(issue("warning","part_solid_degenerate_faces_removed",`${degenerateCount} degenerate triangle${degenerateCount===1?" was":"s were"} removed.`));
  if(duplicateCount)warnings.push(issue("warning","part_solid_duplicate_faces_removed",`${duplicateCount} duplicate triangle${duplicateCount===1?" was":"s were"} removed.`));
  if(oppositeDuplicateCount)blockers.push(issue("blocker","part_solid_opposite_duplicate_faces",`${oppositeDuplicateCount} opposite duplicate triangle${oppositeDuplicateCount===1?" creates":"s create"} ambiguous internal sheets.`));
  if(indices.length<12)return {ok:false,prepared:null,warnings,blockers:[issue("blocker","part_solid_no_meaningful_volume","Uploaded model has no meaningful closed volume.")],openEdgeCount:0,nonManifoldEdgeCount:0};
  let topology=buildEdgeTopology(indices);
  let edgeUses=topology.edgeUses;
  let boundaryEdges=topology.boundaryEdges;
  let nonManifoldEdgeCount=topology.nonManifoldEdgeCount;
  let openEdgeCount=topology.openEdgeCount;
  let boundaryAnalysis=analyzeBoundaryLoops(boundaryEdges);

  if(
    nonManifoldEdgeCount===0&&
    boundaryAnalysis.invalidOpenChains===0&&
    boundaryAnalysis.loopCount>0&&
    boundaryAnalysis.loopVertexCounts.every(size=>size===3)&&
    boundaryAnalysis.loopCount<=8
  ){
    const extraction=extractBoundaryLoops(boundaryEdges);
    const meshBounds=boundsFromPositions(positions);
    const dimensions=[meshBounds.max.x-meshBounds.min.x,meshBounds.max.y-meshBounds.min.y,meshBounds.max.z-meshBounds.min.z];
    const maximumRepairDoubleArea=Math.max(areaTolerance*100,2*(dimensions[0]!*dimensions[1]!+dimensions[1]!*dimensions[2]!+dimensions[2]!*dimensions[0]!)*0.2);

    try{
      for(const loop of extraction.loops){
        const [a,b,c]=loop;const pa=new Vector3(positions[a!*3],positions[a!*3+1],positions[a!*3+2]),pb=new Vector3(positions[b!*3],positions[b!*3+1],positions[b!*3+2]),pc=new Vector3(positions[c!*3],positions[c!*3+1],positions[c!*3+2]);
        if(pb.sub(pa).cross(pc.sub(pa)).length()>maximumRepairDoubleArea)throw new Error("Triangular boundary exceeds the safe repair size.");
        const repair=orientTriangularBoundaryRepair(
          loop,
          topology.boundaryDirections,
        );

        indices.push(
          repair[0],
          repair[1],
          repair[2],
        );
      }
    }catch{
      blockers.push(
        issue(
          "blocker",
          "part_solid_hole_repair_orientation_failed",
          "Small triangular holes were found, but their orientation could not be repaired safely.",
        ),
      );
    }

    if(blockers.length===0){
      topology=buildEdgeTopology(indices);
      edgeUses=topology.edgeUses;
      boundaryEdges=topology.boundaryEdges;
      openEdgeCount=topology.openEdgeCount;
      nonManifoldEdgeCount=topology.nonManifoldEdgeCount;
      boundaryAnalysis=analyzeBoundaryLoops(boundaryEdges);

      if(openEdgeCount===0&&nonManifoldEdgeCount===0){
        warnings.push(
          issue(
            "warning",
            "part_solid_triangular_holes_repaired",
            `${extraction.loops.length} small triangular hole${extraction.loops.length===1?" was":"s were"} repaired automatically.`,
          ),
        );
      }else{
        blockers.push(
          issue(
            "blocker",
            "part_solid_hole_repair_invalid",
            `Automatic hole repair did not produce a closed manifold. Open edges: ${openEdgeCount}. Non-manifold edges: ${nonManifoldEdgeCount}.`,
          ),
        );
      }
    }
  }
  if(openEdgeCount){
    blockers.push(
      issue(
        "blocker",
        "part_solid_open_mesh",
        `Uploaded model is not a closed solid. Open edges: ${openEdgeCount}. Boundary loops: ${boundaryAnalysis.loopCount}. Loop sizes: ${boundaryAnalysis.loopVertexCounts.join(", ")||"none"}.`,
      ),
    );
  }

  if(nonManifoldEdgeCount){
    blockers.push(
      issue(
        "blocker",
        "part_solid_non_manifold",
        `Uploaded model has non-manifold edges: ${nonManifoldEdgeCount}.`,
      ),
    );
  }
  const neighbors=Array.from({length:indices.length/3},()=>new Set<number>());for(const uses of edgeUses.values())for(const a of uses)for(const b of uses)if(a!==b)neighbors[a]!.add(b);const seen=new Set<number>();const components:number[][]=[];for(let t=0;t<neighbors.length;t+=1)if(!seen.has(t)){const component:number[]=[];const stack=[t];seen.add(t);while(stack.length){const current=stack.pop()!;component.push(current);for(const n of neighbors[current]!)if(!seen.has(n)){seen.add(n);stack.push(n);}}components.push(component);}
  const connectedComponentCount=components.length;
  const triangleComponents=new Map<number,number>();components.forEach((component,componentIndex)=>component.forEach(triangleIndex=>triangleComponents.set(triangleIndex,componentIndex)));
  const vertexComponents=new Map<number,Set<number>>();for(let triangleIndex=0;triangleIndex<indices.length/3;triangleIndex+=1){const componentIndex=triangleComponents.get(triangleIndex)!;for(let corner=0;corner<3;corner+=1){const vertexIndex=indices[triangleIndex*3+corner]!;const memberships=vertexComponents.get(vertexIndex)??new Set<number>();memberships.add(componentIndex);vertexComponents.set(vertexIndex,memberships);}}
  if([...vertexComponents.values()].some(memberships=>memberships.size>1))blockers.push(issue("blocker","part_solid_bow_tie_vertex","Uploaded model contains solids connected only through a bow-tie vertex."));
  const componentBounds=components.map(component=>{let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;for(const triangleIndex of component)for(let corner=0;corner<3;corner+=1){const vertexIndex=indices[triangleIndex*3+corner]!,x=positions[vertexIndex*3]!,y=positions[vertexIndex*3+1]!,z=positions[vertexIndex*3+2]!;minX=Math.min(minX,x);minY=Math.min(minY,y);minZ=Math.min(minZ,z);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);maxZ=Math.max(maxZ,z);}return {min:{x:minX,y:minY,z:minZ},max:{x:maxX,y:maxY,z:maxZ}};});
  const componentPairCount=connectedComponentCount*(connectedComponentCount-1)/2;
  if(componentPairCount>10_000)blockers.push(issue("blocker","part_solid_audit_budget_exceeded","Geometry audit exceeded the safe connected-component comparison budget."));
  else for(let left=0;left<componentBounds.length;left+=1)for(let right=left+1;right<componentBounds.length;right+=1)if(componentBounds[left]&&componentBounds[right]&&componentBounds[left]!.min.x<componentBounds[right]!.max.x-tolerance&&componentBounds[left]!.max.x>componentBounds[right]!.min.x+tolerance&&componentBounds[left]!.min.y<componentBounds[right]!.max.y-tolerance&&componentBounds[left]!.max.y>componentBounds[right]!.min.y+tolerance&&componentBounds[left]!.min.z<componentBounds[right]!.max.z-tolerance&&componentBounds[left]!.max.z>componentBounds[right]!.min.z+tolerance)blockers.push(issue("blocker","part_solid_overlapping_components","Uploaded model contains overlapping or nested closed components that cannot be subtracted safely."));
  if(connectedComponentCount>1)warnings.push(issue("warning","part_solid_multiple_components",`Uploaded model contains ${connectedComponentCount} closed components.`));
  let totalVolume=0;for(const component of components){let signedVolume=0;for(const triangleIndex of component){const i=triangleIndex*3,a=indices[i]!,b=indices[i+1]!,c=indices[i+2]!;const ax=positions[a*3]!,ay=positions[a*3+1]!,az=positions[a*3+2]!,bx=positions[b*3]!,by=positions[b*3+1]!,bz=positions[b*3+2]!,cx=positions[c*3]!,cy=positions[c*3+1]!,cz=positions[c*3+2]!;signedVolume+=(ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;}if(!Number.isFinite(signedVolume)||Math.abs(signedVolume)<=volumeTolerance){blockers.push(issue("blocker","part_solid_zero_volume_component","Uploaded model contains a component with no meaningful enclosed volume."));continue;}if(signedVolume<0)for(const triangleIndex of component){const i=triangleIndex*3,swap=indices[i+1]!;indices[i+1]=indices[i+2]!;indices[i+2]=swap;}totalVolume+=Math.abs(signedVolume);}
  if(blockers.length)return {ok:false,prepared:null,warnings,blockers,openEdgeCount,nonManifoldEdgeCount};
  const bounds=boundsFromPositions(positions);
  const prepared:WatertightPartSolid={mesh:{positions,indices},bounds,volumeMm3:totalVolume,triangleCount:indices.length/3,connectedComponentCount,watertight:true,manifold:true,warnings};return {ok:true,prepared,warnings,blockers:[],openEdgeCount,nonManifoldEdgeCount};
}









