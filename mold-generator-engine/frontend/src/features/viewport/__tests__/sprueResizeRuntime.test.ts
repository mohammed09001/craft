import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three";

import type { SprueDefinition } from "@/features/mold-generation/sprue-generation";
import {
  createSprueResizeRuntime,
  SPRUE_DIAMETER_SENSITIVITY_MM_PER_PIXEL,
  SPRUE_DIAMETER_SNAP_MM,
  SPRUE_FUNNEL_CURSOR,
} from "@/features/viewport/runtime/sprueResizeRuntime";

const tolerance = {
  linearToleranceMm: 0.001, areaToleranceMm2: 0.000001, volumeToleranceMm3: 1e-9,
  meaningfulVolumeMm3: 1e-6, surfaceToleranceMm: 0.004,
  outsideMarginMm: 0.008, beyondMarginMm: 0.016,
};
const sprue = (operationId = "sprue:1", x = 0, diameter = 10): SprueDefinition => ({
  operationId, targetBodyIds:["body"], position:{x,y:0,z:0}, inwardDirection:{x:0,y:0,z:-1},
  profile:{mainDiameterMm:diameter,entryNeckDiameterMm:2,entryNeckLengthMm:4}, depthMm:10,
  circularSegments:32,coordinateSpace:"mold-local",moldFrameId:"frame",tolerancePolicy:tolerance,
});
function pointer(type:string,x:number,y=50,extra:Record<string,unknown>={}) {
  const event=new Event(type,{bubbles:true,cancelable:true});
  Object.assign(event,{button:0,buttons:type==="pointermove"?0:1,clientX:x,clientY:y,isPrimary:true,pointerId:1,...extra});
  return event;
}
/** Projects a known world point through the test camera to the client pixel that will raycast-hit it. */
function projectToClient(camera:PerspectiveCamera,world:Vector3) {
  const ndc=world.clone().project(camera);
  return {x:(ndc.x+1)/2*100,y:(1-ndc.y)/2*100};
}
function moldBodyMesh(id:string) {
  const mesh=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial());
  mesh.userData.moldBodyId=id;
  return mesh;
}
function setup(definitions:readonly SprueDefinition[]=[sprue()]) {
  const host=document.createElement("div");
  const canvas=document.createElement("canvas");
  host.append(canvas);document.body.append(host);
  const rect=()=>({left:0,top:0,width:100,height:100,right:100,bottom:100,x:0,y:0,toJSON:()=>({})});
  Object.defineProperty(canvas,"getBoundingClientRect",{value:rect});
  Object.defineProperty(host,"getBoundingClientRect",{value:rect});
  Object.defineProperty(host,"clientWidth",{value:100});
  Object.defineProperty(host,"clientHeight",{value:100});
  Object.assign(canvas,{setPointerCapture:vi.fn(),releasePointerCapture:vi.fn()});
  const camera=new PerspectiveCamera(50,1,.1,200);camera.position.set(0,0,100);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();
  const controls={enabled:true};const commit=vi.fn(async()=>true);const commitEntryNeck=vi.fn(async()=>true);
  const moldRoot=new Group();
  const runtime=createSprueResizeRuntime({camera,canvas,host,controls,invalidate:vi.fn(),onDiameterCommit:commit,onEntryNeckDiameterCommit:commitEntryNeck});
  runtime.setMoldRoot(moldRoot);runtime.setSprues(definitions);runtime.setActive(true);runtime.object.updateWorldMatrix(true,true);
  return {camera,canvas,commit,commitEntryNeck,controls,host,moldRoot,runtime};
}

describe("Sprue resize runtime",()=>{
  it("prioritizes a rim hover and restores the funnel cursor when leaving",()=>{
    const {canvas,runtime}=setup();
    canvas.dispatchEvent(pointer("pointermove",55));
    expect(runtime.getInteractionState()).toBe("rim-hover");
    expect(canvas.style.cursor).toBe("ew-resize");
    canvas.dispatchEvent(pointer("pointermove",5));
    expect(runtime.getInteractionState()).toBe("idle");
    expect(canvas.style.cursor).toBe(SPRUE_FUNNEL_CURSOR);
    runtime.dispose();
  });

  it("previews snapped diameter, reports it live, blocks controls, and commits once",async()=>{
    const {canvas,commit,controls,host,runtime}=setup();
    canvas.dispatchEvent(pointer("pointerdown",55));
    expect(runtime.getInteractionState()).toBe("resizing");expect(controls.enabled).toBe(false);
    canvas.dispatchEvent(pointer("pointermove",66,50,{buttons:1}));
    const expected=Math.round((10+11*SPRUE_DIAMETER_SENSITIVITY_MM_PER_PIXEL)/SPRUE_DIAMETER_SNAP_MM)*SPRUE_DIAMETER_SNAP_MM;
    expect(host.querySelector("[data-sprue-diameter-label]")?.textContent).toBe(`Ø ${expected.toFixed(2)} mm`);
    canvas.dispatchEvent(pointer("pointerup",66));
    expect(controls.enabled).toBe(true);expect(runtime.getInteractionState()).toBe("rim-hover");
    expect(commit).toHaveBeenCalledTimes(1);expect(commit).toHaveBeenCalledWith("sprue:1",expected);
    expect((host.querySelector("[data-sprue-diameter-label]") as HTMLElement).style.display).toBe("none");
    runtime.dispose();
  });

  it("uses Shift for free precision, clamps limits, and Escape creates no commit",()=>{
    const {canvas,commit,controls,runtime}=setup();
    canvas.dispatchEvent(pointer("pointerdown",55));
    canvas.dispatchEvent(pointer("pointermove",56,50,{buttons:1,shiftKey:true}));
    expect(document.querySelector("[data-sprue-diameter-label]")?.textContent).toBe("Ø 10.05 mm");
    window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));
    expect(commit).not.toHaveBeenCalled();expect(controls.enabled).toBe(true);
    canvas.dispatchEvent(pointer("pointerdown",55));
    canvas.dispatchEvent(pointer("pointermove",2000,50,{buttons:1}));
    expect(document.querySelector("[data-sprue-diameter-label]")?.textContent).toBe("Ø 50.00 mm");
    canvas.dispatchEvent(pointer("pointerup",2000));
    expect(commit).toHaveBeenCalledWith("sprue:1",50);
    runtime.dispose();
  });

  it("opens compact numeric entry and clears transient UI on deactivation/disposal",()=>{
    const {canvas,commit,host,runtime}=setup();
    canvas.dispatchEvent(new MouseEvent("dblclick",{bubbles:true,cancelable:true,clientX:55,clientY:50}));
    const input=host.querySelector("[data-sprue-diameter-input]") as HTMLInputElement;
    expect(input.value).toBe("10.00");expect(runtime.getInteractionState()).toBe("numeric-edit");
    input.value="12.5";input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
    expect(commit).toHaveBeenCalledWith("sprue:1",12.5);
    canvas.dispatchEvent(pointer("pointerdown",55));runtime.setActive(false);
    expect(runtime.getInteractionState()).toBe("idle");expect(canvas.style.cursor).toBe("");
    expect(host.querySelector("[data-sprue-diameter-input]")).toBeNull();
    runtime.dispose();expect(host.querySelector("[data-sprue-diameter-label]")).toBeNull();
  });

  it("supports independent hover, drag-resize, and commit on the lower (entry neck) opening",()=>{
    const {camera,canvas,commit,commitEntryNeck,controls,host,runtime}=setup();
    const {x,y}=projectToClient(camera,new Vector3(1,0,-10));
    canvas.dispatchEvent(pointer("pointermove",x,y));
    expect(runtime.getInteractionState()).toBe("rim-hover");
    expect(canvas.style.cursor).toBe("ew-resize");
    canvas.dispatchEvent(pointer("pointerdown",x,y));
    expect(runtime.getInteractionState()).toBe("resizing");expect(controls.enabled).toBe(false);
    canvas.dispatchEvent(pointer("pointermove",x+11,y,{buttons:1}));
    const expected=Math.round((2+11*SPRUE_DIAMETER_SENSITIVITY_MM_PER_PIXEL)/SPRUE_DIAMETER_SNAP_MM)*SPRUE_DIAMETER_SNAP_MM;
    expect(host.querySelector("[data-sprue-diameter-label]")?.textContent).toBe(`Ø ${expected.toFixed(2)} mm`);
    canvas.dispatchEvent(pointer("pointerup",x+11,y));
    expect(controls.enabled).toBe(true);expect(runtime.getInteractionState()).toBe("rim-hover");
    expect(commitEntryNeck).toHaveBeenCalledTimes(1);expect(commitEntryNeck).toHaveBeenCalledWith("sprue:1",expected);
    expect(commit).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("clamps the lower opening to the main diameter and never exceeds it",()=>{
    const {camera,canvas,commitEntryNeck,runtime}=setup();
    const {x,y}=projectToClient(camera,new Vector3(1,0,-10));
    canvas.dispatchEvent(pointer("pointerdown",x,y));
    canvas.dispatchEvent(pointer("pointermove",x+2000,y,{buttons:1}));
    canvas.dispatchEvent(pointer("pointerup",x+2000));
    expect(commitEntryNeck).toHaveBeenCalledWith("sprue:1",10);
    runtime.dispose();
  });

  it("hides only the owning Sprue body while its handle is hovered or dragged, never the rest of the mold",()=>{
    const {canvas,moldRoot,runtime}=setup();
    const owningBody=moldBodyMesh("body");
    const unrelatedBody=moldBodyMesh("other-body");
    moldRoot.add(owningBody,unrelatedBody);
    runtime.setMoldRoot(moldRoot);
    expect(owningBody.visible).toBe(true);expect(unrelatedBody.visible).toBe(true);
    canvas.dispatchEvent(pointer("pointermove",55));
    expect(runtime.getInteractionState()).toBe("rim-hover");
    expect(owningBody.visible).toBe(false);expect(unrelatedBody.visible).toBe(true);
    canvas.dispatchEvent(pointer("pointerdown",55));
    expect(runtime.getInteractionState()).toBe("resizing");
    expect(owningBody.visible).toBe(false);expect(unrelatedBody.visible).toBe(true);
    canvas.dispatchEvent(pointer("pointerup",55));
    expect(owningBody.visible).toBe(false);expect(unrelatedBody.visible).toBe(true);
    canvas.dispatchEvent(pointer("pointermove",5));
    expect(runtime.getInteractionState()).toBe("idle");
    expect(owningBody.visible).toBe(true);expect(unrelatedBody.visible).toBe(true);
    runtime.dispose();
  });

  it("never hides any body for a pending Sprue whose owning body is not yet resolved",()=>{
    const pending=sprue();
    const {canvas,moldRoot,runtime}=setup([{...pending,targetBodyIds:[]} as unknown as SprueDefinition]);
    const body=moldBodyMesh("body");
    moldRoot.add(body);
    runtime.setMoldRoot(moldRoot);
    canvas.dispatchEvent(pointer("pointermove",55));
    expect(runtime.getInteractionState()).toBe("rim-hover");
    expect(body.visible).toBe(true);
    runtime.dispose();
  });

  it("restores owning-body visibility when deactivated or disposed mid-hover",()=>{
    const {canvas,moldRoot,runtime}=setup();
    const body=moldBodyMesh("body");
    moldRoot.add(body);
    runtime.setMoldRoot(moldRoot);
    canvas.dispatchEvent(pointer("pointermove",55));
    expect(body.visible).toBe(false);
    runtime.setActive(false);
    expect(body.visible).toBe(true);
    runtime.dispose();
  });
});
