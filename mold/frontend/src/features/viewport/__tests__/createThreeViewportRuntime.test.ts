import type { ViewportRuntimeOptions } from "@/features/viewport";

function createOptions(
  onStatusChange = vi.fn(),
  onModelStatusChange = vi.fn(),
): ViewportRuntimeOptions {
  const host = document.createElement("section");
  const canvas = document.createElement("canvas");

  Object.defineProperty(host, "clientWidth", {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(host, "clientHeight", {
    configurable: true,
    value: 240,
  });

  return {
    host,
    canvas,
    palette: {
      background: "#000000",
      gridMajor: "#333333",
      gridMinor: "#222222",
    },
    onStatusChange,
    onModelStatusChange,
    onMeasurementChange: vi.fn(),
    onSelectionChange: vi.fn(),
  };
}

function mockWebGL2Context(canvas: HTMLCanvasElement) {
  vi.spyOn(canvas, "getContext").mockReturnValue(
    {} as WebGL2RenderingContext,
  );
}

function installAnimationFrameMock() {
  const callbacks: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

  return {
    flush: () => {
      const callback = callbacks.shift();
      callback?.(0);
    },
  };
}

afterEach(() => {
  vi.doUnmock("@/features/viewport/runtime/createRenderer");
  vi.doUnmock("@/features/viewport/runtime/createCamera");
  vi.doUnmock("@/features/viewport/runtime/createCameraControls");
  vi.doUnmock("@/features/viewport/runtime/createEngineeringGrid");
  vi.doUnmock("@/features/viewport/runtime/viewportLightingRig");
  vi.doUnmock("@/features/viewport/runtime/viewportEnvironment");
  vi.doUnmock("@/features/viewport/runtime/viewportBackground");
  vi.doUnmock("@/features/viewport/runtime/createLighting");
  vi.doUnmock("@/features/viewport/runtime/localStlImport");
  vi.doUnmock("@/features/viewport/runtime/viewPose");
  vi.doUnmock("@/features/viewport/runtime/createScene");
  vi.doUnmock("@/features/viewport/runtime/resizeViewport");
  vi.doUnmock("@/features/viewport/runtime/disposeScene");
  vi.restoreAllMocks();
  vi.resetModules();
});

it("reports unsupported without creating a renderer when WebGL 2 is unavailable", async () => {
  const onStatusChange = vi.fn();
  const options = createOptions(onStatusChange);
  vi.spyOn(options.canvas, "getContext").mockReturnValue(null);

  const { createThreeViewportRuntime } = await import(
    "@/features/viewport/runtime/createThreeViewportRuntime"
  );

  const runtime = createThreeViewportRuntime(options);

  expect(onStatusChange).toHaveBeenCalledWith({
    phase: "unsupported",
    message: "WebGL 2 is not available in this browser.",
  });
  expect(runtime.dispose()).toBeUndefined();
});

it("emits an explicit model error when an STL is loaded while the runtime is unsupported", async () => {
  const onStatusChange = vi.fn();
  const onModelStatusChange = vi.fn();
  const options = createOptions(onStatusChange, onModelStatusChange);
  vi.spyOn(options.canvas, "getContext").mockReturnValue(null);

  const { createThreeViewportRuntime } = await import(
    "@/features/viewport/runtime/createThreeViewportRuntime"
  );

  const runtime = createThreeViewportRuntime(options);
  runtime.loadLocalStl(new File(["stl"], "part.stl"));

  expect(onModelStatusChange).toHaveBeenCalledTimes(1);
  expect(onModelStatusChange).toHaveBeenCalledWith(
    expect.objectContaining({ phase: "error" }),
  );
  expect(runtime.dispose()).toBeUndefined();
});

it("reports error when renderer creation fails", async () => {
  const onStatusChange = vi.fn();
  const options = createOptions(onStatusChange);
  mockWebGL2Context(options.canvas);
  vi.doMock("@/features/viewport/runtime/createRenderer", () => ({
    createRenderer: () => {
      throw new Error("renderer failed");
    },
  }));

  const { createThreeViewportRuntime } = await import(
    "@/features/viewport/runtime/createThreeViewportRuntime"
  );

  createThreeViewportRuntime(options);

  expect(onStatusChange).toHaveBeenCalledWith({
    phase: "error",
    message: "The 3D viewport could not be started.",
  });
});

it("does not report ready when the first render fails", async () => {
  const animationFrame = installAnimationFrameMock();
  const onStatusChange = vi.fn();
  const options = createOptions(onStatusChange);
  const disposeControls = vi.fn();
  const disposeRenderer = vi.fn();

  mockWebGL2Context(options.canvas);
  vi.doMock("@/features/viewport/runtime/createRenderer", () => ({
    createRenderer: () => ({
      setClearColor: vi.fn(),
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: () => {
        throw new Error("render failed");
      },
      dispose: disposeRenderer,
    }),
  }));
  vi.doMock("@/features/viewport/runtime/createCamera", () => ({
    createCamera: () => ({
      aspect: 1,
      updateProjectionMatrix: vi.fn(),
    }),
  }));
  vi.doMock("@/features/viewport/runtime/createCameraControls", () => ({
    createCameraControls: () => ({
      update: () => false,
      dispose: disposeControls,
    }),
  }));
  vi.doMock("@/features/viewport/runtime/createEngineeringGrid", () => ({
    createEngineeringGrid: () => ({}),
    disposeEngineeringGrid: vi.fn(),
    updateEngineeringGridPalette: vi.fn(),
  }));
  vi.doMock("@/features/viewport/runtime/createLighting", () => ({
    createLighting: () => ({}),
  }));
  vi.doMock("@/features/viewport/runtime/viewportLightingRig", () => ({
    createViewportLightingRig: () => ({
      object: {},
      updateBounds: vi.fn(),
      updateTheme: vi.fn(),
    }),
  }));
  vi.doMock("@/features/viewport/runtime/viewportEnvironment", () => ({
    createViewportEnvironment: () => ({
      dispose: vi.fn(),
    }),
  }));
  vi.doMock("@/features/viewport/runtime/viewportBackground", () => ({
    createViewportBackground: () => ({
      updatePalette: vi.fn(),
      dispose: vi.fn(),
    }),
  }));
  vi.doMock("@/features/viewport/runtime/createScene", () => ({
    createScene: () => ({
      add: vi.fn(),
      traverse: vi.fn(),
    }),
  }));
  vi.doMock("@/features/viewport/runtime/resizeViewport", () => ({
    resizeViewport: vi.fn(),
    observeViewportResize: () => vi.fn(),
  }));
  vi.doMock("@/features/viewport/runtime/disposeScene", () => ({
    disposeScene: vi.fn(),
  }));

  const { createThreeViewportRuntime } = await import(
    "@/features/viewport/runtime/createThreeViewportRuntime"
  );

  const runtime = createThreeViewportRuntime(options);
  animationFrame.flush();

  expect(onStatusChange).toHaveBeenCalledWith({
    phase: "error",
    message: "The 3D viewport could not be started.",
  });
  expect(onStatusChange).not.toHaveBeenCalledWith({ phase: "ready" });

  runtime.dispose();

  expect(disposeControls).toHaveBeenCalled();
  expect(disposeRenderer).toHaveBeenCalled();
});

it("exposes setPartOrientation on the production runtime object and forwards calls to localStlRuntime", async () => {
  vi.resetModules();
  const options = createOptions();
  mockWebGL2Context(options.canvas);
  vi.doMock("@/features/viewport/runtime/createRenderer", () => ({
    createRenderer: () => ({
      setClearColor: vi.fn(),
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    }),
  }));
  vi.doMock("@/features/viewport/runtime/createCamera", () => ({
    createCamera: () => ({
      aspect: 1,
      updateProjectionMatrix: vi.fn(),
    }),
  }));
  vi.doMock("@/features/viewport/runtime/createCameraControls", () => ({
    createCameraControls: () => ({
      update: () => false,
      dispose: vi.fn(),
    }),
  }));
  vi.doMock("@/features/viewport/runtime/createEngineeringGrid", () => ({
    createEngineeringGrid: () => ({}),
    disposeEngineeringGrid: vi.fn(),
    updateEngineeringGridPalette: vi.fn(),
  }));
  vi.doMock("@/features/viewport/runtime/createLighting", () => ({
    createLighting: () => ({}),
  }));
  vi.doMock("@/features/viewport/runtime/createScene", () => ({
    createScene: () => ({
      add: vi.fn(),
      remove: vi.fn(),
      traverse: vi.fn(),
    }),
  }));
  vi.doMock("@/features/viewport/runtime/resizeViewport", () => ({
    resizeViewport: vi.fn(),
    observeViewportResize: () => vi.fn(),
  }));

  const setPartOrientationSpy = vi.fn();
  vi.doMock("@/features/viewport/runtime/localStlImport", () => ({
    createLocalStlRuntime: () => ({
      fitView: vi.fn(),
      loadLocalStl: vi.fn(),
      setModelVisible: vi.fn(),
      orientModel: vi.fn(),
      resetView: vi.fn(),
      setPartOrientation: setPartOrientationSpy,
      dispose: vi.fn(),
    }),
  }));

  const { createThreeViewportRuntime } = await import(
    "@/features/viewport/runtime/createThreeViewportRuntime"
  );

  const runtime = createThreeViewportRuntime(options);

  expect(runtime.setPartOrientation).toBeDefined();
  expect(typeof runtime.setPartOrientation).toBe("function");

  const testOrientation = { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  runtime.setPartOrientation!(testOrientation);

  expect(setPartOrientationSpy).toHaveBeenCalledWith(testOrientation);

  expect(runtime.setMasterMoldBodies).toBeDefined();
  expect(typeof runtime.setMasterMoldBodies).toBe("function");
  expect(() =>
    runtime.setMasterMoldBodies!([
      {
        id: "master-a",
        name: "Master Mold A",
        visible: true,
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
        triangleCount: 2,
        volumeMm3: 1000,
        watertight: true,
        mesh: {
          positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0, 0, 10, 10, 10, 0, 10],
          indices: [0, 1, 2, 3, 4, 5],
        },
      },
    ]),
  ).not.toThrow();

  runtime.dispose();
});


