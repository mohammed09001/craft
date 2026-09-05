import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import { designSprueProfile, type SpruePreviewPlacement } from "../sprue-generation";
import { selectActiveMoldBodies, useSplitFaceStore } from "../split-face/splitFace.store";
import { canCommitMoldEvaluation, nextEvaluationRequest, type FinalMoldResult, type MoldDocument } from ".";
import { isViewportToolAvailable, type ViewportToolContext } from "@/features/viewport/viewportTool.capabilities";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";

vi.mock("../cavity-generation/cavityGeneration.workerClient", () => ({
  cancelActiveCavityGeneration: vi.fn(),
  runCavityGenerationInWorker: vi.fn(async (input: import("../cavity-generation").CavityGenerationInput) => {
    const [{ validateAndPreparePartSolid }, { createCavityTool }, { generateCavityBodies }] = await Promise.all([
      import("../cavity-generation/partSolid.validator"), import("../cavity-generation/manifold.engine"), import("../cavity-generation/cavityBody.generator"),
    ]);
    const validation = validateAndPreparePartSolid(input);
    if (!validation.ok || validation.prepared === null) throw new Error("Invalid cavity fixture.");
    const tool = await createCavityTool(validation.prepared, input.cavityClearanceMm, input.qualityMode, input.geometryToleranceMm);
    return { result: await generateCavityBodies(input, tool), validationWarnings: validation.warnings };
  }),
}));

const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const canonicalPartGeometry = canonicalCube("workflow", k1);
const pendingPlacement = (x = 5): SpruePreviewPlacement => ({
  status: "invalid", topPoint: { x, y: 5, z: 30 }, inwardDirection: { x: 0, y: 0, z: -1 },
  stemLengthMm: 20, profileDesign: designSprueProfile(null), coordinateSpace: "mold-local",
});
const validPlacement = (x = 5): SpruePreviewPlacement => ({
  ...pendingPlacement(x), status: "valid", cavityPoint: { x, y: 5, z: 20 }, stemLengthMm: 10,
});

async function parts(face: "front" | "right" = "front") {
  const state = useSplitFaceStore.getState();
  state.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature); state.enterSelection(); state.toggleFace(face);
  expect(await useSplitFaceStore.getState().createMoldParts("workflow", k1)).toBe(true);
}
async function cavity() { await parts(); expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true); }

beforeEach(() => {
  useSplitFaceStore.getState().clearForModelReplacement();
  useViewportToolStore.getState().resetActiveTool();
});

describe("authoritative mold document integration", () => {
  it("1 creates parts and commits explicit registration", async () => { await parts(); expect(useSplitFaceStore.getState().registration.status).toBe("generated"); });
  it("2 creates cavity and keeps registration final", async () => { await cavity(); expect(useSplitFaceStore.getState().lastCommittedResult?.keyed).toBe(true); });
  it("3 keeps last valid bodies visible during an in-flight atomic rebuild", async () => { await cavity(); const bodies=selectActiveMoldBodies(useSplitFaceStore.getState()); const rebuild=useSplitFaceStore.getState().createCavity(canonicalPartGeometry); expect(selectActiveMoldBodies(useSplitFaceStore.getState())).toEqual(bodies); expect(await rebuild).toBe(true); });
  it("4 accepts a pre-cavity Sprue as pending then resolves it", async () => { await parts(); expect(await useSplitFaceStore.getState().createSprue(pendingPlacement())).toBe(true); expect(useSplitFaceStore.getState().sprueDefinitions[0]?.validation.status).toBe("pending"); expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true); expect(useSplitFaceStore.getState().registration.status).toBe("generated"); expect(useSplitFaceStore.getState().sprueDefinitions[0]?.validation.status).toBe("resolved"); });
  it("5 adds a Sprue after cavity without overwriting cavity bodies", async () => { await cavity(); const canonical=useSplitFaceStore.getState().cavity.result!.bodies; expect(await useSplitFaceStore.getState().createSprue(validPlacement())).toBe(true); expect(useSplitFaceStore.getState().cavity.result!.bodies).toBe(canonical); expect(["generated","blocked"]).toContain(useSplitFaceStore.getState().registration.status); expect(useSplitFaceStore.getState().registration.report).not.toBeNull(); });
  it("6 replays add move resize and remove deterministically", async () => { await cavity(); await useSplitFaceStore.getState().createSprue(validPlacement()); await useSplitFaceStore.getState().createSprue(validPlacement(8)); const id=useSplitFaceStore.getState().sprueDefinitions[0]!.operationId; expect(await useSplitFaceStore.getState().moveSprue(id,{x:6,y:5,z:30})).toBe(true); expect(await useSplitFaceStore.getState().resizeSprue(id,3)).toBe(true); expect(await useSplitFaceStore.getState().removeSprue(id)).toBe(true); expect(useSplitFaceStore.getState().sprueDefinitions).toHaveLength(1); });
  it("7 preserves Sprue definitions through an atomic cavity rebuild", async () => { await cavity(); await useSplitFaceStore.getState().createSprue(validPlacement()); const id=useSplitFaceStore.getState().sprueDefinitions[0]!.operationId; expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true); expect(useSplitFaceStore.getState().sprueDefinitions[0]?.operationId).toBe(id); });
  it("8 retains Sprue intent when split definitions change", async () => { await parts(); await useSplitFaceStore.getState().createSprue(pendingPlacement()); useSplitFaceStore.getState().enterSelection(); useSplitFaceStore.getState().toggleFace("right"); expect(useSplitFaceStore.getState().sprueDefinitions).toHaveLength(1); });
  it("9 retains Sprue intent but invalidates stale derived bodies when mold clearance changes", async () => { await parts(); await useSplitFaceStore.getState().createSprue(pendingPlacement()); useSplitFaceStore.getState().setClearanceMm(12); expect(useSplitFaceStore.getState().sprueDefinitions).toHaveLength(1); expect(useSplitFaceStore.getState().lastCommittedResult).toBeNull(); expect(selectActiveMoldBodies(useSplitFaceStore.getState())).toBeUndefined(); });
  it("10 exposes registration block/failure instead of pretending keys exist", async () => { await parts("right"); expect(["generated","blocked","failed"]).toContain(useSplitFaceStore.getState().registration.status); expect(useSplitFaceStore.getState().lastCommittedResult?.keyed).toBe(useSplitFaceStore.getState().registration.status==="generated"); });
  it("11 reapplies body visibility after replacement", async () => { await parts(); const id=selectActiveMoldBodies(useSplitFaceStore.getState())![0]!.id; useSplitFaceStore.getState().setBodyVisibility(id,false); await useSplitFaceStore.getState().createCavity(canonicalPartGeometry); expect(selectActiveMoldBodies(useSplitFaceStore.getState())?.find(body=>body.id===id)?.visible).toBe(false); });
  it("12 switches pointer eraser and Sprue through one registry", () => { const context:ViewportToolContext={workflow:"planesReady",evaluationPhase:"complete",hasReferenceGeometry:true,hasCuttingPlanes:true}; for(const tool of ["pointer","eraser","sprue"] as const) expect(isViewportToolAvailable(tool,context)).toBe(true); });
  it("13 disables mutating tools during evaluation", () => { const context:ViewportToolContext={workflow:"partsReady",evaluationPhase:"evaluating",hasReferenceGeometry:true,hasCuttingPlanes:true}; expect(isViewportToolAvailable("sprue",context)).toBe(false); expect(isViewportToolAvailable("pointer",context)).toBe(true); });
  it("14 rejects an old async result at the single commit gate", () => { const document={schemaVersion:1,revision:2,fingerprint:"new",definition:null,cuttingPlanes:[],cavityEnabled:true,cavityClearanceMm:0,sprues:[],registrationPolicyId:"default",manufacturingProfile:null} satisfies MoldDocument; const evaluation=nextEvaluationRequest(document); const result={sourceRevision:1,sourceFingerprint:"old",requestId:evaluation.requestId!,bodies:[],keyed:false,stages:{baseBodies:[],cavityResult:null,sprueBodies:[],resolvedSprues:[],registration:{status:"unavailable",revision:null,bodies:null,report:null}},warnings:[]} satisfies FinalMoldResult; expect(canCommitMoldEvaluation({document,evaluation},result)).toBe(false); });
  it("15 restores matching document/result through Undo and Redo", async () => { await parts(); const revision=useSplitFaceStore.getState().document.revision; useSplitFaceStore.getState().setClearanceMm(12); useSplitFaceStore.getState().undo(); expect(useSplitFaceStore.getState().document.revision).toBe(revision); useSplitFaceStore.getState().redo(); expect(useSplitFaceStore.getState().document.revision).toBeGreaterThan(revision); });
  it("16 repeated evaluation starts from unchanged cavity geometry", async () => { await cavity(); const versions=useSplitFaceStore.getState().cavity.result!.bodies.map(body=>body.geometryVersion); await useSplitFaceStore.getState().createSprue(validPlacement()); const id=useSplitFaceStore.getState().sprueDefinitions[0]!.operationId; await useSplitFaceStore.getState().resizeSprue(id,3); expect(useSplitFaceStore.getState().cavity.result!.bodies.map(body=>body.geometryVersion)).toEqual(versions); });
  it("17 final display and consumers share the sole selector", async () => { await cavity(); expect(selectActiveMoldBodies(useSplitFaceStore.getState())?.map(body=>body.id)).toEqual(useSplitFaceStore.getState().lastCommittedResult?.bodies.map(body=>body.id)); });
  it("18 keeps Partition/Segmentation-style future capability unavailable", () => { const context:ViewportToolContext={workflow:"partsReady",evaluationPhase:"complete",hasReferenceGeometry:true,hasCuttingPlanes:true}; expect(isViewportToolAvailable("line",context)).toBe(false); });
});
