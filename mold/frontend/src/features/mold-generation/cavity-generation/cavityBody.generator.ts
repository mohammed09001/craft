import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { CavityBodyValidation, CavityGenerationInput, CavityGenerationResult, CavityIssue, CavityMoldBodyData, CavitySubtractionDiagnostics, CavityToolData } from "./cavityGeneration.contracts";
import { boundsFromManifold, getManifoldModule, manifoldFromPayload, payloadFromManifold } from "./manifold.engine";
import { cavityBodyGeometryVersion } from "./cavityGeneration.signature";

const issue=(severity:"warning"|"blocker",reasonCode:string,message:string):CavityIssue=>({severity,reasonCode,message});
const overlaps=(a:Bounds3,b:Bounds3,t:number)=>a.min.x<b.max.x-t&&a.max.x>b.min.x+t&&a.min.y<b.max.y-t&&a.max.y>b.min.y+t&&a.min.z<b.max.z-t&&a.max.z>b.min.z+t;
const containedBy=(inner:Bounds3,outer:Bounds3,t:number)=>inner.min.x>=outer.min.x-t&&inner.min.y>=outer.min.y-t&&inner.min.z>=outer.min.z-t&&inner.max.x<=outer.max.x+t&&inner.max.y<=outer.max.y+t&&inner.max.z<=outer.max.z+t;
const codedError=(code:string,message:string)=>Object.assign(new Error(message),{code});
const payloadBounds=(mesh:MoldMeshPayload):Bounds3=>{let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;for(let index=0;index<mesh.positions.length;index+=3){const x=mesh.positions[index]!,y=mesh.positions[index+1]!,z=mesh.positions[index+2]!;minX=Math.min(minX,x);minY=Math.min(minY,y);minZ=Math.min(minZ,z);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);maxZ=Math.max(maxZ,z);}return {min:{x:minX,y:minY,z:minZ},max:{x:maxX,y:maxY,z:maxZ}};};
const boundsMatch=(left:Bounds3,right:Bounds3,t:number)=>Math.abs(left.min.x-right.min.x)<=t&&Math.abs(left.min.y-right.min.y)<=t&&Math.abs(left.min.z-right.min.z)<=t&&Math.abs(left.max.x-right.max.x)<=t&&Math.abs(left.max.y-right.max.y)<=t&&Math.abs(left.max.z-right.max.z)<=t;

/** Verifies all Stage B payloads use the same mold-local coordinate space before Boolean work begins. */
export function assertCavityCoordinateAlignment(input:CavityGenerationInput,tool:CavityToolData):void {
  const k1 = input.partBoundingBox;
  const k2 = input.referenceMoldBlockBounds;
  const tolerance=input.tolerancePolicy?.linearToleranceMm??input.geometryToleranceMm;
  if(!containedBy(k1,k2,tolerance))throw codedError("cavity_coordinate_mismatch","K1 reference bounds are not contained by K2 bounds.");
  if(!overlaps(tool.bounds,k1,tolerance))throw codedError("cavity_coordinate_mismatch","Cavity tool bounds do not overlap the K1 reference envelope.");
  if(!boundsMatch(payloadBounds(tool.mesh),tool.bounds,tolerance))throw codedError("cavity_coordinate_mismatch","Cavity tool mesh bounds do not match its declared bounds.");
  for(const source of input.moldBodies)if(!boundsMatch(payloadBounds(source.mesh),source.bounds,tolerance))throw codedError("cavity_coordinate_mismatch",`${source.name} mesh bounds do not match its declared bounds.`);
  if(!input.moldBodies.some(source=>overlaps(source.bounds,tool.bounds,tolerance)))throw codedError("cavity_no_material_intersection","The cavity tool did not intersect any mold material. Verify mold-body construction and coordinate alignment.");
}

export interface FragmentVolumeClassification {
  readonly meaningfulVolumes:readonly number[];
  readonly discardedVolumes:readonly number[];
}

export interface ComponentOrderingDescriptor {
  readonly volumeMm3:number;
  readonly bounds:Bounds3;
}

function quantizeComponentValue(
  value:number,
  tolerance:number,
):number {
  return Math.round(value/tolerance);
}

export function compareComponentDescriptors(
  left:ComponentOrderingDescriptor,
  right:ComponentOrderingDescriptor,
  geometryToleranceMm:number,
):number {
  if(
    !Number.isFinite(geometryToleranceMm)||
    geometryToleranceMm<=0
  ){
    throw new Error(
      "Component ordering tolerance must be positive.",
    );
  }

  const volumeToleranceMm3=geometryToleranceMm**3;

  const comparisons=[
    quantizeComponentValue(
      right.volumeMm3,
      volumeToleranceMm3,
    )-
    quantizeComponentValue(
      left.volumeMm3,
      volumeToleranceMm3,
    ),
    quantizeComponentValue(
      left.bounds.min.x,
      geometryToleranceMm,
    )-
    quantizeComponentValue(
      right.bounds.min.x,
      geometryToleranceMm,
    ),
    quantizeComponentValue(
      left.bounds.min.y,
      geometryToleranceMm,
    )-
    quantizeComponentValue(
      right.bounds.min.y,
      geometryToleranceMm,
    ),
    quantizeComponentValue(
      left.bounds.min.z,
      geometryToleranceMm,
    )-
    quantizeComponentValue(
      right.bounds.min.z,
      geometryToleranceMm,
    ),
    quantizeComponentValue(
      left.bounds.max.x,
      geometryToleranceMm,
    )-
    quantizeComponentValue(
      right.bounds.max.x,
      geometryToleranceMm,
    ),
    quantizeComponentValue(
      left.bounds.max.y,
      geometryToleranceMm,
    )-
    quantizeComponentValue(
      right.bounds.max.y,
      geometryToleranceMm,
    ),
    quantizeComponentValue(
      left.bounds.max.z,
      geometryToleranceMm,
    )-
    quantizeComponentValue(
      right.bounds.max.z,
      geometryToleranceMm,
    ),
  ];

  for(const comparison of comparisons){
    if(comparison!==0){
      return comparison;
    }
  }

  return 0;
}

export interface FragmentBodyIdentity {
  readonly id:string;
  readonly name:string;
}

export function buildFragmentBodyIdentity(
  parentBodyId:string,
  parentBodyName:string,
  componentIndex:number,
  componentCount:number,
):FragmentBodyIdentity {
  if(
    parentBodyId.trim().length===0||
    parentBodyName.trim().length===0||
    !Number.isSafeInteger(componentIndex)||
    !Number.isSafeInteger(componentCount)||
    componentIndex<0||
    componentCount<1||
    componentIndex>=componentCount
  ){
    throw new Error("Fragment body identity inputs are invalid.");
  }

  if(componentCount===1){
    return {
      id:parentBodyId,
      name:parentBodyName,
    };
  }

  const partNumber=componentIndex+1;

  return {
    id:`${parentBodyId}:cavity-component:${partNumber}`,
    name:`${parentBodyName} — Part ${partNumber}`,
  };
}

export function classifyFragmentVolumes(
  volumes:readonly number[],
  minimumVolumeMm3:number,
):FragmentVolumeClassification {
  if(
    !Number.isFinite(minimumVolumeMm3)||
    minimumVolumeMm3<0||
    volumes.some(volume=>!Number.isFinite(volume)||volume<0)
  ){
    throw new Error("Fragment volume classification inputs are invalid.");
  }

  const meaningfulVolumes:number[]=[];
  const discardedVolumes:number[]=[];

  for(const volume of volumes){
    if(volume>minimumVolumeMm3){
      meaningfulVolumes.push(volume);
    }else{
      discardedVolumes.push(volume);
    }
  }

  meaningfulVolumes.sort((a,b)=>b-a);
  discardedVolumes.sort((a,b)=>b-a);

  return {
    meaningfulVolumes,
    discardedVolumes,
  };
}
export function topology(mesh:MoldMeshPayload){const uses=new Map<string,number>();for(let i=0;i<mesh.indices.length;i+=3){const tri=[mesh.indices[i]!,mesh.indices[i+1]!,mesh.indices[i+2]!];for(let e=0;e<3;e+=1){const a=tri[e]!,b=tri[(e+1)%3]!,key=a<b?`${a}:${b}`:`${b}:${a}`;uses.set(key,(uses.get(key)??0)+1);}}return {openEdgeCount:[...uses.values()].filter(n=>n===1).length,nonManifoldEdgeCount:[...uses.values()].filter(n=>n>2).length};}
function wallDistance(tool:Bounds3,k2:Bounds3){return Math.min(tool.min.x-k2.min.x,k2.max.x-tool.max.x,tool.min.y-k2.min.y,k2.max.y-tool.max.y,tool.min.z-k2.min.z,k2.max.z-tool.max.z);}
export function validateCavityContainment(input:CavityGenerationInput,tool:CavityToolData){const distance=wallDistance(tool.bounds,input.referenceMoldBlockBounds);const blockers:CavityIssue[]=[];const warnings:CavityIssue[]=[];if(distance<=input.geometryToleranceMm)blockers.push(issue("blocker","cavity_outer_breakthrough","Cavity extends outside or touches the mold outer surface. Increase outer mold clearance."));else if(distance<input.minimumWallMm)warnings.push(issue("warning","cavity_thin_wall",`Conservative outer-wall clearance is ${distance.toFixed(3)} mm.`));return {distance,warnings,blockers};}
export async function generateCavityBodies(
  input:CavityGenerationInput,
  tool:CavityToolData,
):Promise<CavityGenerationResult>{
  const started=performance.now();
  assertCavityCoordinateAlignment(input,tool);
  const containment=validateCavityContainment(input,tool);

  if(containment.blockers.length){
    throw new Error(containment.blockers[0]!.message);
  }

  const module=await getManifoldModule();
  const untaggedToolSolid=manifoldFromPayload(
    module,
    tool.mesh,
    input.geometryToleranceMm,
  );
  const toolSolid=untaggedToolSolid.asOriginal();
  const cavityRoleMap:Record<number,"cavity-surface">={
    [(toolSolid as unknown as {originalID():number}).originalID()]:"cavity-surface",
  };
  const bodies:CavityMoldBodyData[]=[];
  const generationWarnings:CavityIssue[]=[
    ...containment.warnings,
  ];
  let originalVolumeTotal=0;
  const affectedSourceBodyIds=new Set<string>();

  try{
    for(const source of input.moldBodies){
      const candidate=overlaps(
        source.bounds,
        tool.bounds,
        input.geometryToleranceMm,
      );
      const sourceSolid=manifoldFromPayload(
        module,
        source.mesh,
        input.tolerancePolicy?.booleanToleranceMm??input.geometryToleranceMm,
      );

      try{
        let result=sourceSolid;

        if(candidate){
          result=sourceSolid.subtract(toolSolid);
        }

        try{
          const status=result.status();

          if(status!=="NoError"||result.isEmpty()){
            throw new Error(
              `Boolean subtraction failed for ${source.name}.`,
            );
          }

          const resultVolume=result.volume();
          const sourceVolume=sourceSolid.volume();
          originalVolumeTotal+=sourceVolume;
          const volumeTolerance=
            input.tolerancePolicy?.affectedVolumeToleranceMm3??
            input.geometryToleranceMm**3;

          if(resultVolume>sourceVolume+volumeTolerance){
            throw new Error(
              `Boolean subtraction increased material volume for ${source.name}.`,
            );
          }

          const affected=
            sourceVolume-resultVolume>volumeTolerance;
          if(affected)affectedSourceBodyIds.add(source.id);

          if(!affected){
            const topo=topology(source.mesh);
            const validation:CavityBodyValidation={bodyId:source.id,bodyName:source.name,parentBodyId:source.id,cavityAffected:false,finiteGeometry:true,validBounds:true,positiveVolume:true,volumeMm3:source.volumeMm3,triangleCount:source.triangleCount,connectedComponentCount:1,watertight:source.watertight,manifold:source.watertight,openEdgeCount:topo.openEdgeCount,nonManifoldEdgeCount:topo.nonManifoldEdgeCount,minimumWallMm:containment.distance,warnings:containment.warnings,blockers:[],reasonCodes:["cavity_no_intersection","cavity_source_geometry_preserved"]};
            bodies.push({...source,visible:true,parentBodyId:source.id,cavityAffected:false,cavityValidation:validation});
            continue;
          }

          const components=result.decompose();

          try{
            const decomposedVolumes=components.map(component=>component.volume());
            const containsInnerShell=decomposedVolumes.some(volume=>volume<-(input.tolerancePolicy?.volumeToleranceMm3??input.geometryToleranceMm**3));
            const componentEntries=containsInnerShell
              ?[{component:result,volume:resultVolume,bounds:boundsFromManifold(result)}]
              :components.map((component,index)=>({component,volume:decomposedVolumes[index]!,bounds:boundsFromManifold(component)}));
            const componentVolumes=componentEntries.map(entry=>entry.volume);
            const minimumFragmentVolumeMm3=
              Math.max(
                input.tolerancePolicy?.minimumFragmentVolumeMm3??
                  input.geometryToleranceMm**3,
                sourceVolume*1e-10,
              );
            const classification=classifyFragmentVolumes(
              componentVolumes,
              minimumFragmentVolumeMm3,
            );
            const meaningfulComponents=componentEntries
              .filter(
                entry=>
                  entry.volume>minimumFragmentVolumeMm3,
              )
              .sort(
                (left,right)=>
                  compareComponentDescriptors(
                    {
                      volumeMm3:left.volume,
                      bounds:left.bounds,
                    },
                    {
                      volumeMm3:right.volume,
                      bounds:right.bounds,
                    },
                    input.geometryToleranceMm,
                  ),
              );

            if(meaningfulComponents.length===0){
              throw new Error(
                `${source.name} has no meaningful material solid after cavity subtraction.`,
              );
            }

            if(classification.discardedVolumes.length>0){
              generationWarnings.push(
                issue(
                  "warning",
                  "cavity_negligible_fragments_discarded",
                  `${source.name}: ${classification.discardedVolumes.length} negligible fragment${classification.discardedVolumes.length===1?" was":"s were"} discarded; largest was ${classification.discardedVolumes[0]!.toPrecision(4)} mm³.`,
                ),
              );
            }

            if(meaningfulComponents.length>1){
              generationWarnings.push(
                issue(
                  "warning",
                  "cavity_material_fragmentation",
                  `${source.name} separated into ${meaningfulComponents.length} meaningful material components.`,
                ),
              );
            }

            for(
              let componentIndex=0;
              componentIndex<meaningfulComponents.length;
              componentIndex+=1
            ){
              const entry=meaningfulComponents[componentIndex]!;
              const component=entry.component;
              const identity=buildFragmentBodyIdentity(
                source.id,
                source.name,
                componentIndex,
                meaningfulComponents.length,
              );
              const mesh=payloadFromManifold(component,cavityRoleMap);
              const bounds=entry.bounds;
              const topo=topology(mesh);
              const blockers:CavityIssue[]=[];

              if(
                !mesh.positions.every(Number.isFinite)||
                !mesh.indices.every(index=>Number.isSafeInteger(index)&&index>=0&&index<mesh.positions.length/3)
              ){
                blockers.push(
                  issue(
                    "blocker",
                    "body_non_finite",
                    "Boolean result contains non-finite geometry.",
                  ),
                );
              }

              if(!containedBy(bounds,input.referenceMoldBlockBounds,input.tolerancePolicy?.containmentToleranceMm??input.geometryToleranceMm)){
                blockers.push(issue("blocker","body_outside_k2","Boolean result extends outside the reference mold bounds."));
              }

              if(
                entry.volume<=
                input.geometryToleranceMm**3
              ){
                blockers.push(
                  issue(
                    "blocker",
                    "body_zero_volume",
                    "Boolean result has no positive volume.",
                  ),
                );
              }

              if(
                topo.openEdgeCount||
                topo.nonManifoldEdgeCount
              ){
                blockers.push(
                  issue(
                    "blocker",
                    "body_not_manifold",
                    "Boolean result is not a closed manifold.",
                  ),
                );
              }

              if(blockers.length){
                throw new Error(
                  `${identity.name}: ${blockers[0]!.message}`,
                );
              }

              const validation:CavityBodyValidation={
                bodyId:identity.id,
                bodyName:identity.name,
                parentBodyId:source.id,
                cavityAffected:affected,
                finiteGeometry:true,
                validBounds:true,
                positiveVolume:true,
                volumeMm3:entry.volume,
                triangleCount:mesh.indices.length/3,
                connectedComponentCount:1,
                watertight:true,
                manifold:true,
                openEdgeCount:topo.openEdgeCount,
                nonManifoldEdgeCount:
                  topo.nonManifoldEdgeCount,
                minimumWallMm:containment.distance,
                warnings:containment.warnings,
                blockers:[],
                reasonCodes:[
                  affected
                    ?"cavity_subtracted"
                    :"cavity_no_intersection",
                  meaningfulComponents.length>1
                    ?"cavity_component_separated"
                    :"cavity_single_component",
                ],
              };

              bodies.push({
                ...source,
                id:identity.id,
                name:identity.name,
                visible:true,
                mesh,
                bounds,
                centroid:{
                  x:(bounds.min.x+bounds.max.x)/2,
                  y:(bounds.min.y+bounds.max.y)/2,
                  z:(bounds.min.z+bounds.max.z)/2,
                },
                triangleCount:mesh.indices.length/3,
                volumeMm3:entry.volume,
                watertight:true,
                geometryVersion:cavityBodyGeometryVersion({id:identity.id,mesh,bounds}),
                parentBodyId:source.id,
                cavityAffected:affected,
                cavityValidation:validation,
              });
            }
          }finally{
            components.forEach(
              component=>component.delete(),
            );
          }
        }finally{
          if(result!==sourceSolid){
            result.delete();
          }
        }
      }finally{
        sourceSolid.delete();
      }
    }
  }finally{
    toolSolid.delete();
    untaggedToolSolid.delete();
  }

  const resultVolumeTotal=bodies.reduce((sum,body)=>sum+body.volumeMm3,0);
  const removedVolumeTotal=originalVolumeTotal-resultVolumeTotal;
  const affectedVolumeTolerance=input.tolerancePolicy?.affectedVolumeToleranceMm3??input.geometryToleranceMm**3;
  if(affectedSourceBodyIds.size===0||removedVolumeTotal<=affectedVolumeTolerance)throw codedError("cavity_no_material_intersection","The cavity tool did not intersect any mold material. Verify mold-body construction and coordinate alignment.");
  if(!Number.isFinite(originalVolumeTotal)||originalVolumeTotal<=0||!Number.isFinite(resultVolumeTotal)||resultVolumeTotal<=0||resultVolumeTotal>originalVolumeTotal+affectedVolumeTolerance)throw codedError("cavity_result_volume_invalid","Cavity subtraction produced invalid aggregate material volume.");
  if(bodies.some(body=>!body.cavityValidation.finiteGeometry||!body.cavityValidation.watertight||!body.cavityValidation.manifold||!containedBy(body.bounds,input.referenceMoldBlockBounds,input.tolerancePolicy?.containmentToleranceMm??input.geometryToleranceMm)))throw codedError("cavity_result_invalid","Cavity subtraction produced an invalid mold body.");
  if(new Set(bodies.map(body=>body.id)).size!==bodies.length)throw codedError("cavity_duplicate_body_id","Cavity subtraction produced duplicate mold-body IDs.");
  for(let left=0;left<bodies.length;left+=1)for(let right=left+1;right<bodies.length;right+=1){const leftBody=bodies[left]!,rightBody=bodies[right]!;if(!overlaps(leftBody.bounds,rightBody.bounds,input.tolerancePolicy?.linearToleranceMm??input.geometryToleranceMm))continue;const leftSolid=manifoldFromPayload(module,leftBody.mesh,input.tolerancePolicy?.booleanToleranceMm??input.geometryToleranceMm);const rightSolid=manifoldFromPayload(module,rightBody.mesh,input.tolerancePolicy?.booleanToleranceMm??input.geometryToleranceMm);let intersection:ReturnType<typeof leftSolid.intersect>|null=null;try{intersection=leftSolid.intersect(rightSolid);if(intersection.status()!=="NoError"||Math.abs(intersection.volume())>affectedVolumeTolerance)throw codedError("cavity_result_overlap","Cavity subtraction produced unexpectedly overlapping mold bodies.");}finally{intersection?.delete();leftSolid.delete();rightSolid.delete();}}
  const subtractionDiagnostics:CavitySubtractionDiagnostics={sourceBodyCount:input.moldBodies.length,affectedBodyCount:affectedSourceBodyIds.size,unaffectedBodyCount:input.moldBodies.length-affectedSourceBodyIds.size,originalVolumeMm3:originalVolumeTotal,resultVolumeMm3:resultVolumeTotal,removedVolumeMm3:removedVolumeTotal,cavityToolVolumeMm3:tool.volumeMm3};

  return {
    operationId:input.operationId,
    generationVersion:input.generationVersion,
    sourceSignature:input.upstreamInputSignature,
    implementation:"manifold-3d-wasm",
    elapsedMs:performance.now()-started,
    cavityTool:tool,
    bodies,
    warnings:generationWarnings,
    blockers:[],
    subtractionDiagnostics,
  };
}



