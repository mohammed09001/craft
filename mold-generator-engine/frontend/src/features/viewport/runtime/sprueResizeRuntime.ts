import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Material,
} from "three";

import {
  MAX_SPRUE_DIAMETER_MM,
  MIN_SPRUE_DIAMETER_MM,
  normalizeSprueDiameterMm,
  normalizeSprueEntryNeckDiameterMm,
  type SpruePresentationDefinition,
} from "@/features/mold-generation/sprue-generation";
import { normalizePointerToNdc } from "./pointerSelection";
import { isMoldBodyMesh } from "./spruePreview3dRuntime";

export const SPRUE_DIAMETER_SNAP_MM = 0.25;
export const SPRUE_DIAMETER_SENSITIVITY_MM_PER_PIXEL = 0.05;
const HANDLE_COLOR = 0x3ea36d;
const HANDLE_HOVER_COLOR = 0x67c58f;
const HANDLE_ACTIVE_COLOR = 0xf0b44d;
const HANDLE_PENDING_COLOR = 0xd8a43b;
const HANDLE_INVALID_COLOR = 0xb33a36;
export const SPRUE_FUNNEL_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M5 5h18l-7 9v8l-4 2V14L5 5Z' fill='%23f3f4f6' stroke='%23111827' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E") 14 7, crosshair`;

type InteractionState = "idle" | "rim-hover" | "resizing" | "numeric-edit";
type HandleOpening = "top" | "bottom";
type Handle = {
  readonly sprue: SpruePresentationDefinition;
  readonly opening: HandleOpening;
  readonly group: Group;
  readonly visual: Mesh<TorusGeometry, MeshBasicMaterial>;
  readonly target: Mesh<TorusGeometry, MeshBasicMaterial>;
};
type Drag = {
  readonly handle: Handle;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly originalDiameterMm: number;
  readonly controlsWereEnabled: boolean;
  previewDiameterMm: number;
};

export interface SprueResizeRuntime {
  readonly object: Group;
  dispose(): void;
  getInteractionState(): InteractionState;
  setActive(active: boolean): void;
  setMoldRoot(root: Group | null): void;
  setSprues(sprues: readonly SpruePresentationDefinition[]): void;
}

export function createSprueResizeRuntime(options: {
  readonly camera: Camera;
  readonly canvas: HTMLCanvasElement;
  readonly host: HTMLElement;
  readonly controls: { enabled: boolean };
  readonly invalidate: () => void;
  readonly onDiameterCommit: (operationId: string, diameterMm: number) => Promise<boolean>;
  readonly onEntryNeckDiameterCommit: (operationId: string, diameterMm: number) => Promise<boolean>;
}): SprueResizeRuntime {
  const { camera, canvas, host, controls, invalidate, onDiameterCommit, onEntryNeckDiameterCommit } = options;
  const object = new Group();
  object.name = "SprueResizeHandles";
  const raycaster = new Raycaster();
  const pointerNdc = new Vector2();
  const zAxis = new Vector3(0, 0, 1);
  const worldPoint = new Vector3();
  const worldDirection = new Vector3();
  const inwardScratch = new Vector3();
  const orientation = new Quaternion();
  let moldRoot: Group | null = null;
  let sprues: readonly SpruePresentationDefinition[] = [];
  let handles: Handle[] = [];
  let hovered: Handle | null = null;
  let drag: Drag | null = null;
  let numericInput: HTMLInputElement | null = null;
  let active = false;
  let disposed = false;
  const moldTargets: Mesh<BufferGeometry, Material>[] = [];
  const hiddenBodyVisibility = new Map<Mesh<BufferGeometry, Material>, boolean>();

  const label = document.createElement("div");
  label.dataset.sprueDiameterLabel = "true";
  Object.assign(label.style, {
    position: "absolute", zIndex: "8", display: "none", pointerEvents: "none",
    padding: "3px 7px", borderRadius: "4px", border: "1px solid var(--border-subtle)",
    background: "color-mix(in srgb, var(--surface-panel) 92%, transparent)",
    color: "var(--text-primary)", font: "12px/1.3 ui-monospace, monospace",
    whiteSpace: "nowrap",
  });
  host.append(label);

  function interactionState(): InteractionState {
    if (drag !== null) return "resizing";
    if (numericInput !== null) return "numeric-edit";
    return hovered === null ? "idle" : "rim-hover";
  }
  function cursor() {
    canvas.style.cursor = !active ? "" : drag !== null ? "ew-resize" : hovered !== null ? "ew-resize" : SPRUE_FUNNEL_CURSOR;
  }
  function color(handle: Handle, state: "idle" | "hover" | "active") {
    const idleColor=handle.sprue.status==="pending"?HANDLE_PENDING_COLOR:handle.sprue.status==="invalid"?HANDLE_INVALID_COLOR:HANDLE_COLOR;
    handle.visual.material.color.setHex(state === "active" ? HANDLE_ACTIVE_COLOR : state === "hover" ? HANDLE_HOVER_COLOR : idleColor);
    handle.visual.material.opacity = state === "idle" ? 0.72 : 1;
    handle.visual.scale.setScalar(state === "idle" ? 1 : state === "hover" ? 1.08 : 1.12);
  }
  function diameterMmOf(handle: Handle): number {
    return handle.opening === "top" ? handle.sprue.profile.mainDiameterMm : handle.sprue.profile.entryNeckDiameterMm;
  }
  function minimumDiameterMm(handle: Handle): number {
    return handle.opening === "top"
      ? Math.max(MIN_SPRUE_DIAMETER_MM, handle.sprue.profile.entryNeckDiameterMm)
      : MIN_SPRUE_DIAMETER_MM;
  }
  function maximumDiameterMm(handle: Handle): number {
    return handle.opening === "top" ? MAX_SPRUE_DIAMETER_MM : handle.sprue.profile.mainDiameterMm;
  }
  function normalizeForHandle(handle: Handle, diameterMm: number): number | null {
    return handle.opening === "top"
      ? normalizeSprueDiameterMm(diameterMm, handle.sprue.profile.entryNeckDiameterMm)
      : normalizeSprueEntryNeckDiameterMm(diameterMm, handle.sprue.profile.mainDiameterMm);
  }
  function commitForHandle(handle: Handle, diameterMm: number): Promise<boolean> {
    return handle.opening === "top"
      ? onDiameterCommit(handle.sprue.operationId, diameterMm)
      : onEntryNeckDiameterCommit(handle.sprue.operationId, diameterMm);
  }
  function positionOverlay(element: HTMLElement, clientX: number, clientY: number) {
    const bounds = host.getBoundingClientRect();
    const left = Math.max(6, Math.min(bounds.width - 110, clientX - bounds.left + 12));
    const top = Math.max(6, Math.min(bounds.height - 34, clientY - bounds.top - 28));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }
  function showLabel(diameterMm: number, minMm: number, maxMm: number, event: PointerEvent) {
    label.textContent = `Ø ${diameterMm.toFixed(2)} mm`;
    label.style.color = diameterMm <= minMm || diameterMm >= maxMm
      ? "var(--color-warning, #d18b24)" : "var(--text-primary)";
    label.style.display = "block";
    positionOverlay(label, event.clientX, event.clientY);
  }
  function hideLabel() { label.style.display = "none"; }
  function collectMoldTargets() {
    moldTargets.length = 0;
    moldRoot?.traverse((descendant) => {
      if (isMoldBodyMesh(descendant)) moldTargets.push(descendant);
    });
  }
  /** Owning-body meshes for a handle's Sprue; empty until the Sprue is resolved (nothing to hide for a pending Sprue). */
  function owningBodyMeshes(handle: Handle): Mesh<BufferGeometry, Material>[] {
    const targetBodyIds = handle.sprue.targetBodyIds;
    if (targetBodyIds === undefined || targetBodyIds.length === 0) return [];
    return moldTargets.filter(target => typeof target.userData.moldBodyId === "string" && targetBodyIds.includes(target.userData.moldBodyId));
  }
  function hideOwningBody(handle: Handle) {
    for (const target of owningBodyMeshes(handle)) {
      if (!hiddenBodyVisibility.has(target)) hiddenBodyVisibility.set(target, target.visible);
      target.visible = false;
    }
    invalidate();
  }
  function restoreOwningBody() {
    if (hiddenBodyVisibility.size === 0) return;
    for (const [target, visible] of hiddenBodyVisibility) target.visible = visible;
    hiddenBodyVisibility.clear();
    invalidate();
  }
  function setHovered(next: Handle | null) {
    if (hovered === next) return;
    if (hovered !== null && hovered !== drag?.handle) color(hovered, "idle");
    const previous = hovered;
    hovered = next;
    if (hovered !== null) color(hovered, drag?.handle === hovered ? "active" : "hover");
    if (previous !== next) {
      restoreOwningBody();
      if (next !== null) hideOwningBody(next);
    }
    cursor();
    invalidate();
  }
  function disposeHandles() {
    setHovered(null);
    for (const handle of handles) {
      handle.group.removeFromParent();
      handle.visual.geometry.dispose();
      handle.visual.material.dispose();
      handle.target.geometry.dispose();
      handle.target.material.dispose();
    }
    handles = [];
  }
  function axisWorldDirection(sprue: SpruePresentationDefinition): Vector3 {
    return worldDirection.set(-sprue.inwardDirection.x, -sprue.inwardDirection.y, -sprue.inwardDirection.z)
      .transformDirection(moldRoot!.matrixWorld).normalize();
  }
  function addHandle(sprue: SpruePresentationDefinition, opening: HandleOpening, position: Vector3, radiusMm: number) {
    const group = new Group();
    group.name = `SprueResizeHandle:${sprue.operationId}:${opening}`;
    group.position.copy(position);
    orientation.setFromUnitVectors(zAxis, axisWorldDirection(sprue));
    group.quaternion.copy(orientation);
    const visual = new Mesh(new TorusGeometry(radiusMm, Math.max(0.12, radiusMm * 0.045), 8, 32), new MeshBasicMaterial({
      color: HANDLE_COLOR, transparent: true, opacity: 0.72, depthTest: false,
    }));
    visual.renderOrder = 20;
    const target = new Mesh(new TorusGeometry(radiusMm, Math.max(0.45, radiusMm * 0.16), 8, 32), new MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false,
    }));
    target.userData.sprueResizeOperationId = sprue.operationId;
    target.userData.sprueResizeOpening = opening;
    group.add(visual, target);
    object.add(group);
    const handle: Handle = { sprue, opening, group, visual, target };
    handles.push(handle);
    color(handle, "idle");
  }
  function rebuildHandles() {
    disposeHandles();
    if (moldRoot === null) return;
    moldRoot.updateWorldMatrix(true, false);
    for (const sprue of sprues) {
      worldPoint.set(sprue.position.x, sprue.position.y, sprue.position.z);
      moldRoot.localToWorld(worldPoint);
      addHandle(sprue, "top", worldPoint, sprue.profile.mainDiameterMm / 2);
      if (sprue.depthMm !== undefined) {
        inwardScratch.set(sprue.inwardDirection.x, sprue.inwardDirection.y, sprue.inwardDirection.z);
        worldPoint
          .set(sprue.position.x, sprue.position.y, sprue.position.z)
          .addScaledVector(inwardScratch, sprue.depthMm);
        moldRoot.localToWorld(worldPoint);
        addHandle(sprue, "bottom", worldPoint, sprue.profile.entryNeckDiameterMm / 2);
      }
    }
    object.visible = active;
    invalidate();
  }
  function pick(event: PointerEvent | MouseEvent): Handle | null {
    const normalized = normalizePointerToNdc(event, canvas.getBoundingClientRect(), pointerNdc);
    if (normalized === null) return null;
    raycaster.setFromCamera(normalized, camera);
    const hit = raycaster.intersectObjects(handles.map(handle => handle.target), false)[0]?.object;
    return handles.find(handle => handle.target === hit) ?? null;
  }
  function preview(handle: Handle, diameterMm: number) {
    const ratio = diameterMm / diameterMmOf(handle);
    handle.group.scale.set(ratio, ratio, 1);
    color(handle, "active");
    invalidate();
  }
  function cancelDrag() {
    if (drag === null) return;
    const current = drag;
    drag = null;
    current.handle.group.scale.setScalar(1);
    controls.enabled = current.controlsWereEnabled;
    try { canvas.releasePointerCapture(current.pointerId); } catch { /* already released */ }
    hideLabel();
    color(current.handle, hovered === current.handle ? "hover" : "idle");
    cursor();
    invalidate();
  }
  function closeNumeric() {
    numericInput?.remove();
    numericInput = null;
    cursor();
  }
  function openNumeric(handle: Handle, event: MouseEvent) {
    closeNumeric();
    const input = document.createElement("input");
    numericInput = input;
    input.dataset.sprueDiameterInput = "true";
    input.type = "number";
    input.min = String(MIN_SPRUE_DIAMETER_MM);
    input.max = String(maximumDiameterMm(handle));
    input.step = String(SPRUE_DIAMETER_SNAP_MM);
    input.value = diameterMmOf(handle).toFixed(2);
    Object.assign(input.style, { position: "absolute", zIndex: "9", width: "92px", padding: "4px 6px",
      border: "1px solid var(--border-strong)", borderRadius: "4px", background: "var(--surface-panel)",
      color: "var(--text-primary)", font: "12px ui-monospace, monospace" });
    positionOverlay(input, event.clientX, event.clientY);
    host.append(input);
    const commit = () => {
      const value = normalizeForHandle(handle, Number(input.value));
      if (value === null) { input.setCustomValidity("Enter a finite diameter in millimeters."); input.reportValidity(); return; }
      closeNumeric();
      void commitForHandle(handle, value);
    };
    input.addEventListener("keydown", inputEvent => {
      inputEvent.stopPropagation();
      if (inputEvent.key === "Enter") commit();
      if (inputEvent.key === "Escape") closeNumeric();
    });
    input.addEventListener("blur", () => closeNumeric(), { once: true });
    input.focus();
    input.select();
  }
  function onPointerMove(event: PointerEvent) {
    if (!active || !event.isPrimary) return;
    if (drag !== null && drag.pointerId === event.pointerId) {
      event.preventDefault(); event.stopImmediatePropagation();
      const pixels = event.clientX - drag.startX - (event.clientY - drag.startY) * 0.25;
      const raw = drag.originalDiameterMm + pixels * SPRUE_DIAMETER_SENSITIVITY_MM_PER_PIXEL;
      const adjusted = event.shiftKey ? raw : Math.round(raw / SPRUE_DIAMETER_SNAP_MM) * SPRUE_DIAMETER_SNAP_MM;
      drag.previewDiameterMm = normalizeForHandle(drag.handle, adjusted)!;
      preview(drag.handle, drag.previewDiameterMm);
      showLabel(
        drag.previewDiameterMm,
        minimumDiameterMm(drag.handle),
        maximumDiameterMm(drag.handle),
        event,
      );
      return;
    }
    if (numericInput !== null) { event.stopImmediatePropagation(); return; }
    if (event.buttons !== 0) return;
    const next = pick(event);
    setHovered(next);
    if (next !== null) event.stopImmediatePropagation();
  }
  function onPointerDown(event: PointerEvent) {
    if (!active || !event.isPrimary || event.button !== 0 || numericInput !== null) return;
    const handle = pick(event);
    if (handle === null) return;
    event.preventDefault(); event.stopImmediatePropagation();
    setHovered(handle);
    const diameterMm = diameterMmOf(handle);
    drag = { handle, pointerId:event.pointerId, startX:event.clientX, startY:event.clientY,
      originalDiameterMm:diameterMm, previewDiameterMm:diameterMm,
      controlsWereEnabled:controls.enabled };
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    color(handle, "active");
    cursor();
  }
  function onPointerUp(event: PointerEvent) {
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const current = drag;
    const changed = current.previewDiameterMm !== current.originalDiameterMm;
    cancelDrag();
    if (changed) void commitForHandle(current.handle, current.previewDiameterMm);
  }
  function onDoubleClick(event: MouseEvent) {
    if (!active) return;
    const handle = pick(event);
    if (handle === null) return;
    event.preventDefault(); event.stopImmediatePropagation();
    openNumeric(handle, event);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    if (drag !== null) { event.preventDefault(); cancelDrag(); }
    else if (numericInput !== null) { event.preventDefault(); closeNumeric(); }
  }
  function onLeave() { if (drag === null && numericInput === null) setHovered(null); }

  canvas.addEventListener("pointermove", onPointerMove, true);
  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointerup", onPointerUp, true);
  canvas.addEventListener("pointercancel", cancelDrag);
  canvas.addEventListener("lostpointercapture", cancelDrag);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("dblclick", onDoubleClick, true);
  window.addEventListener("keydown", onKeyDown);

  return { object, getInteractionState: interactionState,
    setActive(next) { if (active === next) return; if (!next) { cancelDrag(); closeNumeric(); setHovered(null); hideLabel(); }
      active = next; object.visible = active; cursor(); invalidate(); },
    setMoldRoot(root) { if (drag !== null) cancelDrag(); moldRoot = root; collectMoldTargets(); rebuildHandles(); },
    setSprues(next) { if (drag !== null) cancelDrag(); closeNumeric(); sprues = next; rebuildHandles(); },
    dispose() { if (disposed) return; disposed=true; cancelDrag(); closeNumeric(); disposeHandles(); hideLabel(); label.remove();
      canvas.removeEventListener("pointermove", onPointerMove, true); canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointerup", onPointerUp, true); canvas.removeEventListener("pointercancel", cancelDrag);
      canvas.removeEventListener("lostpointercapture", cancelDrag); canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("dblclick", onDoubleClick, true); window.removeEventListener("keydown", onKeyDown);
      object.removeFromParent(); canvas.style.cursor=""; moldTargets.length=0; hiddenBodyVisibility.clear(); },
  };
}
