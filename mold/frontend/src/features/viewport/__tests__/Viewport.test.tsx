import {
  createEvent,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, useEffect } from "react";

import { App } from "@/app/App";
import { AppProviders } from "@/app/providers/AppProviders";
import { Viewport } from "@/features/viewport";
import type {
  ViewportCommandId,
  ViewportRuntime,
  ViewportRuntimeOptions,
  ViewportStatus,
} from "@/features/viewport";
import { useViewportCommandRunner } from "@/features/viewport";
import { useUiShellStore } from "@/state/ui-shell";
import { renderWithAppProviders } from "@/test/renderApp";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";
import { selectActiveMoldBodies, useSplitFaceStore } from "@/features/mold-generation/split-face";
import { useSegmentationStore } from "@/features/mold-generation/segmentation";
import { useCuttingWorkflowStore } from "@/features/mold-generation/cutting-workflow";
import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useModelImportStore } from "@/features/viewport/modelImport.store";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";

const runtimeMock = vi.hoisted(() => ({
  createThreeViewportRuntime: vi.fn(),
}));

vi.mock("@/features/viewport/runtime/createThreeViewportRuntime", () => ({
  createThreeViewportRuntime: runtimeMock.createThreeViewportRuntime,
}));

function createRuntime(overrides: Partial<ViewportRuntime> = {}): ViewportRuntime {
  return {
    clearMeasurement: vi.fn(),
    clearSelection: vi.fn(),
    fitView: vi.fn(),
    loadLocalStl: vi.fn(),
    setModelVisible: vi.fn(),
    setSelectionBoxVisible: vi.fn(),
    orientModel: vi.fn(),
    resetView: vi.fn(),
    setReferenceMoldDefinition: vi.fn(),
    setEraserInteractionActive: vi.fn(),
    setActiveTool: vi.fn(),
    setPalette: vi.fn(),
    invalidate: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

function renderViewport() {
  const onStatusChange = vi.fn();

  return {
    onStatusChange,
    ...renderWithAppProviders(<Viewport onStatusChange={onStatusChange} />, {
      withToolbarSlot: true,
    }),
  };
}

// Fit View, Reset View, Measure Distance, Return to Select, and Clear
// Measurement have no UI trigger anymore (their header buttons were
// removed) -- the underlying viewport commands stay registered, reachable
// only programmatically. Dispatches one directly, the way a future trigger
// would, to keep exercising Viewport's real command handlers.
// Fit View, Reset View, Measure Distance, Return to Select, and Clear
// Measurement have no UI trigger anymore (their header buttons were
// removed) -- the underlying viewport commands stay registered, reachable
// only programmatically. This captures the real runner Viewport registers
// into, the way a future trigger would reach it, instead of clicking a
// button that no longer exists.
function CaptureViewportCommandRunner({
  onReady,
}: {
  onReady: (run: (commandId: ViewportCommandId) => void) => void;
}) {
  const runViewportCommand = useViewportCommandRunner();

  useEffect(() => {
    onReady(runViewportCommand);
  }, [onReady, runViewportCommand]);

  return null;
}

beforeEach(() => {
  useViewportToolStore.getState().resetActiveTool();
  useSegmentationStore.getState().reset();
  useSplitFaceStore.getState().clearForModelReplacement();
  useModelBoundsStore.setState({ groundedWorldBounds: null });
  usePrinterBuildVolumeStore
    .getState()
    .setPrinterBuildVolume({ x: 1000, y: 1000, z: 1000 });
  useModelImportStore.getState().resetModelImportStatus();
  runtimeMock.createThreeViewportRuntime.mockReset();
  runtimeMock.createThreeViewportRuntime.mockImplementation(
    ({ onStatusChange }: ViewportRuntimeOptions) => {
      onStatusChange({ phase: "ready" });

      return createRuntime();
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("mounts one accessible viewport region and enters the initializing state", () => {
  runtimeMock.createThreeViewportRuntime.mockImplementation(() =>
    createRuntime(),
  );

  renderViewport();

  const region = screen.getByRole("region", {
    name: "Interactive 3D viewport",
  });

  expect(region).toHaveAttribute("aria-busy", "true");
  expect(
    screen.getByText("Starting interactive 3D viewport."),
  ).toBeInTheDocument();
  expect(document.querySelectorAll("canvas")).toHaveLength(1);
});

const moldBounds = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10, y: 10, z: 10 },
};

async function prepareMoldParts(...faces: Array<"front" | "right">) {
  const store = useSplitFaceStore.getState();

  store.enterSelection();
  faces.forEach((face) => useSplitFaceStore.getState().toggleFace(face));

  expect(
    await useSplitFaceStore
      .getState()
      .createMoldParts("model-1", moldBounds),
  ).toBe(true);
}

it("activates the Three.js Sprue preview without an HTML cursor overlay", async () => {
  const setSpruePreviewActive = vi.fn();
  runtimeMock.createThreeViewportRuntime.mockImplementation(
    ({ onStatusChange }: ViewportRuntimeOptions) => {
      onStatusChange({ phase: "ready" });
      return createRuntime({ setSpruePreviewActive });
    },
  );
  renderViewport();

  await waitFor(() => expect(setSpruePreviewActive).toHaveBeenCalledWith(false));
  act(() => {
    useViewportToolStore.getState().setContext({ workflow: "partsReady", evaluationPhase: "complete", hasReferenceGeometry: true, hasCuttingPlanes: true });
    useViewportToolStore.getState().setActiveTool("sprue");
  });

  expect(setSpruePreviewActive).toHaveBeenLastCalledWith(true);
  expect(screen.queryByTestId("sprue-cursor-overlay")).not.toBeInTheDocument();
});

it("clears the Three.js Sprue preview immediately on tool change", async () => {
  const setSpruePreviewActive = vi.fn();
  runtimeMock.createThreeViewportRuntime.mockImplementation(
    ({ onStatusChange }: ViewportRuntimeOptions) => {
      onStatusChange({ phase: "ready" });
      return createRuntime({ setSpruePreviewActive });
    },
  );
  renderViewport();
  await waitFor(() => expect(setSpruePreviewActive).toHaveBeenCalledWith(false));

  act(() => useViewportToolStore.getState().setActiveTool("sprue"));
  act(() => useViewportToolStore.getState().setActiveTool("pointer"));

  expect(setSpruePreviewActive).toHaveBeenLastCalledWith(false);
});

it("keeps the mold visible and exposes partsReady cutting planes to the eraser", async () => {
  await prepareMoldParts("front", "right");

  const setCuttingPlanes = vi.fn();
  const setReferenceMoldDefinition = vi.fn();
  let onCuttingPlaneErase:
    | ViewportRuntimeOptions["onCuttingPlaneErase"]
    | undefined;
  const removeAndRebuild = vi.spyOn(
    useSplitFaceStore.getState(),
    "removeSplitFaceAndRebuild",
  );
  const undoCount = useSplitFaceStore.getState().undoStack.length;

  runtimeMock.createThreeViewportRuntime.mockImplementation(
    (options: ViewportRuntimeOptions) => {
      onCuttingPlaneErase = options.onCuttingPlaneErase;
      options.onStatusChange({ phase: "ready" });
      options.onSelectionChange({
        isModelSelected: true,
        selectedModelId: "model-1",
        selectionBoxBounds: moldBounds,
      });

      return createRuntime({
        setCuttingPlanes,
        setReferenceMoldDefinition,
      });
    },
  );

  renderViewport();

  await waitFor(() => {
    expect(setCuttingPlanes).toHaveBeenLastCalledWith(
      moldBounds,
      expect.any(Object),
      [],
    );
  });

  act(() => useViewportToolStore.getState().setActiveTool("eraser"));

  const beforeErase = useSplitFaceStore.getState();

  expect(setCuttingPlanes).toHaveBeenLastCalledWith(
    moldBounds,
    expect.any(Object),
    beforeErase.cuttingPlanes,
  );
  expect(setReferenceMoldDefinition).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ...beforeErase.definition,
      moldBodies:selectActiveMoldBodies(beforeErase),
    }),
  );

  act(() => onCuttingPlaneErase?.("right"));

  await waitFor(() => {
    expect(useSplitFaceStore.getState().cuttingPlanes).toHaveLength(1);
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  });

  expect(removeAndRebuild).toHaveBeenCalledOnce();
  expect(removeAndRebuild).toHaveBeenCalledWith(
    "right",
    "model-1",
    moldBounds,
  );
  expect(useSplitFaceStore.getState().definition?.moldBodies).toHaveLength(2);
  expect(useSplitFaceStore.getState().undoStack).toHaveLength(undoCount + 1);
});

it("keeps cutting-plane editing state untouched by a completed cavity — rebuild no longer resets to edit mode", async () => {
  await prepareMoldParts("front");
  useSplitFaceStore.setState((state) => ({
    cavity: {
      ...state.cavity,
      status: "complete",
    },
  }));

  const setCuttingPlanes = vi.fn();
  runtimeMock.createThreeViewportRuntime.mockImplementation(
    (options: ViewportRuntimeOptions) => {
      options.onStatusChange({ phase: "ready" });
      options.onSelectionChange({
        isModelSelected: true,
        selectedModelId: "model-1",
        selectionBoxBounds: moldBounds,
      });

      return createRuntime({ setCuttingPlanes });
    },
  );

  renderViewport();
  await waitFor(() => expect(setCuttingPlanes).toHaveBeenCalled());

  // Rebuild Cavity is now the same atomic store action as Create Cavity — there is no longer a
  // separate step that resets workflow into cutting-plane edit mode.
  expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
});

it.each([
  {
    phase: "ready",
    visibleText: "No model loaded.",
  },
  {
    phase: "unsupported",
    visibleText: "WebGL 2 is not available in this browser.",
  },
  {
    phase: "error",
    visibleText: "The 3D viewport could not be started.",
  },
  {
    phase: "context-lost",
    visibleText: "The graphics context was lost and is being restored.",
  },
] satisfies Array<{ phase: ViewportStatus["phase"]; visibleText: string }>)(
  "renders the $phase state",
  async ({ phase, visibleText }) => {
    runtimeMock.createThreeViewportRuntime.mockImplementation(
      ({ onStatusChange }: ViewportRuntimeOptions) => {
        onStatusChange({ phase });

        return createRuntime();
      },
    );

    renderViewport();

    expect(await screen.findByText(visibleText)).toBeInTheDocument();
  },
);

it("integrates viewport and model status with the existing status area", async () => {
  renderWithAppProviders(<App />, { route: "/workspace" });

  expect(await screen.findByLabelText("Viewport Ready")).toBeInTheDocument();
  expect(screen.getByLabelText("Model No Model Loaded")).toBeInTheDocument();
  expect(screen.getByLabelText("Selection None")).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", {
      name: "Workspace ready. No model is open.",
    }),
  ).not.toBeInTheDocument();
});

it("shows selected model status from inspection state", async () => {
  runtimeMock.createThreeViewportRuntime.mockImplementation(
    ({
      onModelStatusChange,
      onSelectionChange,
      onStatusChange,
    }: ViewportRuntimeOptions) => {
      onStatusChange({ phase: "ready" });
      onModelStatusChange({
        phase: "ready",
        fileName: "selected.stl",
        fileSize: 2048,
        fileSizeLabel: "2.0 KB",
        format: "STL",
        geometryVertexCount: 6,
        geometryVertexCountLabel: "6",
        triangleCount: 2,
        triangleCountLabel: "2",
      });
      onSelectionChange({
        isModelSelected: true,
        selectedModelId: "model-1",
        announcement: "Model selected.",
      });

      return createRuntime();
    },
  );

  renderWithAppProviders(<App />, { route: "/workspace" });

  expect(
    await screen.findByLabelText("Selection Model Selected"),
  ).toBeInTheDocument();
});

it("toggles Measure Distance and shows the measurement HUD", async () => {
  let onMeasurementChange:
    | ViewportRuntimeOptions["onMeasurementChange"]
    | undefined;
  const setActiveTool = vi.fn();

  runtimeMock.createThreeViewportRuntime.mockImplementation(
    (options: ViewportRuntimeOptions) => {
      onMeasurementChange = options.onMeasurementChange;
      options.onStatusChange({ phase: "ready" });
      options.onModelStatusChange({
        phase: "ready",
        fileName: "sample.stl",
        fileSize: 2048,
        fileSizeLabel: "2.0 KB",
        format: "STL",
        geometryVertexCount: 6,
        geometryVertexCountLabel: "6",
        triangleCount: 2,
        triangleCountLabel: "2",
      });

      return createRuntime({ setActiveTool });
    },
  );

  let runViewportCommand: ((commandId: ViewportCommandId) => void) | undefined;

  renderWithAppProviders(
    <>
      <App />
      <CaptureViewportCommandRunner
        onReady={(run) => {
          runViewportCommand = run;
        }}
      />
    </>,
    { route: "/workspace" },
  );

  // The runtime factory resolves asynchronously (dynamic import) -- wait
  // for it to actually exist before dispatching a command that calls
  // straight into runtimeRef.current, or the call is silently dropped.
  expect(
    await screen.findByRole("button", { name: "Replace Object" }),
  ).toBeInTheDocument();

  act(() => {
    runViewportCommand?.("measure-distance");
  });

  await waitFor(() => {
    expect(setActiveTool).toHaveBeenLastCalledWith("measure-distance");
  });
  expect(screen.getByRole("button", { name: "Flip" })).toBeInTheDocument();
  expect(
    screen.getAllByText("Select the first point on the model surface.").length,
  ).toBeGreaterThanOrEqual(1);
  expect(screen.getByLabelText("Measurement Active")).toBeInTheDocument();

  act(() => {
    onMeasurementChange?.({
      activeTool: "measure-distance",
      phase: "complete",
      firstPoint: { x: 0, y: 0, z: 0 },
      secondPoint: { x: 3, y: 4, z: 0 },
      distance: 5,
      distanceLabel: "5 Model Units",
    });
  });

  expect(screen.getAllByText("5 Model Units").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByLabelText("Measurement 5 Model Units")).toBeInTheDocument();
});

it("clears measurement through the clear-measurement viewport command", async () => {
  const clearMeasurement = vi.fn();

  runtimeMock.createThreeViewportRuntime.mockImplementation(
    (options: ViewportRuntimeOptions) => {
      options.onStatusChange({ phase: "ready" });
      options.onModelStatusChange({
        phase: "ready",
        fileName: "sample.stl",
        fileSize: 2048,
        fileSizeLabel: "2.0 KB",
        format: "STL",
        geometryVertexCount: 6,
        geometryVertexCountLabel: "6",
        triangleCount: 2,
        triangleCountLabel: "2",
      });
      options.onMeasurementChange({
        activeTool: "select",
        phase: "complete",
        firstPoint: { x: 0, y: 0, z: 0 },
        secondPoint: { x: 3, y: 4, z: 0 },
        distance: 5,
        distanceLabel: "5 Model Units",
      });

      return createRuntime({ clearMeasurement });
    },
  );

  let runViewportCommand: ((commandId: ViewportCommandId) => void) | undefined;

  renderWithAppProviders(
    <>
      <App />
      <CaptureViewportCommandRunner
        onReady={(run) => {
          runViewportCommand = run;
        }}
      />
    </>,
    { route: "/workspace" },
  );

  // The runtime factory resolves asynchronously (dynamic import) -- wait
  // for it to actually exist before dispatching a command that calls
  // straight into runtimeRef.current, or the call is silently dropped.
  expect((await screen.findAllByText("5 Model Units")).length).toBeGreaterThan(0);

  act(() => {
    runViewportCommand?.("clear-measurement");
  });

  await waitFor(() => {
    expect(clearMeasurement).toHaveBeenCalled();
    expect(screen.queryByText("5 Model Units")).not.toBeInTheDocument();
  });
});

it("clears selected context when the runtime reports replacement reset", async () => {
  let onSelectionChange:
    | ViewportRuntimeOptions["onSelectionChange"]
    | undefined;

  runtimeMock.createThreeViewportRuntime.mockImplementation(
    (options: ViewportRuntimeOptions) => {
      onSelectionChange = options.onSelectionChange;
      options.onStatusChange({ phase: "ready" });
      options.onModelStatusChange({
        phase: "ready",
        fileName: "selected.stl",
        fileSize: 2048,
        fileSizeLabel: "2.0 KB",
        format: "STL",
        geometryVertexCount: 6,
        geometryVertexCountLabel: "6",
        triangleCount: 2,
        triangleCountLabel: "2",
      });
      options.onSelectionChange({
        isModelSelected: true,
        selectedModelId: "model-1",
      });

      return createRuntime();
    },
  );

  renderWithAppProviders(<App />, { route: "/workspace" });

  expect(
    await screen.findByLabelText("Selection Model Selected"),
  ).toBeInTheDocument();

  act(() => {
    onSelectionChange?.({ isModelSelected: false });
  });

  expect(screen.getByLabelText("Selection None")).toBeInTheDocument();
});

it("does not add another canvas or recreate the runtime on rerender", async () => {
  const { rerender } = renderWithAppProviders(
    <Viewport onStatusChange={vi.fn()} />,
  );

  await waitFor(() => {
    expect(runtimeMock.createThreeViewportRuntime).toHaveBeenCalledTimes(1);
  });

  rerender(
    <AppProviders>
      <Viewport onStatusChange={vi.fn()} />
    </AppProviders>,
  );

  expect(document.querySelectorAll("canvas")).toHaveLength(1);
  expect(runtimeMock.createThreeViewportRuntime).toHaveBeenCalledTimes(1);
});

it("updates the runtime palette on theme change without recreating the runtime", async () => {
  const setPalette = vi.fn();
  runtimeMock.createThreeViewportRuntime.mockReturnValue(
    createRuntime({ setPalette }),
  );

  renderViewport();

  await waitFor(() => {
    expect(runtimeMock.createThreeViewportRuntime).toHaveBeenCalledTimes(1);
  });

  act(() => {
    useUiShellStore.getState().setThemeMode("light");
  });

  await waitFor(() => {
    expect(setPalette).toHaveBeenCalled();
  });
  expect(runtimeMock.createThreeViewportRuntime).toHaveBeenCalledTimes(1);
});

it("passes the current theme palette to the runtime and updates it on toggle", async () => {
  const setPalette = vi.fn();
  const getComputedStyle = vi.spyOn(window, "getComputedStyle");

  getComputedStyle.mockImplementation(() => {
    const isLight = document.documentElement.dataset.theme === "light";

    return {
      backgroundColor: isLight ? "#f7f9fb" : "#0b1118",
      borderTopColor: isLight ? "#b7c3cf" : "#46525f",
      getPropertyValue: () => "",
      outlineColor: isLight ? "#d8e0e8" : "#303943",
    } as unknown as CSSStyleDeclaration;
  });
  runtimeMock.createThreeViewportRuntime.mockReturnValue(
    createRuntime({ setPalette }),
  );

  renderViewport();

  await waitFor(() => {
    expect(runtimeMock.createThreeViewportRuntime).toHaveBeenCalledTimes(1);
  });

  expect(runtimeMock.createThreeViewportRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      palette: {
        background: "#0b1118",
        gridMajor: "#303943",
        gridMinor: "#46525f",
      },
    }),
  );

  act(() => {
    useUiShellStore.getState().setThemeMode("light");
  });

  await waitFor(() => {
    expect(setPalette).toHaveBeenCalledWith({
      background: "#f7f9fb",
      gridMajor: "#d8e0e8",
      gridMinor: "#b7c3cf",
    });
  });
  expect(runtimeMock.createThreeViewportRuntime).toHaveBeenCalledTimes(1);
});

it("offers an accessible STL picker and starts the local STL lifecycle", async () => {
  const loadLocalStl = vi.fn();
  runtimeMock.createThreeViewportRuntime.mockReturnValue(
    createRuntime({ loadLocalStl }),
  );

  renderViewport();

  await waitFor(() => {
    expect(runtimeMock.createThreeViewportRuntime).toHaveBeenCalledTimes(1);
  });

  const fileInput = screen.getByLabelText("Local STL file");
  const stlFile = new File(["solid test\nendsolid test"], "sample.stl", {
    type: "model/stl",
  });

  expect(fileInput).toHaveAttribute("accept", ".stl");

  fireEvent.change(fileInput, {
    target: {
      files: [stlFile],
    },
  });

  expect(await screen.findAllByText("Checking STL file.")).toHaveLength(2);
  expect(loadLocalStl).toHaveBeenCalledWith(stlFile);
});

it("rejects invalid local file selections with a clear message", async () => {
  renderViewport();

  fireEvent.change(screen.getByLabelText("Local STL file"), {
    target: {
      files: [new File(["not stl"], "sample.obj", { type: "text/plain" })],
    },
  });

  expect(
    await screen.findByText("Only .stl files are supported."),
  ).toBeInTheDocument();
});

it("shows replacement errors without covering an already loaded model", async () => {
  runtimeMock.createThreeViewportRuntime.mockImplementation(
    ({ onModelStatusChange, onStatusChange }: ViewportRuntimeOptions) => {
      onStatusChange({ phase: "ready" });
      onModelStatusChange({
        phase: "ready",
        fileName: "sample.stl",
        fileSize: 24,
        fileSizeLabel: "24 B",
        format: "STL",
        geometryVertexCount: 3,
        geometryVertexCountLabel: "3",
        triangleCount: 1,
        triangleCountLabel: "1",
      });

      return createRuntime();
    },
  );
  renderWithAppProviders(<App />, { route: "/workspace" });

  expect(
    await screen.findByRole("button", { name: "Replace Object" }),
  ).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Local STL file"), {
    target: {
      files: [new File(["not stl"], "sample.obj", { type: "text/plain" })],
    },
  });

  expect(
    await screen.findAllByText("Only .stl files are supported."),
  ).not.toHaveLength(0);
  expect(screen.queryByLabelText("Model inspection summary")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Replace Object" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Drop zone for one local STL file"),
  ).not.toBeInTheDocument();
});

it("runs fit and reset through their viewport commands, and flip from the main toolbar, once a model is ready", async () => {
  const fitView = vi.fn();
  const resetView = vi.fn();
  const orientModel = vi.fn();
  runtimeMock.createThreeViewportRuntime.mockImplementation(
    ({ onModelStatusChange, onStatusChange }: ViewportRuntimeOptions) => {
      onStatusChange({ phase: "ready" });
      onModelStatusChange({
        phase: "ready",
        fileName: "sample.stl",
        fileSize: 2048,
        fileSizeLabel: "2.0 KB",
        format: "STL",
        geometryVertexCount: 6,
        geometryVertexCountLabel: "6",
        triangleCount: 2,
        triangleCountLabel: "2",
      });

      return createRuntime({ fitView, orientModel, resetView });
    },
  );

  let runViewportCommand: ((commandId: ViewportCommandId) => void) | undefined;

  renderWithAppProviders(
    <>
      <App />
      <CaptureViewportCommandRunner
        onReady={(run) => {
          runViewportCommand = run;
        }}
      />
    </>,
    { route: "/workspace" },
  );

  expect(
    await screen.findByRole("button", { name: "Replace Object" }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Model inspection summary")).not.toBeInTheDocument();

  act(() => {
    runViewportCommand?.("fit-view");
    runViewportCommand?.("reset-view");
  });

  fireEvent.click(screen.getByRole("button", { name: "Flip" }));

  await waitFor(() => {
    expect(fitView).toHaveBeenCalled();
    expect(resetView).toHaveBeenCalled();
  });
  expect(useViewportToolStore.getState().activeTool).toBe("orientation");
});

it("does not render model commands before a model is ready", async () => {
  renderWithAppProviders(<App />, { route: "/workspace" });

  expect(
    await screen.findByRole("button", { name: "Import Object" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Fit View" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Reset View" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Replace Object" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Measure Distance" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Orient Model" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("No model loaded.")).toBeInTheDocument();
});

it("does not render a viewport toolbar or viewport command buttons", async () => {
  renderWithAppProviders(<App />, { route: "/workspace" });

  const viewport = screen.getByRole("region", {
    name: "Interactive 3D viewport",
  });

  expect(screen.queryByLabelText("Model inspection controls")).not.toBeInTheDocument();
  // Printer dimensions are already complete (see beforeEach) and no
  // cutting-workflow strategy is active, so the contextual printer prompt
  // stays hidden and no toolbar renders -- an empty model needs no buttons.
  expect(within(viewport).queryAllByRole("button")).toHaveLength(0);
  expect(
    await screen.findByRole("button", { name: "Import Object" }),
  ).toBeInTheDocument();
});

it("hides the reference mold toolbar while the viewport is in 3D mode", async () => {
  renderViewport();

  await waitFor(() => {
    expect(runtimeMock.createThreeViewportRuntime).toHaveBeenCalledTimes(1);
  });

  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
});


it("prevents default browser handling for dropped STL files", async () => {
  const loadLocalStl = vi.fn();
  runtimeMock.createThreeViewportRuntime.mockReturnValue(
    createRuntime({ loadLocalStl }),
  );
  renderViewport();

  await waitFor(() => {
    expect(runtimeMock.createThreeViewportRuntime).toHaveBeenCalledTimes(1);
  });

  const region = screen.getByRole("region", {
    name: "Interactive 3D viewport",
  });
  const stlFile = new File(["solid test\nendsolid test"], "sample.stl");
  const dropEvent = createEvent.drop(region);

  Object.defineProperty(dropEvent, "dataTransfer", {
    value: {
      files: [stlFile],
    },
  });

  fireEvent(region, dropEvent);

  expect(dropEvent.defaultPrevented).toBe(true);
  expect(loadLocalStl).toHaveBeenCalledWith(stlFile);
});

it("does not construct a runtime when unmounted before initialization settles", async () => {
  const dispose = vi.fn();
  runtimeMock.createThreeViewportRuntime.mockReturnValue(
    createRuntime({ dispose }),
  );

  const { unmount } = renderViewport();

  unmount();

  await act(async () => {});

  expect(runtimeMock.createThreeViewportRuntime).not.toHaveBeenCalled();
  expect(dispose).not.toHaveBeenCalled();
});

it("hides the interaction hint after the first viewport interaction", async () => {
  runtimeMock.createThreeViewportRuntime.mockImplementation(
    ({ onModelStatusChange, onStatusChange }: ViewportRuntimeOptions) => {
      onStatusChange({ phase: "ready" });
      onModelStatusChange({
        phase: "ready",
        fileName: "sample.stl",
        fileSize: 24,
        fileSizeLabel: "24 B",
        format: "STL",
        geometryVertexCount: 3,
        geometryVertexCountLabel: "3",
        triangleCount: 1,
        triangleCountLabel: "1",
      });

      return createRuntime();
    },
  );

  renderViewport();

  const hint = await screen.findByText(
    "Left drag Rotate · Right drag Pan · Wheel Zoom",
  );

  fireEvent.pointerDown(
    screen.getByRole("region", { name: "Interactive 3D viewport" }),
  );

  expect(hint).not.toBeInTheDocument();
});

describe("Oversize Mold Mode toolbar coordination", () => {
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  function setOversizedModel() {
    // Scaled 6x from the pre-150mm-floor fixture (printer 100mm / model
    // 150x50x50) so "oversized only on X" survives
    // AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM (currently 100) -- see the
    // identical scaling in cuttingWorkflow.store.test.ts's resetAll().
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 600, y: 600, z: 600 });
    const geometry: CanonicalPartGeometry = {
      modelId: "model",
      geometryVersion: "v1",
      units: "millimeters",
      upAxis: "Z",
      positions: [],
      indices: [],
      transform: IDENTITY,
      localBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 900, y: 300, z: 300 } },
      winding: "source",
      validationStatus: "captured",
      sourceSignature: "sig",
    };
    useModelBoundsStore.getState().setGroundedWorldBoundsFromGeometry(geometry);
  }

  // The user must explicitly walk Constructed Cutting Plan -> Segmentation
  // before General Segmentation can become authoritative for the model.
  async function selectSegmentationStrategy() {
    await userEvent.click(
      await screen.findByRole("button", { name: "Constructed Cutting Plan" }),
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "Segmentation" }),
    );
  }

  it("activates Cut by Face selection on session open and reveals Create Cavity only after its real commit", async () => {
    let onSplitFaceToggle: ViewportRuntimeOptions["onSplitFaceToggle"] | undefined;
    const setSplitFaceSelection = vi.fn();
    runtimeMock.createThreeViewportRuntime.mockImplementation(
      (options: ViewportRuntimeOptions) => {
        onSplitFaceToggle = options.onSplitFaceToggle;
        options.onStatusChange({ phase: "ready" });
        options.onSelectionChange({
          isModelSelected: true,
          selectedModelId: "model-1",
          selectionBoxBounds: moldBounds,
        });
        return createRuntime({ setSplitFaceSelection });
      },
    );

    setOversizedModel();
    renderViewport();
    await userEvent.click(
      await screen.findByRole("button", { name: "Constructed Cutting Plan" }),
    );

    await waitFor(() => {
      expect(useSplitFaceStore.getState().workflow).toBe("selectingFaces");
    });
    expect(setSplitFaceSelection).toHaveBeenLastCalledWith(true, []);
    expect(screen.queryByRole("button", { name: "Create Cavity" })).not.toBeInTheDocument();

    act(() => onSplitFaceToggle?.("front"));
    expect(useSplitFaceStore.getState().workflow).toBe("planesReady");
    expect(useSplitFaceStore.getState().cuttingPlanes).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    });
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(screen.getByRole("button", { name: "Create Cavity" })).toBeInTheDocument();
  });

  // The main toolbar (Sprue, Flip, Create Cavity) now exists exactly once,
  // always -- it stays mounted and visible for the whole session (the panel
  // is an extension of it, not a replacement), with only the
  // session-inapplicable tools (Flip, the trigger itself) disabled while
  // the panel owns the session.
  it("opens the panel on the Segmentation tab and returns to the single main toolbar on Cancel", async () => {
    await prepareMoldParts("front");

    runtimeMock.createThreeViewportRuntime.mockImplementation(
      (options: ViewportRuntimeOptions) => {
        options.onStatusChange({ phase: "ready" });
        options.onSelectionChange({
          isModelSelected: true,
          selectedModelId: "model-1",
          selectionBoxBounds: moldBounds,
        });

        return createRuntime();
      },
    );

    setOversizedModel();
    renderViewport();
    await selectSegmentationStrategy();

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Segmentation", selected: true }),
      ).toBeInTheDocument();
    });
    // The main toolbar stays visible while the panel owns the session --
    // Flip is disabled (it doesn't apply to an uncommitted draft) but Sprue
    // remains whatever its own existing availability gate says (still
    // disabled here, since no reference geometry has been committed yet).
    expect(screen.getByRole("button", { name: "Sprue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flip" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "Sprue" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Flip" })).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Constructed Cutting Plan" }),
    ).toBeInTheDocument();
  });

  // End-to-end regression for the missing-cavity-controls defect: confirming
  // a real Segmentation plan through the actual toolbar button must
  // reach Viewport's own adoptCommittedSegmentationResult promotion effect
  // (never called directly here) and surface Create Cavity/Sprue/Glass in
  // the real rendered toolbar -- not just in isolated store/component state.
  it("promotes a confirmed Segmentation result to partsReady and reveals Create Cavity, Sprue, and the Glass/Ghosted control", async () => {
    runtimeMock.createThreeViewportRuntime.mockImplementation(
      (options: ViewportRuntimeOptions) => {
        options.onStatusChange({ phase: "ready" });
        options.onSelectionChange({
          isModelSelected: true,
          selectedModelId: "model-1",
          selectionBoxBounds: moldBounds,
        });

        return createRuntime();
      },
    );

    setOversizedModel();
    renderViewport();
    await selectSegmentationStrategy();

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Segmentation", selected: true }),
      ).toBeInTheDocument();
    });

    // A valid preview exists (planning succeeded) but nothing has been
    // confirmed yet -- Create Cavity must not be reachable before that,
    // even though the main toolbar itself stays rendered throughout.
    expect(useSegmentationStore.getState().phase).toBe("preview");
    expect(
      screen.queryByRole("button", { name: /Create Cavity/i }),
    ).not.toBeInTheDocument();

    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton).toBeEnabled();
    await userEvent.click(doneButton);

    // The real accept -> execute -> promote chain, not a manually forced
    // result -- commitActiveTab runs it imperatively (see
    // cuttingWorkflow.store.ts), so by the time Done closes the session both
    // are already settled.
    await waitFor(() => {
      expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    });
    expect(useSegmentationStore.getState().phase).toBe("valid");
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Create Cavity" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprue" })).toBeEnabled();

    // Glass/Ghosted only depends on cavity completion (not on segmentation
    // itself, same mechanism the normal Cut by Face path already uses) --
    // seeded directly the same way this file's own "keeps cutting-plane
    // editing state untouched by a completed cavity" test already does,
    // since actually running the cavity worker is outside this component's
    // own responsibility and this file's existing convention.
    act(() => {
      useSplitFaceStore.setState((state) => ({
        cavity: { ...state.cavity, status: "complete" },
      }));
    });
    expect(
      screen.getByRole("button", { name: "Enable glass mold appearance" }),
    ).toBeInTheDocument();
  });

  // Reproduces the reported defect directly: an oversized model with cutting
  // planes already constructed (from before it became oversized, or from a
  // stale prior session) must not keep rendering them or accepting new
  // face-click toggles once Segmentation, not Split Face, owns the model.
  it("suppresses manual Split Face cutting planes and face-selection while the Segmentation tab is active, restoring them once the session ends via Cancel", async () => {
    act(() => {
      useSplitFaceStore.getState().enterSelection();
      useSplitFaceStore.getState().toggleFace("front");
    });
    expect(useSplitFaceStore.getState().cuttingPlanes.length).toBeGreaterThan(0);
    expect(useSplitFaceStore.getState().workflow).not.toBe("partsReady");
    const preSessionPlanes = useSplitFaceStore.getState().cuttingPlanes;

    const setCuttingPlanes = vi.fn();
    const setSplitFaceSelection = vi.fn();

    runtimeMock.createThreeViewportRuntime.mockImplementation(
      (options: ViewportRuntimeOptions) => {
        options.onStatusChange({ phase: "ready" });
        options.onSelectionChange({
          isModelSelected: true,
          selectedModelId: "model-1",
          selectionBoxBounds: moldBounds,
        });

        return createRuntime({ setCuttingPlanes, setSplitFaceSelection });
      },
    );

    setOversizedModel();
    renderViewport();
    await selectSegmentationStrategy();

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Segmentation", selected: true }),
      ).toBeInTheDocument();
    });

    expect(setCuttingPlanes).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.any(Object),
      [],
    );
    expect(setSplitFaceSelection).toHaveBeenLastCalledWith(false, expect.any(Array));

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(setCuttingPlanes).toHaveBeenLastCalledWith(
        expect.any(Object),
        expect.any(Object),
        preSessionPlanes,
      );
    });
  });

  // Reproduces the second reported defect directly: after selecting an
  // oversized strategy, the viewport must actually receive real
  // Segmentation Engine output (canonical planned section bodies + real plan
  // boundaries) -- not stay empty because no committed Split Face result
  // exists for a model that was never manually split.
  it("renders canonical planned mold sections and real Multi-Plane boundaries once a strategy is selected for a model that was never manually split", async () => {
    act(() => {
      useSegmentationStore.getState().reset();
    });

    const setSegmentationVisualization = vi.fn();

    runtimeMock.createThreeViewportRuntime.mockImplementation(
      (options: ViewportRuntimeOptions) => {
        options.onStatusChange({ phase: "ready" });
        options.onSelectionChange({
          isModelSelected: true,
          selectedModelId: "model-1",
          selectionBoxBounds: moldBounds,
        });

        return createRuntime({
          setSegmentationVisualization,
        });
      },
    );

    setOversizedModel();
    renderViewport();
    await selectSegmentationStrategy();

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Segmentation", selected: true }),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(setSegmentationVisualization).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.any(Array),
        expect.any(Array),
        expect.any(Array),
      );
    });

    const [partOffset, previewBodies, previewPlanes, committedBodies] =
      setSegmentationVisualization.mock.calls.at(-1)!;
    expect(partOffset).toEqual({ x: 0, y: 0, z: 100 });
    expect(previewBodies.length).toBe(
      useSegmentationStore.getState().plan!.segments.length,
    );
    expect(previewPlanes.length).toBeGreaterThan(0);
    expect(committedBodies).toEqual([]);
    expect(
      previewPlanes.every(
        (boundary: { axis: string }) => boundary.axis === "x",
      ),
    ).toBe(true);
  });
});


describe("Printer dimensions prompt -- Segmentation", () => {
  beforeEach(() => {
    useCuttingWorkflowStore.setState({
      state: { kind: "idle" },
      lastSegmentationProvenance: null,
    });
    useSegmentationStore.getState().reset();
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
  });

  async function selectSegmentationTab() {
    await userEvent.click(
      await screen.findByRole("button", { name: "Constructed Cutting Plan" }),
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "Segmentation" }),
    );
  }

  function renderWithSelectedModel() {
    runtimeMock.createThreeViewportRuntime.mockImplementation(
      (options: ViewportRuntimeOptions) => {
        options.onStatusChange({ phase: "ready" });
        options.onSelectionChange({
          isModelSelected: true,
          selectedModelId: "model-1",
          selectionBoxBounds: moldBounds,
        });
        return createRuntime();
      },
    );
    renderViewport();
  }

  it("shows the contextual printer-dimensions prompt when the Segmentation tab is active and no dimensions are set", async () => {
    renderWithSelectedModel();
    await selectSegmentationTab();

    expect(
      await screen.findByLabelText("Printer build volume"),
    ).toBeInTheDocument();
  });

  it("recovers from opening the Segmentation tab before printer dimensions exist: Done stays disabled, planning retries automatically once dimensions are entered via the real prompt, and Done then succeeds -- the actual real-browser order of operations, not dimensions pre-set before session entry", async () => {
    const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    useModelBoundsStore.getState().setGroundedWorldBoundsFromGeometry({
      modelId: "model-1",
      geometryVersion: "v1",
      units: "millimeters",
      upAxis: "Z",
      positions: [],
      indices: [],
      transform: IDENTITY,
      localBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 150, y: 50, z: 50 } },
      winding: "source",
      validationStatus: "captured",
      sourceSignature: "sig",
    });

    renderWithSelectedModel();
    await selectSegmentationTab();

    // The first attempt genuinely fails -- no dimensions yet. Done must
    // stay disabled while no committable plan exists.
    expect(await screen.findByLabelText("Printer build volume")).toBeInTheDocument();
    expect(useSegmentationStore.getState().phase).toBe("failed");
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

    // Fill in the dimensions through the real prompt, exactly as a user
    // would -- not by calling a store action directly.
    await userEvent.type(
      screen.getByLabelText("Printer X dimension"),
      "100",
    );
    await userEvent.type(
      screen.getByLabelText("Printer Y dimension"),
      "100",
    );
    await userEvent.type(
      screen.getByLabelText("Printer Z dimension"),
      "100",
    );
    await userEvent.click(screen.getByRole("button", { name: "Enter" }));

    // The prompt disappears (dimensions are now set) and the plan was
    // retried without any further user action.
    await waitFor(() => {
      expect(screen.queryByLabelText("Printer build volume")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(useSegmentationStore.getState().phase).not.toBe("failed");
    });

    // The plan preview computes asynchronously even in the no-Worker path.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(selectActiveMoldBodies(useSplitFaceStore.getState())?.length).toBeGreaterThan(0);
  });

  it("does not require printer dimensions for Import STL to remain available", async () => {
    renderWithSelectedModel();

    const fileInput = screen.getByLabelText("Local STL file");
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).not.toBeDisabled();
    expect(screen.queryByLabelText("Printer build volume")).not.toBeInTheDocument();
  });
});
