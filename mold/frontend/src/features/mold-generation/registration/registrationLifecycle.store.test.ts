import * as manifoldGeometry from "../geometry/manifold";
import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import type { CavityGenerationInput } from "../cavity-generation/cavityGeneration.contracts";
import { generateCavityBodies } from "../cavity-generation/cavityBody.generator";
import { createCavityTool } from "../cavity-generation/manifold.engine";
import { validateAndPreparePartSolid } from "../cavity-generation/partSolid.validator";
import { designSprueProfile, type ValidSpruePreviewPlacement } from "../sprue-generation";
import { createSplitFaceStoreCreator, type SplitFaceStoreDeps, type SplitFaceState } from "../split-face/splitFace.store";
import { cancelDerivedMoldEvaluation, runDerivedMoldEvaluation } from "../workflow";
import { createStore, type StoreApi } from "zustand/vanilla";

const runCavityGenerationInWorker=Object.assign(vi.fn(async(input:CavityGenerationInput)=>{
 const validation=validateAndPreparePartSolid(input);
 if(!validation.ok||validation.prepared===null)throw new Error(validation.blockers[0]?.message??"Invalid cavity input.");
 const tool=await createCavityTool(validation.prepared,input.cavityClearanceMm,input.qualityMode,input.geometryToleranceMm);
 return {result:await generateCavityBodies(input,tool),validationWarnings:validation.warnings};
}),{cancel:vi.fn()}) as SplitFaceStoreDeps["runCavityGenerationInWorker"];
const cancelActiveCavityGeneration=vi.fn();

const k1={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}};
let useSplitFaceStore:StoreApi<SplitFaceState>;
const profileDesign=designSprueProfile(null);
const placement=(x=5):ValidSpruePreviewPlacement=>({status:"valid",topPoint:{x,y:5,z:30},cavityPoint:{x,y:5,z:20},inwardDirection:{x:0,y:0,z:-1},stemLengthMm:10,profileDesign,coordinateSpace:"mold-local"});

beforeEach(()=>{useSplitFaceStore=createStore(createSplitFaceStoreCreator({runDerivedMoldEvaluation,cancelDerivedMoldEvaluation,runCavityGenerationInWorker,cancelActiveCavityGeneration}));});
afterEach(()=>vi.restoreAllMocks());

async function createParts():Promise<void>{
  const state=useSplitFaceStore.getState();
  state.enterSelection();state.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("model",k1)).toBe(true);
}

describe("authoritative registration rebuild lifecycle",()=>{
  it("regenerates after mold size and committed split add, move, and remove operations with Undo/Redo",async()=>{
    await createParts();
    const initial=useSplitFaceStore.getState().registration;
    expect(initial.status).toBe("generated");
    useSplitFaceStore.getState().setClearanceMm(12);
    expect(await useSplitFaceStore.getState().createMoldParts("model",k1)).toBe(true);
    const resized=useSplitFaceStore.getState().registration;
    expect(resized.revision).not.toBe(initial.revision);

    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("right");
    expect(await useSplitFaceStore.getState().createMoldParts("model",k1)).toBe(true);
    const added=useSplitFaceStore.getState().registration;
    expect(added.revision).not.toBe(resized.revision);

    const movedPlane=useSplitFaceStore.getState().cuttingPlanes[0]!;
    useSplitFaceStore.getState().beginPlaneDrag(movedPlane.id);
    useSplitFaceStore.getState().commitPlaneDrag(movedPlane.id,0.6,k1);
    expect(await useSplitFaceStore.getState().createMoldParts("model",k1)).toBe(true);
    const moved=useSplitFaceStore.getState().registration;
    expect(moved.revision).not.toBe(added.revision);

    expect(await useSplitFaceStore.getState().removeSplitFaceAndRebuild("right","model",k1)).toBe(true);
    const removed=useSplitFaceStore.getState().registration;
    expect(removed.revision).not.toBe(moved.revision);
    useSplitFaceStore.getState().undo();
    expect(useSplitFaceStore.getState().registration.revision).toBe(moved.revision);
    useSplitFaceStore.getState().redo();
    expect(useSplitFaceStore.getState().registration.revision).toBe(removed.revision);
  });

  it("regenerates after cavity and committed sprue add, move, resize, and removal from clean canonical bodies",async()=>{
    const partGeometry=canonicalCube("model",k1);
    useSplitFaceStore.getState().setCanonicalPartGeometrySignature(partGeometry.sourceSignature);
    await createParts();
    const partsRevision=useSplitFaceStore.getState().registration.revision;
    expect(await useSplitFaceStore.getState().createCavity(partGeometry)).toBe(true);
    const cavityState=useSplitFaceStore.getState();
    const cavityRevision=cavityState.registration.revision;
    expect(cavityRevision).not.toBe(partsRevision);
    expect(cavityState.cavity.result!.bodies.every(body=>!body.geometryVersion.startsWith("registration:"))).toBe(true);

    expect(await cavityState.createSprue(placement())).toBe(true);
    await vi.waitFor(()=>expect(useSplitFaceStore.getState().sprues).toHaveLength(1));
    const added=useSplitFaceStore.getState(),operationId=added.sprues[0]!.operationId;
    expect(added.registration.status).toBe("generated");
    expect(added.registration.revision).not.toBe(cavityRevision);
    expect(added.cavity.result!.bodies.every(body=>!body.geometryVersion.startsWith("registration:"))).toBe(true);

    expect(await added.moveSprue(operationId,{x:6,y:5,z:30})).toBe(true);
    await vi.waitFor(()=>expect(useSplitFaceStore.getState().registration.status).toBe("generated"));
    const moved=useSplitFaceStore.getState();
    expect(moved.registration.status).toBe("generated");
    expect(moved.registration.revision).not.toBe(added.registration.revision);
    expect(await moved.resizeSprue(operationId,moved.sprues[0]!.profile.mainDiameterMm+0.5)).toBe(true);
    await vi.waitFor(()=>expect(useSplitFaceStore.getState().registration.status).toBe("generated"));
    const resized=useSplitFaceStore.getState();
    expect(resized.registration.status).toBe("generated");
    expect(resized.registration.revision).not.toBe(moved.registration.revision);
    expect(await resized.removeSprue(operationId)).toBe(true);
    await vi.waitFor(()=>expect(useSplitFaceStore.getState().sprues).toHaveLength(0));
    await vi.waitFor(()=>expect(useSplitFaceStore.getState().registration.revision).toBe(cavityRevision));
    const removed=useSplitFaceStore.getState();
    expect(removed.registration.status).toBe("generated");
    expect(removed.sprues).toHaveLength(0);
    expect(removed.registration.revision).toBe(cavityRevision);
  });

  it("rejects stale asynchronous registration and preserves a valid unkeyed mold on registration failure",async()=>{
    const original=manifoldGeometry.getManifoldModule;
    let release:()=>void=()=>undefined;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    vi.spyOn(manifoldGeometry,"getManifoldModule").mockImplementationOnce(async()=>{await gate;return original();});
    const state=useSplitFaceStore.getState();state.enterSelection();state.toggleFace("front");
    const pending=useSplitFaceStore.getState().createMoldParts("stale",k1);
    await Promise.resolve();
    useSplitFaceStore.getState().clearForModelReplacement();
    release();
    expect(await pending).toBe(false);
    expect(useSplitFaceStore.getState().definition).toBeNull();
    expect(useSplitFaceStore.getState().registration.status).toBe("unavailable");

    const failureState=useSplitFaceStore.getState();failureState.enterSelection();failureState.toggleFace("front");
    vi.spyOn(manifoldGeometry,"getManifoldModule").mockRejectedValueOnce(new Error("kernel unavailable"));
    expect(await useSplitFaceStore.getState().createMoldParts("failure",k1)).toBe(true);
    const committed=useSplitFaceStore.getState();
    expect(committed.registration.report?.reasonCode).toBe("registration_boolean_failed");
    expect(committed.registration.bodies?.map(body=>body.id)).toEqual(committed.definition!.moldBodies!.map(body=>body.id));
    expect(committed.registration.bodies?.every(body=>!body.geometryVersion.startsWith("registration:"))).toBe(true);
    expect(committed.definition!.moldBodies!.every(body=>body.watertight)).toBe(true);
  });
});
