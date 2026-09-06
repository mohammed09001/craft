import { act, renderHook } from "@testing-library/react";

import { useViewportRuntime } from "@/features/viewport/useViewportRuntime";
import type {
  ViewportPalette,
  ViewportRuntime,
} from "@/features/viewport/viewport.contracts";

const { mockCreateRuntime } = vi.hoisted(() => ({
  mockCreateRuntime: vi.fn(),
}));

vi.mock("@/features/viewport/runtime/createThreeViewportRuntime", () => ({
  createThreeViewportRuntime: mockCreateRuntime,
}));

const PALETTE: ViewportPalette = {
  background: "#000000",
  gridMajor: "#333333",
  gridMinor: "#222222",
};

function createRuntime() {
  return {
    clearSelection: vi.fn(),
    clearMeasurement: vi.fn(),
    fitView: vi.fn(),
    loadLocalStl: vi.fn(),
    setModelVisible: vi.fn(),
    setSelectionBoxVisible: vi.fn(),
    setReferenceMoldDefinition: vi.fn(),
    orientModel: vi.fn(),
    resetView: vi.fn(),
    dispose: vi.fn(),
  } satisfies ViewportRuntime;
}

function makeHostAndCanvas() {
  return {
    host: document.createElement("section"),
    canvas: document.createElement("canvas"),
  };
}

function createOptions(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
): Parameters<typeof useViewportRuntime>[0] {
  return {
    hostRef: { current: host },
    canvasRef: { current: canvas },
    palette: PALETTE,
    activeTool: "select",
    partOrientation: { x: 0, y: 0, z: 0, w: 1 },
    orientationToolActive: false,
    referenceMoldDefinition: null,
    moldAppearanceMode: "solid",
    sprueCavityGeometry: null,
    spruePreviewActive: false,
    sprues: [],
    selectionBoxVisible: false,
    eraserInteractionActive: false,
    splitFaceSelectionActive: false,
    selectedSplitFaces: [],
    cuttingPlanes: [],
    cuttingPlaneK1: null,
    cuttingPlaneK2: null,
    segmentationPartOffset: null,
    segmentationPreviewBodies: [],
    segmentationPreviewPlanes: [],
    segmentationCommittedBodies: [],
    onSplitFaceToggle: vi.fn(),
    onCuttingPlaneDragStart: vi.fn(),
    onCuttingPlaneDragCommit: vi.fn(),
    onCuttingPlaneDragCancel: vi.fn(),
    onCuttingPlaneErase: vi.fn(),
    onCanonicalPartGeometryChange: vi.fn(),
    onSpruePlacementRequest: vi.fn(async () => true),
    onSprueDiameterCommit: vi.fn(async () => true),
    onSprueEntryNeckDiameterCommit: vi.fn(async () => true),
    onPartOrientationCommit: vi.fn(() => true),
    onStatusChange: vi.fn(),
    onModelStatusChange: vi.fn(),
    onMeasurementChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onFirstInteraction: vi.fn(),
  };
}

function createStl(name = "part.stl") {
  return new File(["solid part facet normal 0 0 0 endfacet endsolid"], name);
}

beforeEach(() => {
  mockCreateRuntime.mockReset();
});

it("delivers an STL uploaded while the runtime is still starting once the runtime becomes ready", async () => {
  const { host, canvas } = makeHostAndCanvas();
  const runtime = createRuntime();
  mockCreateRuntime.mockReturnValue(runtime);

  const { result } = renderHook(() =>
    useViewportRuntime(createOptions(host, canvas)),
  );

  const stl = createStl();
  act(() => {
    result.current.loadLocalStl(stl);
  });

  expect(mockCreateRuntime).not.toHaveBeenCalled();

  await act(async () => {});

  expect(mockCreateRuntime).toHaveBeenCalledTimes(1);
  expect(runtime.loadLocalStl).toHaveBeenCalledTimes(1);
  expect(runtime.loadLocalStl).toHaveBeenCalledWith(stl);
});

it("forwards only the latest STL when several are uploaded before the runtime is ready", async () => {
  const { host, canvas } = makeHostAndCanvas();
  const runtime = createRuntime();
  mockCreateRuntime.mockReturnValue(runtime);

  const { result } = renderHook(() =>
    useViewportRuntime(createOptions(host, canvas)),
  );

  const first = createStl("first.stl");
  const second = createStl("second.stl");
  act(() => {
    result.current.loadLocalStl(first);
  });
  act(() => {
    result.current.loadLocalStl(second);
  });

  await act(async () => {});

  expect(runtime.loadLocalStl).toHaveBeenCalledTimes(1);
  expect(runtime.loadLocalStl).toHaveBeenCalledWith(second);
});

it("forwards an STL immediately when the runtime is already ready", async () => {
  const { host, canvas } = makeHostAndCanvas();
  const runtime = createRuntime();
  mockCreateRuntime.mockReturnValue(runtime);

  const { result } = renderHook(() =>
    useViewportRuntime(createOptions(host, canvas)),
  );

  await act(async () => {});

  expect(mockCreateRuntime).toHaveBeenCalledTimes(1);

  const stl = createStl();
  act(() => {
    result.current.loadLocalStl(stl);
  });

  expect(runtime.loadLocalStl).toHaveBeenCalledTimes(1);
  expect(runtime.loadLocalStl).toHaveBeenCalledWith(stl);
});

it("never constructs a runtime when the viewport is abandoned before initialization settles", async () => {
  const { host, canvas } = makeHostAndCanvas();
  const abandonedRuntime = createRuntime();
  mockCreateRuntime.mockReturnValue(abandonedRuntime);

  const { result, unmount } = renderHook(() =>
    useViewportRuntime(createOptions(host, canvas)),
  );

  const stl = createStl();
  act(() => {
    result.current.loadLocalStl(stl);
  });

  unmount();

  await act(async () => {});

  expect(mockCreateRuntime).not.toHaveBeenCalled();
  expect(abandonedRuntime.loadLocalStl).not.toHaveBeenCalled();
  expect(abandonedRuntime.dispose).not.toHaveBeenCalled();
});

it("forwards each STL to the runtime after it is ready, leaving supersession to the importer", async () => {
  const { host, canvas } = makeHostAndCanvas();
  const runtime = createRuntime();
  mockCreateRuntime.mockReturnValue(runtime);

  const { result } = renderHook(() =>
    useViewportRuntime(createOptions(host, canvas)),
  );

  await act(async () => {});

  const first = createStl("first.stl");
  const second = createStl("second.stl");
  act(() => {
    result.current.loadLocalStl(first);
  });
  act(() => {
    result.current.loadLocalStl(second);
  });

  expect(runtime.loadLocalStl).toHaveBeenCalledTimes(2);
  expect(runtime.loadLocalStl).toHaveBeenNthCalledWith(1, first);
  expect(runtime.loadLocalStl).toHaveBeenNthCalledWith(2, second);
});

it("creates exactly one runtime per canvas over sequential remounts, disposing each previous owner", async () => {
  const { host, canvas } = makeHostAndCanvas();
  const firstRuntime = createRuntime();
  const secondRuntime = createRuntime();
  let call = 0;
  mockCreateRuntime.mockImplementation(() =>
    call++ === 0 ? firstRuntime : secondRuntime,
  );

  const first = renderHook(() =>
    useViewportRuntime(createOptions(host, canvas)),
  );

  await act(async () => {});

  expect(mockCreateRuntime).toHaveBeenCalledTimes(1);
  expect(firstRuntime.dispose).not.toHaveBeenCalled();

  first.unmount();
  await act(async () => {});

  expect(firstRuntime.dispose).toHaveBeenCalledTimes(1);

  const second = renderHook(() =>
    useViewportRuntime(createOptions(host, canvas)),
  );

  await act(async () => {});

  expect(mockCreateRuntime).toHaveBeenCalledTimes(2);
  expect(secondRuntime.dispose).not.toHaveBeenCalled();

  const stl = createStl();
  act(() => {
    second.result.current.loadLocalStl(stl);
  });

  expect(secondRuntime.loadLocalStl).toHaveBeenCalledTimes(1);
  expect(secondRuntime.loadLocalStl).toHaveBeenCalledWith(stl);

  second.unmount();
  await act(async () => {});

  expect(secondRuntime.dispose).toHaveBeenCalledTimes(1);
});
