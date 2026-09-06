import { createRenderScheduler } from "@/features/viewport/runtime/renderScheduler";

function installAnimationFrameMock() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestAnimationFrame = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    });
  const cancelAnimationFrame = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((id) => {
      callbacks.delete(id);
    });

  return {
    callbacks,
    requestAnimationFrame,
    cancelAnimationFrame,
    flushNextFrame: () => {
      const [id, callback] = callbacks.entries().next().value ?? [];

      if (id === undefined || callback === undefined) {
        return;
      }

      callbacks.delete(id);
      callback(0);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

it("coalesces invalidations into a single scheduled frame", () => {
  const animationFrame = installAnimationFrameMock();
  const renderFrame = vi.fn(() => false);
  const scheduler = createRenderScheduler({
    renderFrame,
    onRenderError: vi.fn(),
  });

  scheduler.invalidate();
  scheduler.invalidate();
  scheduler.invalidate();

  expect(animationFrame.requestAnimationFrame).toHaveBeenCalledTimes(1);

  animationFrame.flushNextFrame();

  expect(renderFrame).toHaveBeenCalledTimes(1);
  expect(animationFrame.callbacks.size).toBe(0);
});

it("continues while damping reports changes and stops when idle", () => {
  const animationFrame = installAnimationFrameMock();
  const renderFrame = vi
    .fn()
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);
  const scheduler = createRenderScheduler({
    renderFrame,
    onRenderError: vi.fn(),
  });

  scheduler.invalidate();
  animationFrame.flushNextFrame();
  animationFrame.flushNextFrame();
  animationFrame.flushNextFrame();

  expect(renderFrame).toHaveBeenCalledTimes(3);
  expect(animationFrame.callbacks.size).toBe(0);
});

it("cancels a scheduled frame on dispose", () => {
  const animationFrame = installAnimationFrameMock();
  const scheduler = createRenderScheduler({
    renderFrame: vi.fn(() => false),
    onRenderError: vi.fn(),
  });

  scheduler.invalidate();
  scheduler.dispose();

  expect(animationFrame.cancelAnimationFrame).toHaveBeenCalledTimes(1);
  expect(animationFrame.callbacks.size).toBe(0);
});
