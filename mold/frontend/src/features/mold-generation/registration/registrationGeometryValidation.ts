import { createCavitySignedDistanceField, type CavitySignedDistanceField } from "../cavity-generation/cavitySignedDistance.bvh";
import type { RegistrationAxis, RegistrationFeature, MoldInterface, RegistrationProtectedRegion, RegistrationSourceBody, RegistrationTolerancePolicy, RegistrationVector3 } from "./registration.contracts";

const scale=(value:RegistrationVector3,amount:number):RegistrationVector3=>({x:value.x*amount,y:value.y*amount,z:value.z*amount});
const add=(left:RegistrationVector3,right:RegistrationVector3):RegistrationVector3=>({x:left.x+right.x,y:left.y+right.y,z:left.z+right.z});
const cross=(a:RegistrationVector3,b:RegistrationVector3):RegistrationVector3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const normalize=(value:RegistrationVector3):RegistrationVector3=>{const len=Math.hypot(value.x,value.y,value.z);return len>1e-9?scale(value,1/len):{x:0,y:0,z:1};};
const otherAxes=(axis:RegistrationAxis):readonly [RegistrationAxis,RegistrationAxis]=>axis==="x"?["y","z"]:axis==="y"?["x","z"]:["x","y"];

/** Deterministic sample points on the linear key socket surface. */
function linearKeySamplePoints(feature:RegistrationFeature,moldInterface:MoldInterface):readonly RegistrationVector3[] {
  const towardFemale=feature.femaleBodyId===moldInterface.bodyBId;
  const axisNormal=scale(moldInterface.assemblyDirection,towardFemale?1:-1);
  const start=feature.startPoint,end=feature.endPoint;
  const length=feature.geometry.lengthMm,width=feature.geometry.widthMm,depth=feature.geometry.depthMm;
  const dir=normalize({x:end.x-start.x,y:end.y-start.y,z:end.z-start.z});
  const lat=normalize(cross(axisNormal,dir));
  const points:RegistrationVector3[]=[];
  const lengthSteps=Math.max(3,Math.ceil(length/10));
  for(let i=0;i<=lengthSteps;i+=1){
    const t=i/lengthSteps;
    const basePt={x:start.x+dir.x*length*t,y:start.y+dir.y*length*t,z:start.z+dir.z*length*t};
    for(const depthFrac of [0.3,0.7,1.0]){
      const depthPt=add(basePt,scale(axisNormal,depth*depthFrac));
      for(const latOffset of [-width/2,0,width/2]){
        points.push(add(depthPt,scale(lat,latOffset)));
      }
    }
  }
  return points;
}

export interface WallThicknessField { readonly clearanceAt:(point:RegistrationVector3)=>number; readonly dispose:()=>void }

/** Builds one signed-distance field per protected region that carries a mesh (cavity/sprue/etc). */
export function buildWallThicknessField(protectedRegions:readonly RegistrationProtectedRegion[],toleranceMm:number):WallThicknessField {
  const keepOut:CavitySignedDistanceField[]=[];
  try{
    for(const region of protectedRegions){
      if(region.mesh===undefined)continue;
      keepOut.push(createCavitySignedDistanceField({mesh:region.mesh,bounds:region.bounds,volumeMm3:0,triangleCount:region.mesh.indices.length/3,connectedComponentCount:1,watertight:true,manifold:true,warnings:[]},toleranceMm));
    }
  }catch(error){
    for(const field of keepOut)field.dispose();
    throw error;
  }
  return {
    clearanceAt:(point)=>{
      if(keepOut.length===0)return Infinity;
      const asTuple:[number,number,number]=[point.x,point.y,point.z];
      return Math.min(...keepOut.map(field=>-field.signedDistance(asTuple)));
    },
    dispose:()=>{for(const field of keepOut)field.dispose();},
  };
}

/** Exact remaining wall to the female body's own external surface. */
function externalSurfaceClearanceMm(feature:RegistrationFeature,moldInterface:MoldInterface,femaleBody:RegistrationSourceBody):number {
  const towardFemale=feature.femaleBodyId===moldInterface.bodyBId;
  const axis=moldInterface.axis,sign=towardFemale?1:-1;
  const tipCoordinate=feature.anchor[axis]+sign*feature.geometry.depthMm;
  const depthClearance=sign>0?femaleBody.bounds.max[axis]-tipCoordinate:tipCoordinate-femaleBody.bounds.min[axis];
  const [u,v]=otherAxes(axis);
  const halfWidth=feature.geometry.widthMm/2;

  const isVDir = Math.abs(feature.direction[v]) > 0.5;
  const latAxis = isVDir ? u : v;
  const lenAxis = isVDir ? v : u;

  const latCenter = feature.startPoint[latAxis];
  const minLat = latCenter - halfWidth;
  const maxLat = latCenter + halfWidth;

  const minLen = Math.min(feature.startPoint[lenAxis], feature.endPoint[lenAxis]);
  const maxLen = Math.max(feature.startPoint[lenAxis], feature.endPoint[lenAxis]);

  const lateralClearance = Math.min(
    minLat - femaleBody.bounds.min[latAxis], femaleBody.bounds.max[latAxis] - maxLat,
    minLen - femaleBody.bounds.min[lenAxis], femaleBody.bounds.max[lenAxis] - maxLen,
  );
  return Math.min(depthClearance, lateralClearance);
}

export function filterByWallThickness(candidates:readonly RegistrationFeature[],moldInterface:MoldInterface,field:WallThicknessField,femaleBody:RegistrationSourceBody,policy:RegistrationTolerancePolicy):readonly RegistrationFeature[] {
  const tolEpsilon = 1e-4;
  return candidates.filter(feature=>{
    const extCl = externalSurfaceClearanceMm(feature,moldInterface,femaleBody);
    const samples = linearKeySamplePoints(feature,moldInterface);
    const minSdfCl = Math.min(...samples.map(point=>field.clearanceAt(point)));
    if (extCl < policy.minimumWallMm - tolEpsilon || minSdfCl < policy.minimumWallMm - tolEpsilon) {
      return false;
    }
    return true;
  });
}
