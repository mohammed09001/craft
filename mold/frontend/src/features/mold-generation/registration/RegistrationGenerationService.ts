import { assertManifoldStatus,boundsFromManifold,getManifoldModule,manifoldFromPayload,payloadFromManifold,type ManifoldModuleInstance,type ManifoldSolid } from "../geometry/manifold";
import type { MoldInterface,RegistrationFeature,RegistrationReasonCode,RegistrationReport,RegistrationRequest,RegistrationResult,RegistrationSourceBody,RegistrationTolerancePolicy,RegistrationToleranceResolver,RegistrationVector3 } from "./registration.contracts";
import { buildWallThicknessField,filterByWallThickness,type WallThicknessField } from "./registrationGeometryValidation";
import { detectMatingInterfaces,planRegistrationLayout,selectSpreadLayout,type RegistrationExclusionZone } from "./registrationPlanner";
import { DefaultRegistrationToleranceResolver } from "./registrationTolerance.policy";
import {
  applyRegistrationSizingToTolerancePolicy,
  NORMAL_MOLD_REGISTRATION_SIZING_POLICY,
} from "./registrationSizing.policy";

const hash=(value:string):string=>{let result=2166136261;for(let index=0;index<value.length;index+=1)result=Math.imul(result^value.charCodeAt(index),16777619);return (result>>>0).toString(16).padStart(8,"0");};
const scale=(value:RegistrationVector3,amount:number):RegistrationVector3=>({x:value.x*amount,y:value.y*amount,z:value.z*amount});
const cross=(a:RegistrationVector3,b:RegistrationVector3):RegistrationVector3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const normalize=(value:RegistrationVector3):RegistrationVector3=>{const len=Math.hypot(value.x,value.y,value.z);return len>1e-9?scale(value,1/len):{x:0,y:0,z:1};};

function buildFeatureTool(module:ManifoldModuleInstance,feature:RegistrationFeature,_moldInterface:MoldInterface,female:boolean,overlapMm:number):ManifoldSolid {
  const clearance=female?feature.clearanceMm:0;
  const nominalWidth=feature.geometry.widthMm;
  const nominalDepth=feature.geometry.depthMm;
  const taperAngleRad=(feature.geometry.taperAngleDeg*Math.PI)/180;
  const leadIn=Math.min(feature.geometry.leadInMm,nominalDepth*0.4);
  const coreDepth=nominalDepth-leadIn;
  const widthBase=nominalWidth+2*clearance;
  const widthMid=Math.max(0.5,widthBase-2*coreDepth*Math.tan(taperAngleRad));
  const widthTip=Math.max(0.2,widthMid-2*leadIn*Math.tan(taperAngleRad+0.2));

  const start=feature.startPoint;
  const end=feature.endPoint;
  const dir=feature.direction;
  const norm=feature.normal;
  const lat=normalize(cross(norm,dir));

  const halfBase=widthBase/2;
  const halfMid=widthMid/2;
  const halfTip=widthTip/2;
  const extraLen=0;

  const baseOffset=-overlapMm;
  const midOffset=coreDepth;
  const tipOffset=nominalDepth+(female?feature.clearanceMm:0);

  const p0={x:start.x-dir.x*extraLen,y:start.y-dir.y*extraLen,z:start.z-dir.z*extraLen};
  const p1={x:end.x+dir.x*extraLen,y:end.y+dir.y*extraLen,z:end.z+dir.z*extraLen};

  const getPt=(p:RegistrationVector3,normOff:number,latOff:number)=>({
    x:p.x+norm.x*normOff+lat.x*latOff,
    y:p.y+norm.y*normOff+lat.y*latOff,
    z:p.z+norm.z*normOff+lat.z*latOff,
  });

  const v0=getPt(p0,baseOffset,-halfBase),v1=getPt(p0,baseOffset,halfBase),v2=getPt(p1,baseOffset,halfBase),v3=getPt(p1,baseOffset,-halfBase);
  const v4=getPt(p0,midOffset,-halfMid),v5=getPt(p0,midOffset,halfMid),v6=getPt(p1,midOffset,halfMid),v7=getPt(p1,midOffset,-halfMid);
  const v8=getPt(p0,tipOffset,-halfTip),v9=getPt(p0,tipOffset,halfTip),v10=getPt(p1,tipOffset,halfTip),v11=getPt(p1,tipOffset,-halfTip);

  const positions:number[]=[
    v0.x,v0.y,v0.z, v1.x,v1.y,v1.z, v2.x,v2.y,v2.z, v3.x,v3.y,v3.z,
    v4.x,v4.y,v4.z, v5.x,v5.y,v5.z, v6.x,v6.y,v6.z, v7.x,v7.y,v7.z,
    v8.x,v8.y,v8.z, v9.x,v9.y,v9.z, v10.x,v10.y,v10.z, v11.x,v11.y,v11.z,
  ];

  const indices:number[]=[
    // Core sides
    0,4,5, 0,5,1,
    1,5,6, 1,6,2,
    2,6,7, 2,7,3,
    3,7,4, 3,4,0,

    // Lead-in chamfer sides
    4,8,9, 4,9,5,
    5,9,10, 5,10,6,
    6,10,11, 6,11,7,
    7,11,8, 7,8,4,

    // Base Cap (-norm direction)
    0,1,2, 0,2,3,

    // Tip Cap (+norm direction)
    8,11,10, 8,10,9,
  ];

  return manifoldFromPayload(module,{positions,indices},1e-5);
}

function makeReport(sourceRevision:string,reasonCode:RegistrationReasonCode,message:string,policy:RegistrationTolerancePolicy,interfaces:readonly MoldInterface[]=[],features:readonly RegistrationFeature[]=[],attempts:RegistrationReport["attempts"]=[]):RegistrationReport {return Object.freeze({schemaVersion:1,sourceRevision,status:reasonCode==="registration_generated"?"generated":"blocked",reasonCode,message,tolerancePolicy:policy,interfaces:Object.freeze([...interfaces]),features:Object.freeze([...features]),attempts:Object.freeze([...attempts])});}
function blocked<TBody extends RegistrationSourceBody>(request:RegistrationRequest<TBody>,value:RegistrationReport):RegistrationResult<TBody>{return Object.freeze({bodies:request.bodies,report:value});}
function pushTool(map:Map<string,ManifoldSolid[]>,bodyId:string,tool:ManifoldSolid):void{const list=map.get(bodyId);if(list===undefined)map.set(bodyId,[tool]);else list.push(tool);}

/**
 * Builds complementary edge-mounted linear alignment keys across every mating interface in the mold.
 */
export class RegistrationGenerationService {
  constructor(private readonly toleranceResolver:RegistrationToleranceResolver=new DefaultRegistrationToleranceResolver()){}
  async generate<TBody extends RegistrationSourceBody>(request:RegistrationRequest<TBody>):Promise<RegistrationResult<TBody>> {
    const sizingPolicy=request.sizingPolicy??NORMAL_MOLD_REGISTRATION_SIZING_POLICY;
    const policy=applyRegistrationSizingToTolerancePolicy(this.toleranceResolver.resolve(request.manufacturingProfile??null),sizingPolicy);
    if(request.eligibility==="ineligible")return blocked(request,makeReport(request.sourceRevision,"registration_ineligible","Registration is not applicable to this mold workflow.",policy));
    const interfaces=detectMatingInterfaces(request.bodies,policy.booleanToleranceMm*10);
    if(interfaces.length===0)return blocked(request,makeReport(request.sourceRevision,"registration_interface_not_found","No planar mating interface was detected; the valid mold was preserved.",policy));
    const attemptReports:RegistrationReport["attempts"][number][]=[];
    const selectedFeatures:RegistrationFeature[]=[];
    const exclusionZones:RegistrationExclusionZone[]=[];
    let wallThicknessLimited=false;
    let field:WallThicknessField;
    try{field=buildWallThicknessField(request.protectedRegions,policy.booleanToleranceMm);}
    catch(error){return blocked(request,makeReport(request.sourceRevision,"registration_boolean_failed",error instanceof Error?error.message:"The registration geometry kernel could not validate wall thickness; the valid mold was preserved.",policy,interfaces));}
    try{
      for(const moldInterface of interfaces){
        const attempts=planRegistrationLayout(moldInterface,request.bodies,request.protectedRegions,policy,exclusionZones,field,interfaces,sizingPolicy);
        let selectedForInterface:readonly RegistrationFeature[]|undefined;
        if(attempts.length>0){
          const femaleBodyId=attempts[0]!.candidates[0]!.femaleBodyId;
          const femaleBody=request.bodies.find(body=>body.id===femaleBodyId)!;
          for(const attempt of attempts){
            const exactSafe=filterByWallThickness(attempt.candidates,moldInterface,field,femaleBody,policy);
            if(exactSafe.length<attempt.candidates.length)wallThicknessLimited=true;
            const minSeparation=attempt.radiusMm*2+policy.cavitySafetyMarginMm;
            for(const requestedCount of attempt.requestedCounts){
              const chosen=selectSpreadLayout(exactSafe,moldInterface.axis,requestedCount,minSeparation);
              attemptReports.push({radiusMm:attempt.radiusMm,requestedCount,selectedCount:chosen?.length??0});
              if(chosen!==null&&selectedForInterface===undefined)selectedForInterface=chosen;
            }
            if(selectedForInterface!==undefined)break;
          }
        }
        if(selectedForInterface===undefined){
          const reasonCode:RegistrationReasonCode=wallThicknessLimited?"registration_insufficient_wall_thickness":"registration_insufficient_safe_area";
          const message=wallThicknessLimited
            ?`Linear alignment could not be generated for interface ${moldInterface.id} (bodies ${moldInterface.bodyAId}/${moldInterface.bodyBId}) due to wall thickness constraints. The cavity remains valid.`
            :`Linear alignment could not be generated for interface ${moldInterface.id} (bodies ${moldInterface.bodyAId}/${moldInterface.bodyBId}) due to safe area clearance constraints. The cavity remains valid.`;
          return blocked(request,makeReport(request.sourceRevision,reasonCode,message,policy,interfaces,[],attemptReports));
        }
        selectedFeatures.push(...selectedForInterface);
        for(const feature of selectedForInterface)exclusionZones.push({anchor:feature.anchor,radiusMm:feature.geometry.widthMm/2});
      }
    }finally{field.dispose();}
    const finalFeatures=selectedFeatures;
    const interfacesById=new Map(interfaces.map(moldInterface=>[moldInterface.id,moldInterface]));
    let module:ManifoldModuleInstance;
    try{module=await getManifoldModule();}catch(error){return blocked(request,makeReport(request.sourceRevision,"registration_boolean_failed",error instanceof Error?error.message:"The registration geometry kernel could not be initialized; the valid mold was preserved.",policy,interfaces,[],attemptReports));}
    const sourceSolids=new Map<string,ManifoldSolid>(),tools:ManifoldSolid[]=[],protectedSolids:ManifoldSolid[]=[];
    try{
      for(const body of request.bodies)sourceSolids.set(body.id,manifoldFromPayload(module,body.mesh,policy.booleanToleranceMm));
      for(const region of request.protectedRegions)if(region.mesh!==undefined)protectedSolids.push(manifoldFromPayload(module,region.mesh,policy.booleanToleranceMm));
      const overlapMm=Math.max(policy.booleanToleranceMm*20,0.01);
      const maleToolsByBody=new Map<string,ManifoldSolid[]>(),femaleToolsByBody=new Map<string,ManifoldSolid[]>();
      const roleMap: Record<number, "registration-key"> = {};
      for(const feature of finalFeatures){
        const moldInterface=interfacesById.get(feature.interfaceId)!;
        const maleToolRaw=buildFeatureTool(module,feature,moldInterface,false,overlapMm),femaleToolRaw=buildFeatureTool(module,feature,moldInterface,true,overlapMm);
        const maleTool=maleToolRaw.asOriginal(),femaleTool=femaleToolRaw.asOriginal();
        roleMap[(maleTool as any).originalID()] = "registration-key";
        roleMap[(femaleTool as any).originalID()] = "registration-key";
        tools.push(maleTool,femaleTool);pushTool(maleToolsByBody,feature.maleBodyId,maleTool);pushTool(femaleToolsByBody,feature.femaleBodyId,femaleTool);
        for(const protectedSolid of protectedSolids){const maleCollision=maleTool.intersect(protectedSolid),femaleCollision=femaleTool.intersect(protectedSolid);try{if(maleCollision.volume()>policy.booleanToleranceMm**3||femaleCollision.volume()>policy.booleanToleranceMm**3)throw Object.assign(new Error("Registration geometry intersects protected functional geometry."),{code:"registration_validation_failed"});}finally{femaleCollision.delete();maleCollision.delete();}}
      }
      const output=request.bodies.map((body):TBody=>{
        const maleToolsForBody=maleToolsByBody.get(body.id),femaleToolsForBody=femaleToolsByBody.get(body.id);
        if(maleToolsForBody===undefined&&femaleToolsForBody===undefined)return body;
        let current=sourceSolids.get(body.id)!;
        if(maleToolsForBody!==undefined){const maleUnion=module.Manifold.union(maleToolsForBody);tools.push(maleUnion);current=current.add(maleUnion);tools.push(current);assertManifoldStatus(current,"Registration Boolean");}
        if(femaleToolsForBody!==undefined){const femaleUnion=module.Manifold.union(femaleToolsForBody);tools.push(femaleUnion);current=current.subtract(femaleUnion);tools.push(current);assertManifoldStatus(current,"Registration Boolean");}
        const volumeMm3=current.volume(),mesh=payloadFromManifold(current,roleMap);
        if(current.isEmpty()||!Number.isFinite(volumeMm3)||volumeMm3<=policy.booleanToleranceMm**3||mesh.positions.some(value=>!Number.isFinite(value))||mesh.indices.length<12)throw Object.assign(new Error("Registration result geometry is invalid."),{code:"registration_validation_failed"});
        const components=current.decompose();
        try{
          const positiveComponents=components.filter(c=>c.volume()>policy.booleanToleranceMm**3);
          if(positiveComponents.length>1){
            throw Object.assign(new Error("Registration created an unacceptable detached fragment."),{code:"registration_validation_failed"});
          }
        }finally{for(const component of components)component.delete();}
        const bounds=boundsFromManifold(current);
        const appliedFeatureIds=finalFeatures.filter(feature=>feature.maleBodyId===body.id||feature.femaleBodyId===body.id).map(feature=>feature.id);
        return {...body,mesh,bounds,centroid:{x:(bounds.min.x+bounds.max.x)/2,y:(bounds.min.y+bounds.max.y)/2,z:(bounds.min.z+bounds.max.z)/2},triangleCount:current.numTri(),volumeMm3,geometryVersion:`registration:${hash(`${body.geometryVersion}:${appliedFeatureIds.join(":")}`)}`};
      });
      const generatedFeatures=finalFeatures.map(feature=>Object.freeze({...feature,status:"generated" as const}));
      return Object.freeze({bodies:Object.freeze(output),report:makeReport(request.sourceRevision,"registration_generated",`${generatedFeatures.length} complementary linear registration keys were generated across ${interfaces.length} mating interface${interfaces.length===1?"":"s"}.`,policy,interfaces,generatedFeatures,attemptReports)});
    }catch(error){
      const reasonCode:RegistrationReasonCode=error instanceof Error&&"code" in error&&error.code==="registration_validation_failed"?"registration_validation_failed":"registration_boolean_failed";
      return blocked(request,makeReport(request.sourceRevision,reasonCode,error instanceof Error?error.message:"Registration generation failed; the valid mold was preserved.",policy,interfaces,[],attemptReports));
    }finally{for(const solid of protectedSolids)solid.delete();for(const solid of tools)solid.delete();for(const solid of sourceSolids.values())solid.delete();}
  }
}
