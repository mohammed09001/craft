import { Box3, Group, Mesh } from "three";
import { useSplitFaceStore } from "@/features/mold-generation/split-face";
import { createReferenceMoldBlock3dRuntime } from "@/features/viewport/runtime/referenceMoldBlock3dRuntime";
import { canonicalCube } from "@/features/mold-generation/cavity-generation/cavityGeneration.testFixtures";

vi.mock("@/features/mold-generation/cavity-generation/cavityGeneration.workerClient", () => ({
  cancelActiveCavityGeneration: vi.fn(),
  runCavityGenerationInWorker: vi.fn(
    async (
      input: import("@/features/mold-generation/cavity-generation/cavityGeneration.contracts").CavityGenerationInput,
    ) => {
      const [
        { validateAndPreparePartSolid },
        { createCavityTool },
        { generateCavityBodies },
      ] = await Promise.all([
        import("@/features/mold-generation/cavity-generation/partSolid.validator"),
        import("@/features/mold-generation/cavity-generation/manifold.engine"),
        import("@/features/mold-generation/cavity-generation/cavityBody.generator"),
      ]);

      const validation = validateAndPreparePartSolid(input);
      if (!validation.ok || validation.prepared === null) {
        throw Object.assign(new Error("Part geometry invalid"), { code: "part_geometry_invalid" });
      }

      const tool = await createCavityTool(validation.prepared, input.cavityClearanceMm, input.qualityMode, input.geometryToleranceMm);
      const generated = await generateCavityBodies(input, tool);
      const { subtractionDiagnostics, ...result } = generated;
      return {
        result: {
          ...result,
          diagnostics: {
            selectedEngine: "manifold-3d-wasm",
            engineReasonCodes: [],
            attempts: [],
            usedFallback: false,
            timings: { validationMs: 1, auditMs: 1, offsetMs: 1, booleanMs: 1, totalMs: 4 },
            tolerancePolicy: input.tolerancePolicy,
            subtraction: subtractionDiagnostics!,
          },
        },
        validationWarnings: validation.warnings,
      };
    },
  ),
}));

const k1={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}};
beforeEach(()=>useSplitFaceStore.getState().clearForModelReplacement());
it("renders one independent mesh per committed body and removes the full K2 surface",async()=>{const s=useSplitFaceStore.getState();s.enterSelection();s.toggleFace("front");s.toggleFace("right");await useSplitFaceStore.getState().createMoldParts("m",k1);const target=new Group();const runtime=createReferenceMoldBlock3dRuntime(vi.fn());runtime.setTarget("m",target);runtime.setDefinition(useSplitFaceStore.getState().definition);const bodies=runtime.object.getObjectByName("ReferenceMoldBodies")!;expect(bodies.children).toHaveLength(4);expect(bodies.children.every(child=>child instanceof Mesh)).toBe(true);expect(runtime.object.getObjectByName("ReferenceMoldBlockK2Surface")).toBeUndefined();runtime.dispose();expect(runtime.object.getObjectByName("ReferenceMoldBodies")).toBeUndefined();});
it("replaces stable-ID pre-cavity meshes once while preserving target ownership",async()=>{const partGeometry=canonicalCube("m",k1);const s=useSplitFaceStore.getState();s.setCanonicalPartGeometrySignature(partGeometry.sourceSignature);s.enterSelection();s.toggleFace("front");await useSplitFaceStore.getState().createMoldParts("m",k1);const base=useSplitFaceStore.getState().definition!;const target=new Group();target.name="PartModel";const runtime=createReferenceMoldBlock3dRuntime(vi.fn());runtime.setTarget("m",target);runtime.setDefinition(base);const first=runtime.object.getObjectByName("ReferenceMoldBodies")!;await useSplitFaceStore.getState().createCavity(partGeometry);const cavity=useSplitFaceStore.getState().cavity.result!;runtime.setDefinition({...base,moldBodies:cavity.bodies});const second=runtime.object.getObjectByName("ReferenceMoldBodies")!;expect(second).not.toBe(first);expect(second.parent!.children.filter(child=>child.name==="ReferenceMoldBodies")).toHaveLength(1);expect(second.children.every(child=>child.userData.referenceMoldVisualization===true)).toBe(true);expect(target.name).toBe("PartModel");runtime.dispose();});
it("renders final mold coordinates once without inheriting the displayed part transform",async()=>{const s=useSplitFaceStore.getState();s.enterSelection();s.toggleFace("front");await useSplitFaceStore.getState().createMoldParts("m",k1);const partRoot=new Group();partRoot.position.z=10;partRoot.rotateX(Math.PI/2);const target=new Group();partRoot.add(target);const runtime=createReferenceMoldBlock3dRuntime(vi.fn());runtime.setTarget("m",target);runtime.setDefinition(useSplitFaceStore.getState().definition);expect(runtime.object.position.toArray()).toEqual([0,0,0]);expect(runtime.object.quaternion.toArray()).toEqual([0,0,0,1]);expect(new Box3().setFromObject(runtime.object).min.z).toBeGreaterThanOrEqual(-1e-6);runtime.dispose();});
