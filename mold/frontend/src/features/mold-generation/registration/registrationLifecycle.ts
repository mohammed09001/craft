import type { CavityToolData } from "../cavity-generation/cavityGeneration.contracts";
import { cavityBodyGeometryVersion, hashCavityValues } from "../cavity-generation/cavityGeneration.signature";
import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import type { CuttingPlaneRecord } from "../split-face/splitFace.contracts";
import type { SprueDefinition } from "../sprue-generation";
import { RegistrationGenerationService } from "./RegistrationGenerationService";
import type { MoldInterface, RegistrationManufacturingProfile, RegistrationProtectedRegion, RegistrationReport, RegistrationSourceBody } from "./registration.contracts";
import { detectMatingInterfaces } from "./registrationPlanner";
import { DefaultRegistrationToleranceResolver } from "./registrationTolerance.policy";
import {
  applyRegistrationSizingToTolerancePolicy,
  NORMAL_MOLD_REGISTRATION_SIZING_POLICY,
  type RegistrationSizingPolicy,
} from "./registrationSizing.policy";
import type { DerivedRegistrationState } from "./registrationState";

export type { DerivedRegistrationState } from "./registrationState";
export { unavailableRegistration } from "./registrationState";

export interface RegistrationDependencyInput<TBody extends MoldBodyData> {
  readonly bodies:readonly TBody[];
  readonly definition:ReferenceMoldDefinition;
  readonly cuttingPlanes:readonly CuttingPlaneRecord[];
  readonly cavityTool:CavityToolData|null;
  readonly cavityRevision:string|null;
  readonly sprues:readonly SprueDefinition[];
  readonly manufacturingProfile:RegistrationManufacturingProfile|null;
  readonly sizingPolicy?:RegistrationSizingPolicy;
}

export interface RegistrationDependencySnapshot<TBody extends MoldBodyData> {
  readonly revision:string;
  readonly bodies:readonly (TBody&RegistrationSourceBody)[];
  readonly interfaces:readonly MoldInterface[];
  readonly protectedRegions:readonly RegistrationProtectedRegion[];
  readonly manufacturingProfile:RegistrationManufacturingProfile|null;
  readonly sizingPolicy:RegistrationSizingPolicy;
}

const protectedCylinderMesh=(start:{readonly x:number;readonly y:number;readonly z:number},direction:{readonly x:number;readonly y:number;readonly z:number},depth:number,radius:number):import("../reference-mold-definition/orthogonalMold").MoldMeshPayload=>{
  const length=Math.hypot(direction.x,direction.y,direction.z),axis={x:direction.x/length,y:direction.y/length,z:direction.z/length};
  const reference=Math.abs(axis.z)<0.9?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const cross={x:reference.y*axis.z-reference.z*axis.y,y:reference.z*axis.x-reference.x*axis.z,z:reference.x*axis.y-reference.y*axis.x};
  const crossLength=Math.hypot(cross.x,cross.y,cross.z),u={x:cross.x/crossLength,y:cross.y/crossLength,z:cross.z/crossLength};
  const v={x:axis.y*u.z-axis.z*u.y,y:axis.z*u.x-axis.x*u.z,z:axis.x*u.y-axis.y*u.x};
  const positions:number[]=[],indices:number[]=[],segments=32;
  for(let ring=0;ring<2;ring+=1)for(let index=0;index<segments;index+=1){const angle=index/segments*Math.PI*2,c=Math.cos(angle)*radius,s=Math.sin(angle)*radius,offset=ring*depth;positions.push(start.x+axis.x*offset+u.x*c+v.x*s,start.y+axis.y*offset+u.y*c+v.y*s,start.z+axis.z*offset+u.z*c+v.z*s);}
  const startCenter=positions.length/3;positions.push(start.x,start.y,start.z);const endCenter=positions.length/3;positions.push(start.x+axis.x*depth,start.y+axis.y*depth,start.z+axis.z*depth);
  for(let index=0;index<segments;index+=1){const next=(index+1)%segments,a=index,b=next,c=segments+index,d=segments+next;indices.push(a,c,b,b,c,d,startCenter,a,b,endCenter,d,c);}
  return {positions,indices};
};

const sprueRegion=(sprue:SprueDefinition):RegistrationProtectedRegion=>{
  const radius=sprue.profile.mainDiameterMm/2+sprue.tolerancePolicy.surfaceToleranceMm;
  const end={x:sprue.position.x+sprue.inwardDirection.x*sprue.depthMm,y:sprue.position.y+sprue.inwardDirection.y*sprue.depthMm,z:sprue.position.z+sprue.inwardDirection.z*sprue.depthMm};
  return {id:sprue.operationId,kind:"sprue",bounds:{min:{x:Math.min(sprue.position.x,end.x)-radius,y:Math.min(sprue.position.y,end.y)-radius,z:Math.min(sprue.position.z,end.z)-radius},max:{x:Math.max(sprue.position.x,end.x)+radius,y:Math.max(sprue.position.y,end.y)+radius,z:Math.max(sprue.position.z,end.z)+radius}},mesh:protectedCylinderMesh(sprue.position,sprue.inwardDirection,sprue.depthMm,radius)};
};

const versionedBody=<TBody extends MoldBodyData>(body:TBody):TBody&RegistrationSourceBody=>({
  ...body,
  geometryVersion:"geometryVersion" in body&&typeof body.geometryVersion==="string"
    ?body.geometryVersion
    :cavityBodyGeometryVersion(body),
});

/** Captures every committed upstream dependency used by the final registration stage. */
export function buildRegistrationDependencySnapshot<TBody extends MoldBodyData>(input:RegistrationDependencyInput<TBody>):RegistrationDependencySnapshot<TBody> {
  const bodies=input.bodies.map(versionedBody);
  const sizingPolicy=input.sizingPolicy??NORMAL_MOLD_REGISTRATION_SIZING_POLICY;
  const tolerance=applyRegistrationSizingToTolerancePolicy(new DefaultRegistrationToleranceResolver().resolve(input.manufacturingProfile),sizingPolicy);
  const interfaces=detectMatingInterfaces(bodies,tolerance.booleanToleranceMm*10);
  const protectedRegions:RegistrationProtectedRegion[]=[
    ...(input.cavityTool===null?[]:[{id:"product-cavity",kind:"cavity" as const,bounds:input.cavityTool.bounds,mesh:input.cavityTool.mesh}]),
    ...input.sprues.map(sprueRegion),
  ];
  const revision=`registration-input:${hashCavityValues({
    bodies:bodies.map(body=>({id:body.id,geometryVersion:body.geometryVersion,bounds:body.bounds})),
    interfaces:interfaces.map(moldInterface=>({id:moldInterface.id,bodyAId:moldInterface.bodyAId,bodyBId:moldInterface.bodyBId,axis:moldInterface.axis,planeCoordinateMm:moldInterface.planeCoordinateMm,matingBounds:moldInterface.matingBounds})),
    mold:{definitionId:input.definition.definitionId,selectionBoxBounds:input.definition.selectionBoxBounds,referenceMoldBlock:input.definition.referenceMoldBlock},
    cuttingPlanes:input.cuttingPlanes.map(plane=>({id:plane.id,sourceFaceId:plane.sourceFaceId,axis:plane.axis,normal:plane.normal,normalizedPosition:plane.normalizedPosition,enabled:plane.enabled,creationOrder:plane.creationOrder})),
    cavityRevision:input.cavityRevision,
    cavityTool:input.cavityTool===null?null:{bounds:input.cavityTool.bounds,clearanceMm:input.cavityTool.clearanceMm,implementationMethod:input.cavityTool.implementationMethod},
    sprues:input.sprues.map(sprue=>({operationId:sprue.operationId,targetBodyIds:sprue.targetBodyIds,position:sprue.position,inwardDirection:sprue.inwardDirection,profile:sprue.profile,depthMm:sprue.depthMm,tolerancePolicy:sprue.tolerancePolicy})),
    manufacturingProfile:input.manufacturingProfile,
    sizingPolicy,
  })}`;
  return Object.freeze({revision,bodies:Object.freeze(bodies),interfaces:Object.freeze(interfaces),protectedRegions:Object.freeze(protectedRegions),manufacturingProfile:input.manufacturingProfile,sizingPolicy});
}

export interface RegistrationGenerator {
  generate<TBody extends RegistrationSourceBody>(request:import("./registration.contracts").RegistrationRequest<TBody>):Promise<import("./registration.contracts").RegistrationResult<TBody>>;
}

/** Sole lifecycle boundary for producing final derived registration geometry. */
export async function generateDerivedRegistration<TBody extends MoldBodyData>(snapshot:RegistrationDependencySnapshot<TBody>,generator:RegistrationGenerator=new RegistrationGenerationService()):Promise<DerivedRegistrationState> {
  try{
    const result=await generator.generate({sourceRevision:snapshot.revision,bodies:snapshot.bodies,protectedRegions:snapshot.protectedRegions,manufacturingProfile:snapshot.manufacturingProfile,sizingPolicy:snapshot.sizingPolicy,eligibility:"current-workflow"});
    return Object.freeze({status:result.report.status==="generated"?"generated":"blocked",revision:snapshot.revision,bodies:result.bodies,report:result.report});
  }catch(error){
    const tolerancePolicy=applyRegistrationSizingToTolerancePolicy(new DefaultRegistrationToleranceResolver().resolve(snapshot.manufacturingProfile),snapshot.sizingPolicy);
    const report:RegistrationReport=Object.freeze({schemaVersion:1,sourceRevision:snapshot.revision,status:"blocked",reasonCode:"registration_boolean_failed",message:error instanceof Error?error.message:"Registration generation failed; the valid mold was preserved.",interfaces:snapshot.interfaces,features:Object.freeze([]),tolerancePolicy,attempts:Object.freeze([])});
    return Object.freeze({status:"failed",revision:snapshot.revision,bodies:snapshot.bodies,report});
  }
}
