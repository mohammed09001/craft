type RenderFrame = () => boolean;

type RenderSchedulerOptions = {
  renderFrame: RenderFrame;
  onRenderError: () => void;
};

export type RenderScheduler = {
  invalidate: () => void;
  dispose: () => void;
};

export function createRenderScheduler({
  renderFrame,
  onRenderError,
}: RenderSchedulerOptions): RenderScheduler {
  let frameId: number | null = null;
  let disposed = false;

  const runFrame = () => {
    frameId = null;

    if (disposed) {
      return;
    }

    try {
      const shouldContinue = renderFrame();

      if (shouldContinue && !disposed) {
        scheduleFrame();
      }
    } catch {
      onRenderError();
    }
  };

  const scheduleFrame = () => {
    if (frameId !== null || disposed) {
      return;
    }

    frameId = window.requestAnimationFrame(runFrame);
  };

  return {
    invalidate: scheduleFrame,
    dispose: () => {
      disposed = true;

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
  };
}
