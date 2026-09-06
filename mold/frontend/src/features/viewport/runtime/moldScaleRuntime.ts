import { clampReferenceMoldClearance, MAX_REFERENCE_MOLD_CLEARANCE_MM, MIN_REFERENCE_MOLD_CLEARANCE_MM } from "@/features/mold-generation/reference-mold-definition";

const DRAG_MM_PER_PIXEL = 0.1;

export interface MoldScaleRuntime {
  setInteraction(active: boolean, clearanceMm: number): void;
  dispose(): void;
}

/**
 * Pointer and precision-input owner for the global Mold Scale command.
 * It intentionally renders no envelope: each pointer move writes the real
 * canonical clearance through the supplied transaction callbacks, while
 * downstream engineering output is only invalidated by the store.
 */
export function createMoldScaleRuntime({
  canvas,
  host,
  controls,
  onBegin,
  onUpdate,
  onCommit,
  onCancel,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly host: HTMLElement;
  readonly controls: { enabled: boolean };
  readonly onBegin: () => void;
  readonly onUpdate: (clearanceMm: number) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}): MoldScaleRuntime {
  let active = false;
  let value = 10;
  let dragging = false;
  let startX = 0;
  let startValue = 10;
  let controlsWereEnabled = true;
  let input: HTMLInputElement | null = null;

  const setCursor = (cursor: "" | "grab" | "grabbing") => { canvas.style.cursor = cursor; };
  const setEditorValue = (nextValue: number) => {
    if (input !== null && document.activeElement !== input) input.value = String(Number(nextValue.toFixed(3)));
  };
  const ensureEditor = () => {
    if (input !== null) return;
    input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.min = String(MIN_REFERENCE_MOLD_CLEARANCE_MM);
    input.max = String(MAX_REFERENCE_MOLD_CLEARANCE_MM);
    input.setAttribute("aria-label", "Mold Scale in millimeters");
    input.className = "mold-scale-editor";
    input.style.cssText = "position:absolute;z-index:8;top:16px;left:50%;transform:translateX(-50%);width:88px;box-sizing:border-box;border:1px solid rgba(155,224,188,.72);border-radius:6px;background:rgba(12,16,20,.94);color:#f5fbf7;padding:5px 7px;font:600 12px/1.2 system-ui,sans-serif;outline:none;";
    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        input!.value = String(Number(value.toFixed(3)));
        input?.blur();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const next = clampReferenceMoldClearance(Number(input?.value));
        if (next !== value) {
          onBegin();
          value = next;
          onUpdate(next);
          onCommit();
        }
        setEditorValue(value);
        input?.blur();
      }
    });
    host.append(input);
    setEditorValue(value);
  };
  const removeEditor = () => { input?.remove(); input = null; };
  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    controls.enabled = controlsWereEnabled;
    setCursor("grab");
    onCommit();
  };
  const cancelDrag = () => {
    if (!dragging) return;
    dragging = false;
    controls.enabled = controlsWereEnabled;
    onCancel();
    setCursor("grab");
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!active || event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startValue = value;
    controlsWereEnabled = controls.enabled;
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    onBegin();
    setCursor("grabbing");
    event.preventDefault();
    event.stopPropagation();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    const next = Number(clampReferenceMoldClearance(startValue + (event.clientX - startX) * DRAG_MM_PER_PIXEL).toFixed(3));
    if (next !== value) {
      value = next;
      onUpdate(next);
      setEditorValue(next);
    }
    event.preventDefault();
    event.stopPropagation();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    finishDrag();
    event.preventDefault();
    event.stopPropagation();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (active && event.key === "Escape" && dragging) {
      event.preventDefault();
      cancelDrag();
    }
  };
  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointermove", onPointerMove, true);
  canvas.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("keydown", onKeyDown, true);

  return {
    setInteraction(nextActive, clearanceMm) {
      active = nextActive;
      value = clampReferenceMoldClearance(clearanceMm);
      if (active) {
        ensureEditor();
        setCursor(dragging ? "grabbing" : "grab");
      } else {
        cancelDrag();
        removeEditor();
        setCursor("");
      }
      setEditorValue(value);
    },
    dispose() {
      cancelDrag();
      removeEditor();
      setCursor("");
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove, true);
      canvas.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("keydown", onKeyDown, true);
    },
  };
}
