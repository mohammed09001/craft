import { cubeMesh } from "../cavity-generation/cavityGeneration.testFixtures";
import type { CavityGenerationResult, CavityToolData } from "../cavity-generation/cavityGeneration.contracts";
import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import { createCuttingPlane } from "../split-face/splitFace.geometry";
import type { SprueDefinition } from "../sprue-generation";
import { buildRegistrationDependencySnapshot, generateDerivedRegistration } from "./registrationLifecycle";
import type { RegistrationRequest, RegistrationResult, RegistrationSourceBody } from "./registration.contracts";
import { AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY } from "./registrationSizing.policy";

const bodies=(size=40):readonly MoldBodyData[]=>[
  {id:"body-a",name:"Mold A",visible:true,bounds:{min:{x:0,y:0,z:0},max:{x:size,y:size,z:10}},centroid:{x:size/2,y:size/2,z:5},triangleCount:12,volumeMm3:size*size*10,watertight:true,mesh:cubeMesh({min:{x:0,y:0,z:0},max:{x:size,y:size,z:10}})},
  {id:"body-b",name:"Mold B",visible:true,bounds:{min:{x:0,y:0,z:10},max:{x:size,y:size,z:20}},centroid:{x:size/2,y:size/2,z:15},triangleCount:12,volumeMm3:size*size*10,watertight:true,mesh:cubeMesh({min:{x:0,y:0,z:10},max:{x:size,y:size,z:20}})},
];
const definition=(size=40,clearanceMm=10):ReferenceMoldDefinition=>({schemaVersion:1,definitionId:`mold:${size}:${clearanceMm}`,modelId:"model",coordinateSystem:{units:"millimeters",upAxis:"Z"},selectionBoxBounds:{min:{x:clearanceMm,y:clearanceMm,z:clearanceMm},max:{x:size-clearanceMm,y:size-clearanceMm,z:20-clearanceMm}},referenceMoldBlock:{clearanceMm,bounds:{min:{x:0,y:0,z:0},max:{x:size,y:size,z:20}}},usedFaces:["top"],selectedFaceIds:["top"],moldBodies:bodies(size)});
const sprue=(x=5,diameter=2):SprueDefinition=>({operationId:"sprue-1",targetBodyIds:["body-b"],position:{x,y:7,z:20},inwardDirection:{x:0,y:0,z:-1},profile:{mainDiameterMm:diameter,entryNeckDiameterMm:1,entryNeckLengthMm:2},depthMm:10,circularSegments:32,coordinateSpace:"mold-local",moldFrameId:"frame",tolerancePolicy:{linearToleranceMm:1e-6,areaToleranceMm2:1e-12,volumeToleranceMm3:1e-18,meaningfulVolumeMm3:1e-9,surfaceToleranceMm:0.01,outsideMarginMm:0.01,beyondMarginMm:0.01}});
/** A cavity that hugs the mold's own `selectionBoxBounds` exactly (zero clearance) — matching production's
 * `DEFAULT_CAVITY_CLEARANCE_MM=0`, so the only room ever available for locators is the block's own clearance
 * ring around it. */
const cavityForDefinition=(mold:ReferenceMoldDefinition):CavityToolData=>({mesh:cubeMesh(mold.selectionBoxBounds),bounds:mold.selectionBoxBounds,volumeMm3:1,triangleCount:12,connectedComponentCount:1,watertight:true,manifold:true,warnings:[],clearanceMm:0,implementationMethod:"exact-watertight-part-solid",qualityMode:"standard"});
const snapshot=(options:{size?:number;clearanceMm?:number;planePosition?:number;sprues?:readonly SprueDefinition[];withCavity?:boolean}={})=>{
  const mold=definition(options.size,options.clearanceMm),plane=createCuttingPlane("top");
  const cuttingPlanes=[{...plane,normalizedPosition:options.planePosition??plane.normalizedPosition}];
  const cavityTool=options.withCavity===true?cavityForDefinition(mold):null;
  return buildRegistrationDependencySnapshot({bodies:mold.moldBodies!,definition:mold,cuttingPlanes,cavityTool,cavityRevision:cavityTool===null?null:"cavity-v1",sprues:options.sprues??[],manufacturingProfile:null});
};

describe("registration lifecycle dependency coordinator",()=>{
  it("keeps cavity generation independent from registration lifecycle ownership",()=>{
    type CavityOwnedRegistrationFields=Extract<keyof CavityGenerationResult,"registration"|"registrationBaseBodies">;
    const cavityOwnsNoRegistration:CavityOwnedRegistrationFields extends never?true:false=true;
    expect(cavityOwnsNoRegistration).toBe(true);
  });

  it("fingerprints mold dimensions, clearance, split definitions, and committed sprue mutations",()=>{
    const base=snapshot();
    expect(snapshot().revision).toBe(base.revision);
    expect(snapshot({size:44}).revision).not.toBe(base.revision);
    expect(snapshot({clearanceMm:8}).revision).not.toBe(base.revision);
    expect(snapshot({planePosition:0.7}).revision).not.toBe(base.revision);
    const added=snapshot({sprues:[sprue()]});
    expect(added.revision).not.toBe(base.revision);
    expect(snapshot({sprues:[sprue(9)]}).revision).not.toBe(added.revision);
    expect(snapshot({sprues:[sprue(5,3)]}).revision).not.toBe(added.revision);
    expect(snapshot({sprues:[]}).revision).toBe(base.revision);
  });

  it("regenerates deterministically from clean bodies and keeps registration keys clear of a protected Sprue",async()=>{
    const clean=snapshot(),protectedSnapshot=snapshot({sprues:[sprue()]});
    const first=await generateDerivedRegistration(clean),rebuilt=await generateDerivedRegistration(clean),protectedResult=await generateDerivedRegistration(protectedSnapshot);
    expect(first).toEqual(rebuilt);
    expect(first.revision).toBe(clean.revision);
    expect(first.bodies).not.toBe(clean.bodies);
    expect(clean.bodies.every(body=>!body.geometryVersion.startsWith("registration:"))).toBe(true);
    expect(protectedResult.status).toBe("generated");
    // The adaptive planner is robust enough that a small, localized obstruction doesn't always force a
    // different final 3-key spread (a stable layout is desirable) — but it must always keep every key
    // clear of the protected Sprue region, which the old fixed 8-position planner could not guarantee.
    const sprueBounds={min:{x:3.99,y:5.99},max:{x:6.01,y:8.01}};
    for(const feature of protectedResult.report!.features){
      const dx=feature.anchor.x<sprueBounds.min.x?sprueBounds.min.x-feature.anchor.x:feature.anchor.x>sprueBounds.max.x?feature.anchor.x-sprueBounds.max.x:0;
      const dy=feature.anchor.y<sprueBounds.min.y?sprueBounds.min.y-feature.anchor.y:feature.anchor.y>sprueBounds.max.y?feature.anchor.y-sprueBounds.max.y:0;
      expect(Math.hypot(dx,dy)).toBeGreaterThanOrEqual(feature.geometry.widthMm / 2);
    }
    const rebuiltFromClean=await generateDerivedRegistration(clean);
    expect(rebuiltFromClean.bodies).toEqual(first.bodies);
  });

  it("preserves the latest canonical bodies when the derived generator rejects",async()=>{
    const clean=snapshot();
    const rejecting={generate:async<TBody extends RegistrationSourceBody>(request:RegistrationRequest<TBody>):Promise<RegistrationResult<TBody>>=>{void request;throw new Error("registration unavailable");}};
    const result=await generateDerivedRegistration(clean,rejecting);
    expect(result.report).toMatchObject({status:"blocked",reasonCode:"registration_boolean_failed",message:"registration unavailable"});
    expect(result.bodies).toBe(clean.bodies);
  });

  // Regression for the "No registration layout — not even a single locator" report: `DEFAULT_CAVITY_CLEARANCE_MM`
  // is locked to 0, so the cavity always hugs the mold's own `selectionBoxBounds` exactly, leaving only the
  // block's own (user-adjustable, down to `MIN_REFERENCE_MOLD_CLEARANCE_MM=1`) clearance ring for locators. When
  // that ring is narrower than registration's own margins at every tried radius, every broad-phase candidate is
  // correctly rejected — this proves it's genuinely reachable through the real production entry point (not just
  // the low-level planner) and that the resulting message is actionable instead of a bare, unexplained rejection.
  it("blocks with an actionable message when the mold's own clearance ring is narrower than registration's margins, but generates once clearance is restored",async()=>{
    const tightSnapshot=snapshot({size:40,clearanceMm:1,withCavity:true});
    const tight=await generateDerivedRegistration(tightSnapshot);
    expect(tight.status).toBe("blocked");
    expect(tight.report!.reasonCode).toBe("registration_insufficient_safe_area");
    expect(tight.report!.message).toContain("safe area clearance constraints");
    expect(tight.bodies).toEqual(tightSnapshot.bodies);

    const roomy=await generateDerivedRegistration(snapshot({size:40,clearanceMm:10,withCavity:true}));
    expect(roomy.status).toBe("generated");
    expect(roomy.report!.features.length).toBeGreaterThan(0);
  });

  // Simulates the unlimited Mold-Scale-up/Mold-Scale-down/rebuild loop through the real production
  // entry point (buildRegistrationDependencySnapshot -> generateDerivedRegistration), the same lifecycle
  // boundary every workflow rebuilds through. Nothing in that boundary is memoized, so each call must
  // derive its width fresh from the bodies it was actually given, not carry over a prior cycle's result.
  it("recomputes adaptive Segmentation width deterministically across many repeated Mold-Scale rebuild cycles, with no drift or stale reuse",async()=>{
    const smallSize=15,largeSize=100;
    const snapshotFor=(size:number)=>buildRegistrationDependencySnapshot({
      bodies:bodies(size),definition:definition(size),cuttingPlanes:[],cavityTool:null,cavityRevision:null,sprues:[],
      manufacturingProfile:null,sizingPolicy:AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
    });

    const firstSmall=await generateDerivedRegistration(snapshotFor(smallSize));
    const firstLarge=await generateDerivedRegistration(snapshotFor(largeSize));
    expect(firstSmall.status).toBe("generated");
    expect(firstLarge.status).toBe("generated");
    const smallWidth=firstSmall.report!.features[0]!.geometry.widthMm;
    const largeWidth=firstLarge.report!.features[0]!.geometry.widthMm;
    // The universal 5mm floor is gone: a small segment gets a genuinely smaller feature than a large one.
    // largeSize=100 -> minSpan=100 -> 100*0.11=11, still short of the 50mm
    // preferred cap (reached only by much larger interfaces -- see
    // registrationPlanner.test.ts's dedicated 500mm-span cap test).
    expect(smallWidth).toBeLessThan(largeWidth);
    expect(largeWidth).toBe(11);

    for(let cycle=0;cycle<15;cycle+=1){
      const small=await generateDerivedRegistration(snapshotFor(smallSize));
      const large=await generateDerivedRegistration(snapshotFor(largeSize));
      expect(small.status).toBe("generated");
      expect(large.status).toBe("generated");
      expect(small.report!.features[0]!.geometry.widthMm).toBe(smallWidth);
      expect(large.report!.features[0]!.geometry.widthMm).toBe(largeWidth);
      expect(small.revision).toBe(firstSmall.revision);
      expect(large.revision).toBe(firstLarge.revision);
      expect(small.bodies).toEqual(firstSmall.bodies);
      expect(large.bodies).toEqual(firstLarge.bodies);
    }
  });
});
