import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCuttingPlane, normalizedToWorldCoordinate } from "@/features/mold-generation/split-face";
import { CUTTING_PLANE_COLORS, createCuttingPlane3dRuntime } from "@/features/viewport/runtime/cuttingPlane3dRuntime";

const k1={min:{x:0,y:0,z:0},max:{x:10,y:20,z:30}};
const k2={min:{x:-5,y:-5,z:-5},max:{x:15,y:25,z:35}};
it("creates one orange, double-sided K2-sized assembly per canonical plane without duplicates",()=>{
 const canvas=document.createElement("canvas");Object.defineProperty(canvas,"getBoundingClientRect",{value:()=>({left:0,top:0,width:100,height:100,right:100,bottom:100,x:0,y:0,toJSON:()=>({})})});
 const controls={enabled:true} as OrbitControls;const invalidate=vi.fn();const runtime=createCuttingPlane3dRuntime({camera:new PerspectiveCamera(),canvas,controls,invalidate,onDragStart:vi.fn(),onDragCommit:vi.fn(),onDragCancel:vi.fn()});
 runtime.setPlanes(k1,k2,[createCuttingPlane("front"),createCuttingPlane("right")]);expect(runtime.root.children).toHaveLength(2);const surface=runtime.root.children[0]!.children.find(c=>c instanceof Mesh) as Mesh<BoxGeometry,MeshBasicMaterial>;expect(surface.material.color.getHex()).toBe(CUTTING_PLANE_COLORS.idle);expect(surface.geometry.parameters).toMatchObject({width:20,height:.02,depth:40});
 runtime.setPlanes(k1,k2,[createCuttingPlane("front")]);expect(runtime.root.children).toHaveLength(1);runtime.dispose();expect(runtime.root.children).toHaveLength(0);expect(canvas.style.cursor).toBe("");
});
it("keeps canonical plane coordinates in target local space under grounding and rotation", () => {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });

  const runtime = createCuttingPlane3dRuntime({
    camera: new PerspectiveCamera(),
    canvas,
    controls: { enabled: true } as OrbitControls,
    invalidate: vi.fn(),
    onDragStart: vi.fn(),
    onDragCommit: vi.fn(),
    onDragCancel: vi.fn(),
  });

  const target = new Group();
  target.position.set(40, -15, 8);
  target.rotation.set(0, 0, Math.PI / 2);

  const runtimeWithTarget = runtime as typeof runtime & {
    setTarget: (target: Group | null) => void;
  };

  expect(typeof runtimeWithTarget.setTarget).toBe("function");

  runtimeWithTarget.setTarget(target);

  const plane = createCuttingPlane("front");
  runtime.setPlanes(k1, k2, [plane]);

  target.updateWorldMatrix(true, true);

  const planeAssembly = runtime.root.children[0];
  expect(planeAssembly).toBeDefined();

  const expectedLocalCenter = new Vector3(
    (k2.min.x + k2.max.x) / 2,
    (k2.min.y + k2.max.y) / 2,
    (k2.min.z + k2.max.z) / 2,
  );
  expectedLocalCenter[plane.axis] = normalizedToWorldCoordinate(
    k1,
    plane.axis,
    plane.normalizedPosition,
  );

  const expectedWorldCenter = target.localToWorld(expectedLocalCenter);
  const actualWorldCenter = planeAssembly!.getWorldPosition(new Vector3());

  expect(actualWorldCenter.x).toBeCloseTo(expectedWorldCenter.x, 5);
  expect(actualWorldCenter.y).toBeCloseTo(expectedWorldCenter.y, 5);
  expect(actualWorldCenter.z).toBeCloseTo(expectedWorldCenter.z, 5);

  runtime.dispose();
});