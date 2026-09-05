import { createMoldScaleRuntime } from "@/features/viewport/runtime/moldScaleRuntime";

function pointer(type: string, x: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { button: 0, clientX: x, clientY: 40, pointerId: 1 });
  return event;
}

function setup() {
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  host.append(canvas);
  document.body.append(host);
  const rect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  Object.defineProperty(host, "getBoundingClientRect", { value: rect });
  Object.assign(canvas, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true) });
  const controls = { enabled: true };
  const begin = vi.fn(); const update = vi.fn(); const commit = vi.fn(); const cancel = vi.fn();
  const runtime = createMoldScaleRuntime({ canvas, host, controls, onBegin: begin, onUpdate: update, onCommit: commit, onCancel: cancel });
  runtime.setInteraction(true, 10);
  return { canvas, begin, update, commit, cancel, controls, host, runtime };
}

describe("Mold Scale runtime", () => {
  it("updates the canonical value live, blocks camera controls only while dragging, and commits once on release", () => {
    const { canvas, update, commit, controls, host, runtime } = setup();
    expect(canvas.style.cursor).toBe("grab");
    expect(host.querySelector("input")).not.toBeNull();
    canvas.dispatchEvent(pointer("pointerdown", 20));
    expect(controls.enabled).toBe(false);
    expect(canvas.style.cursor).toBe("grabbing");
    canvas.dispatchEvent(pointer("pointermove", 76));
    expect((host.querySelector("input") as HTMLInputElement).value).toBe("15.6");
    canvas.dispatchEvent(pointer("pointerup", 76));
    expect(controls.enabled).toBe(true);
    expect(canvas.style.cursor).toBe("grab");
    expect(update).toHaveBeenCalledWith(15.6);
    expect(commit).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("restores the draft on Escape and accepts one exact numeric commit", () => {
    const { canvas, update, cancel, commit, host, runtime } = setup();
    canvas.dispatchEvent(pointer("pointerdown", 20));
    canvas.dispatchEvent(pointer("pointermove", 60));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    canvas.dispatchEvent(pointer("pointerup", 60));
    expect(cancel).toHaveBeenCalledTimes(1); expect(commit).not.toHaveBeenCalled();
    const input = host.querySelector("input") as HTMLInputElement;
    input.value = "25";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(25);
    runtime.dispose();
  });

  it("closes its editor and restores the next tool's cursor ownership on deactivation", () => {
    const { canvas, host, runtime } = setup();
    runtime.setInteraction(false, 10);
    expect(host.querySelector("input")).toBeNull();
    expect(canvas.style.cursor).toBe("");
    runtime.dispose();
  });
});
