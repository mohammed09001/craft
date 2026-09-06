import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3, DoubleSide, type PerspectiveCamera } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clampNormalizedPosition, normalizedToWorldCoordinate, worldToNormalizedPosition, type Bounds3, type CuttingPlaneRecord, type PartBoundingBoxFaceId } from "@/features/mold-generation/split-face";

export const CUTTING_PLANE_COLORS = { idle: 0xf59e0b, hover: 0xffb52e, dragging: 0xef3038 } as const;
export const CUTTING_PLANE_DRAG_THRESHOLD_PX = 4;
type Assembly={record:CuttingPlaneRecord;group:Group;surface:Mesh<BoxGeometry,MeshBasicMaterial>;edges:LineSegments<EdgesGeometry,LineBasicMaterial>};
type Options={camera:PerspectiveCamera;canvas:HTMLCanvasElement;controls:OrbitControls;invalidate:()=>void;onDragStart:(id:string)=>void;onDragCommit:(id:string,normalized:number)=>void;onDragCancel:()=>void;onErasePlane?:(faceId:PartBoundingBoxFaceId)=>void};

export function createCuttingPlane3dRuntime({camera,canvas,controls,invalidate,onDragStart,onDragCommit,onDragCancel,onErasePlane}:Options){
  const root=new Group();root.name="Interactive Cutting Planes";
  const raycaster=new Raycaster();const pointer=new Vector2();const assemblies=new Map<string,Assembly>();
  let k1:Bounds3|null=null;
  let eraserInteractionActive = false;let target:import("three").Object3D|null=null;let hovered:string|null=null;let drag:null|{id:string;pointerId:number;startX:number;startY:number;startCoordinate:number;startHit:Vector3;reference:Plane;moved:boolean;controlsWereEnabled:boolean}=null;
  const setPointer=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();pointer.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(pointer,camera);};
  const color=(a:Assembly,state:"idle"|"hover"|"dragging")=>{a.surface.material.color.setHex(CUTTING_PLANE_COLORS[state]);a.surface.material.opacity=state==="idle"?.22:state==="hover"?.32:.38;a.edges.material.color.setHex(CUTTING_PLANE_COLORS[state]);a.edges.material.opacity=state==="idle"?.7:1;};
  const restoreCursor=()=>{canvas.style.cursor=hovered===null?"":"grab";};
    const setEraserHoverVisual = (
    assembly: Assembly,
    active: boolean,
  ) => {
    if (active) {
      assembly.surface.material.color.setHex(0xef3038);
      assembly.surface.material.opacity = 0.42;
      assembly.edges.material.color.setHex(0xef3038);
      assembly.edges.material.opacity = 1;
      return;
    }

    color(assembly, "idle");
  };

  const clearEraserHover = () => {
    if (hovered === null) {
      return;
    }

    const assembly = assemblies.get(hovered);

    if (assembly !== undefined) {
      setEraserHoverVisual(assembly, false);
    }

    hovered = null;
    invalidate();
  };
const pick=(e:PointerEvent)=>{setPointer(e);const hits=raycaster.intersectObjects([...assemblies.values()].filter(a=>a.group.visible).map(a=>a.surface),false);return hits[0]?.object.userData.planeId as string|undefined;};
  const updateCoordinate=(a:Assembly,coordinate:number)=>{a.group.position[a.record.axis]=coordinate;};
  const clear=()=>{for(const a of assemblies.values()){root.remove(a.group);a.surface.geometry.dispose();a.surface.material.dispose();a.edges.geometry.dispose();a.edges.material.dispose();}assemblies.clear();hovered=null;};const setTarget=(nextTarget:import("three").Object3D|null)=>{if(target===nextTarget)return;root.removeFromParent();target=nextTarget;if(target!==null)target.add(root);invalidate();};
  const cancel=()=>{if(drag===null)return;const a=assemblies.get(drag.id);if(a!==undefined){updateCoordinate(a,drag.startCoordinate);color(a,"idle");}controls.enabled=drag.controlsWereEnabled;try{canvas.releasePointerCapture(drag.pointerId);}catch{/* capture may already be lost */}drag=null;onDragCancel();restoreCursor();invalidate();};
  const onDown=(e:PointerEvent)=>{
    if (eraserInteractionActive) {
      if (
        e.button !== 0 ||
        !e.isPrimary ||
        k1 === null
      ) {
        return;
      }

      const id = pick(e);

      if (id === undefined) {
        return;
      }

      const assembly = assemblies.get(id);

      if (assembly === undefined) {
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();

      clearEraserHover();
      onErasePlane?.(assembly.record.sourceFaceId);
      return;
    }if(e.button!==2||!e.isPrimary||k1===null)return;const id=pick(e);if(id===undefined)return;const a=assemblies.get(id);if(a===undefined)return;e.preventDefault();e.stopImmediatePropagation();const axis=new Vector3(a.record.axis==="x"?1:0,a.record.axis==="y"?1:0,a.record.axis==="z"?1:0);const view=new Vector3();camera.getWorldDirection(view);let normal=view.clone().addScaledVector(axis,-view.dot(axis));if(normal.lengthSq()<1e-8){normal=camera.up.clone().addScaledVector(axis,-camera.up.dot(axis));}normal.normalize();const startCoordinate=normalizedToWorldCoordinate(k1,a.record.axis,a.record.normalizedPosition);const origin=new Vector3();origin[a.record.axis]=startCoordinate;const reference=new Plane().setFromNormalAndCoplanarPoint(normal,origin);const startHit=new Vector3();if(raycaster.ray.intersectPlane(reference,startHit)===null)return;drag={id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,startCoordinate,startHit,reference,moved:false,controlsWereEnabled:controls.enabled};controls.enabled=false;canvas.setPointerCapture(e.pointerId);hovered=id;color(a,"dragging");canvas.style.cursor="grabbing";onDragStart(id);invalidate();};
  const onMove=(e:PointerEvent)=>{
    if (eraserInteractionActive) {
      const eraserHoveredId = pick(e) ?? null;

      if (eraserHoveredId === hovered) {
        return;
      }

      if (hovered !== null) {
        const previous = assemblies.get(hovered);

        if (previous !== undefined) {
          setEraserHoverVisual(previous, false);
        }
      }

      hovered = eraserHoveredId;

      if (hovered !== null) {
        const next = assemblies.get(hovered);

        if (next !== undefined) {
          setEraserHoverVisual(next, true);
        }
      }

      invalidate();
      return;
    }if(drag!==null&&drag.pointerId===e.pointerId&&k1!==null){e.preventDefault();const a=assemblies.get(drag.id);if(a===undefined)return;setPointer(e);const hit=new Vector3();if(raycaster.ray.intersectPlane(drag.reference,hit)===null)return;const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(!drag.moved&&Math.hypot(dx,dy)<CUTTING_PLANE_DRAG_THRESHOLD_PX)return;drag.moved=true;const axis=new Vector3(a.record.axis==="x"?1:0,a.record.axis==="y"?1:0,a.record.axis==="z"?1:0);const candidate=drag.startCoordinate+hit.sub(drag.startHit).dot(axis);const normalized=worldToNormalizedPosition(k1,a.record.axis,candidate);updateCoordinate(a,normalizedToWorldCoordinate(k1,a.record.axis,normalized));invalidate();return;}const id=pick(e)??null;if(id===hovered)return;if(hovered!==null){const old=assemblies.get(hovered);if(old)color(old,"idle");}hovered=id;if(id!==null){const next=assemblies.get(id);if(next)color(next,"hover");}restoreCursor();invalidate();};
  const finish=(e:PointerEvent)=>{if(drag===null||drag.pointerId!==e.pointerId||k1===null)return;e.preventDefault();const current=drag;const a=assemblies.get(current.id);controls.enabled=current.controlsWereEnabled;try{canvas.releasePointerCapture(e.pointerId);}catch{/* capture may already be lost */}drag=null;if(a!==undefined){color(a,"idle");if(current.moved){const coordinate=a.group.position[a.record.axis];onDragCommit(current.id,clampNormalizedPosition(worldToNormalizedPosition(k1,a.record.axis,coordinate),k1,a.record.axis));}else{updateCoordinate(a,current.startCoordinate);onDragCancel();}}restoreCursor();invalidate();};
  const context=(e:MouseEvent)=>{if(drag!==null||pick(e as unknown as PointerEvent)!==undefined)e.preventDefault();};
  const leave=()=>{if(drag===null){if(hovered!==null){const a=assemblies.get(hovered);if(a)color(a,"idle");}hovered=null;restoreCursor();invalidate();}};
  canvas.addEventListener("pointerdown",onDown,true);canvas.addEventListener("pointermove",onMove);canvas.addEventListener("pointerup",finish);canvas.addEventListener("pointercancel",cancel);canvas.addEventListener("lostpointercapture",cancel);canvas.addEventListener("pointerleave",leave);canvas.addEventListener("contextmenu",context);
  return {
    root,
    setEraserInteractionActive: (active: boolean) => {
      if (eraserInteractionActive === active) {
        return;
      }

      clearEraserHover();
      eraserInteractionActive = active;

      if (active && drag !== null) {
        cancel();
      }

      invalidate();
    },setTarget,setPlanes:(bounds:Bounds3|null,outer:Bounds3|null,records:readonly CuttingPlaneRecord[])=>{if(drag!==null)cancel();clear();k1=bounds;if(bounds===null||outer===null)return;for(const record of records.filter(p=>p.enabled)){const sx=outer.max.x-outer.min.x,sy=outer.max.y-outer.min.y,sz=outer.max.z-outer.min.z;const dims=record.axis==="x"?[.02,sy,sz]:record.axis==="y"?[sx,.02,sz]:[sx,sy,.02];const geometry=new BoxGeometry(...dims);const material=new MeshBasicMaterial({color:CUTTING_PLANE_COLORS.idle,transparent:true,opacity:.22,depthWrite:false,side:DoubleSide});const surface=new Mesh(geometry,material);surface.userData.planeId=record.id;const edgeGeometry=new EdgesGeometry(geometry);const edges=new LineSegments(edgeGeometry,new LineBasicMaterial({color:CUTTING_PLANE_COLORS.idle,transparent:true,opacity:.7}));const group=new Group();group.position.set((outer.min.x+outer.max.x)/2,(outer.min.y+outer.max.y)/2,(outer.min.z+outer.max.z)/2);group.position[record.axis]=normalizedToWorldCoordinate(bounds,record.axis,record.normalizedPosition);group.add(surface,edges);root.add(group);assemblies.set(record.id,{record,group,surface,edges});}invalidate();},dispose:()=>{cancel();clear();root.removeFromParent();target=null;canvas.removeEventListener("pointerdown",onDown,true);canvas.removeEventListener("pointermove",onMove);canvas.removeEventListener("pointerup",finish);canvas.removeEventListener("pointercancel",cancel);canvas.removeEventListener("lostpointercapture",cancel);canvas.removeEventListener("pointerleave",leave);canvas.removeEventListener("contextmenu",context);canvas.style.cursor="";}};
}


