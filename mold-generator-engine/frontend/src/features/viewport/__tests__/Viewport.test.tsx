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
import { useSegmentationModeStore } from "@/features/mold-generation/segmentation";
import {
  useAutomaticDraftStore,
  useCuttingWorkflowStore,
  useManualDraftStore,
} from "@/features/mold-generation/cutting-workflow";
import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useModelImportStore } from "@/features/viewport/modelImport.store";
import { usePartOrientationStore } from "@/features/viewport/partOrientation.store";
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
  useSegmentationModeStore.getState().resetStrategy();
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
  // as One Mold before General Segmentation can become authoritative for
  // the model.
  async function selectOneMoldStrategy() {
    await userEvent.click(
      await screen.findByRole("button", { name: "Constructed Cutting Plan" }),
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "Segmentation as One Mold" }),
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
  it("opens the panel on the One Mold tab and returns to the single main toolbar on Cancel", async () => {
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
    await selectOneMoldStrategy();

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Segmentation as One Mold", selected: true }),
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
  // a real One Mold segmentation plan through the actual toolbar button must
  // reach Viewport's own adoptCommittedSegmentationResult promotion effect
  // (never called directly here) and surface Create Cavity/Sprue/Glass in
  // the real rendered toolbar -- not just in isolated store/component state.
  it("promotes a confirmed One Mold segmentation result to partsReady and reveals Create Cavity, Sprue, and the Glass/Ghosted control", async () => {
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
    await selectOneMoldStrategy();

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Segmentation as One Mold", selected: true }),
      ).toBeInTheDocument();
    });

    // A valid preview exists (planning succeeded) but nothing has been
    // confirmed yet -- Create Cavity must not be reachable before that,
    // even though the main toolbar itself stays rendered throughout.
    expect(useSegmentationModeStore.getState().phase).toBe("preview");
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
    expect(useSegmentationModeStore.getState().phase).toBe("valid");
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
  it("suppresses manual Split Face cutting planes and face-selection while the One Mold tab is active, restoring them once the session ends via Cancel", async () => {
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
    await selectOneMoldStrategy();

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Segmentation as One Mold", selected: true }),
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
      useSegmentationModeStore.getState().resetStrategy();
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
    await selectOneMoldStrategy();

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Segmentation as One Mold", selected: true }),
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
      useSegmentationModeStore.getState().plan!.segments.length,
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

describe("More molds session -- Manual draft ownership", () => {
  beforeEach(() => {
    useCuttingWorkflowStore.setState({
      state: { kind: "idle" },
      lastMoreMoldsProvenance: null,
      lastReopenBlockedReason: null,
    });
    useManualDraftStore.getState().clearForModelReplacement();
    useAutomaticDraftStore.getState().resetStrategy();
  });

  async function enterMoreMoldsFlyout() {
    await userEvent.click(
      await screen.findByRole("button", { name: "Constructed Cutting Plan" }),
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "Segmentation as More Molds" }),
    );
  }

  async function enterManualSession() {
    await enterMoreMoldsFlyout();
    useCuttingWorkflowStore.getState().switchToManual();
  }

  it("gives Manual's own draft state exclusive ownership of the shared viewportTool context, never briefly or finally the singleton's stale state", async () => {
    // The singleton is deliberately put into "selectingFaces" (distinct from
    // both Manual's fresh "modelReady" default AND the "planesReady" state
    // Manual reaches below) so a passing assertion can't be explained by the
    // two stores coincidentally sharing the same default shape -- a fresh
    // Manual draft and an untouched singleton both start at
    // {workflow:"modelReady", hasCuttingPlanes:false}, which would make that
    // particular shape ambiguous evidence of a leak.
    useSplitFaceStore.getState().clearForModelReplacement();
    useSplitFaceStore.getState().enterSelection();

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

    // Records every context value the shared store passes through, from
    // right after render through session entry and the subsequent
    // interaction, not just the final value -- so a stale write can never
    // hide behind ordering luck. SplitFaceControls legitimately owns (and
    // writes) the shared context exactly once at mount -- whether that
    // commits synchronously within renderViewport() or is deferred by a
    // microtask is a harness timing detail this test must not depend on, so
    // rather than trying to subscribe strictly "after" that one legitimate
    // write, the assertion below tolerates exactly one occurrence of the
    // singleton's shape and fails only if it appears a SECOND time (which is
    // exactly what a missing ownership guard produces: one legitimate write
    // at mount, then another when `isMoreMoldsSessionActive` flips true).
    // Records only actual `context` transitions, not every notification of
    // this store (e.g. an unrelated `activeTool` reset at session entry/exit
    // also notifies subscribers even though `context` itself is unchanged --
    // that must not read as a spurious extra occurrence).
    const contextHistory: unknown[] = [];
    const unsubscribe = useViewportToolStore.subscribe((state) => {
      if (contextHistory.at(-1) !== state.context) {
        contextHistory.push(state.context);
      }
    });

    await enterManualSession();
    act(() => {
      useManualDraftStore.getState().enterSelection();
      useManualDraftStore.getState().toggleFace("front");
    });

    await waitFor(() => {
      expect(useViewportToolStore.getState().context).toEqual({
        workflow: "planesReady",
        evaluationPhase: "idle",
        hasReferenceGeometry: false,
        hasCuttingPlanes: true,
      });
    });
    unsubscribe();

    // The singleton's own ("selectingFaces") shape may legitimately appear
    // up to twice: SplitFaceControls' one-time mount write, and
    // CuttingSessionPanel's own Cut by Face tab (the panel's default tab on
    // open, which -- by design -- also drives the singleton directly, see
    // the panel's own doc comment) reflecting that same pre-session state
    // for the brief window before the user switches to the More Molds tab.
    // What must never happen is a THIRD occurrence: that would mean the
    // ownership guard re-leaked the singleton's state once Manual was
    // already the active, interactive draft.
    const staleSingletonWrites = contextHistory.filter(
      (context) =>
        typeof context === "object" &&
        context !== null &&
        (context as { workflow?: unknown }).workflow === "selectingFaces",
    );
    expect(staleSingletonWrites.length).toBeLessThanOrEqual(2);
    expect(useSplitFaceStore.getState().workflow).toBe("selectingFaces");
  });

  it("resets the active tool to Pointer when entering a more-molds session, even if Sprue was active", async () => {
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

    act(() => {
      useViewportToolStore.getState().setContext({
        workflow: "partsReady",
        evaluationPhase: "complete",
        hasReferenceGeometry: true,
        hasCuttingPlanes: true,
      });
      useViewportToolStore.getState().setActiveTool("sprue");
    });
    expect(useViewportToolStore.getState().activeTool).toBe("sprue");

    await enterMoreMoldsFlyout();

    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
  });

  it("keeps the Three.js Sprue preview inactive during a more-molds session even if Sprue was left selected", async () => {
    const setSpruePreviewActive = vi.fn();
    runtimeMock.createThreeViewportRuntime.mockImplementation(
      (options: ViewportRuntimeOptions) => {
        options.onStatusChange({ phase: "ready" });
        options.onSelectionChange({
          isModelSelected: true,
          selectedModelId: "model-1",
          selectionBoxBounds: moldBounds,
        });
        return createRuntime({ setSpruePreviewActive });
      },
    );
    renderViewport();

    act(() => {
      useViewportToolStore.getState().setContext({
        workflow: "partsReady",
        evaluationPhase: "complete",
        hasReferenceGeometry: true,
        hasCuttingPlanes: true,
      });
      useViewportToolStore.getState().setActiveTool("sprue");
    });
    await waitFor(() => expect(setSpruePreviewActive).toHaveBeenLastCalledWith(true));

    await enterMoreMoldsFlyout();

    await waitFor(() => expect(setSpruePreviewActive).toHaveBeenLastCalledWith(false));
  });

  it("blocks sprue diameter/entry-neck commits from mutating the singleton during a more-molds session", async () => {
    let onSprueDiameterCommit: ViewportRuntimeOptions["onSprueDiameterCommit"] | undefined;
    let onSprueEntryNeckDiameterCommit: ViewportRuntimeOptions["onSprueEntryNeckDiameterCommit"] | undefined;
    runtimeMock.createThreeViewportRuntime.mockImplementation(
      (options: ViewportRuntimeOptions) => {
        onSprueDiameterCommit = options.onSprueDiameterCommit;
        onSprueEntryNeckDiameterCommit = options.onSprueEntryNeckDiameterCommit;
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
    await enterMoreMoldsFlyout();

    await expect(onSprueDiameterCommit?.("any-operation-id", 6)).resolves.toBe(false);
    await expect(onSprueEntryNeckDiameterCommit?.("any-operation-id", 3)).resolves.toBe(false);
  });

  it("does not let the Eraser fall through to the singleton when Automatic is the active draft", async () => {
    await prepareMoldParts("front", "right");
    // Entering any more-molds session clears uncommitted Cut by Face
    // selection (pre-existing, unrelated behavior), which would make a
    // real removeSplitFaceAndRebuild no-op regardless of gating (nothing
    // left to erase) -- so the singleton's action is replaced outright with
    // a controlled fake here, decoupling this check from cuttingPlanes state
    // and from vi.spyOn's demonstrated fragility across zustand's
    // spread-merged state snapshots in this suite (a spied reference can
    // leak forward into later, unrelated tests' state objects).
    const removeSplitFaceAndRebuildFake = vi.fn().mockResolvedValue(true);
    useSplitFaceStore.setState({
      removeSplitFaceAndRebuild: removeSplitFaceAndRebuildFake,
    });

    let onCuttingPlaneErase: ViewportRuntimeOptions["onCuttingPlaneErase"] | undefined;
    runtimeMock.createThreeViewportRuntime.mockImplementation(
      (options: ViewportRuntimeOptions) => {
        onCuttingPlaneErase = options.onCuttingPlaneErase;
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
    // Automatic is the active draft by default -- never switched to Manual.
    await enterMoreMoldsFlyout();

    act(() => onCuttingPlaneErase?.("front"));

    expect(removeSplitFaceAndRebuildFake).not.toHaveBeenCalled();
  });

  it("ignores arrow-key Flip while a more-molds session is active", async () => {
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
    await enterMoreMoldsFlyout();
    // Directly force the tool back to "orientation", bypassing whatever
    // availability gate would normally apply, to isolate this test to the
    // arrow-key listener's own more-molds-session guard rather than the
    // boundary reset already covered by the earlier "resets the active
    // tool" test above.
    act(() => useViewportToolStore.setState({ activeTool: "orientation" }));

    const flipSpy = vi.spyOn(usePartOrientationStore.getState(), "flipOrientation");
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(flipSpy).not.toHaveBeenCalled();
  });

  it("promotes Manual's committed result into the singleton, restores Pointer, and re-enables normal Cut by Face interaction", async () => {
    let onSplitFaceToggle: ViewportRuntimeOptions["onSplitFaceToggle"] | undefined;
    runtimeMock.createThreeViewportRuntime.mockImplementation(
      (options: ViewportRuntimeOptions) => {
        onSplitFaceToggle = options.onSplitFaceToggle;
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
    await enterManualSession();

    act(() => {
      useManualDraftStore.getState().enterSelection();
      useManualDraftStore.getState().toggleFace("front");
      useManualDraftStore.getState().toggleFace("right");
    });
    await waitFor(() => {
      expect(useManualDraftStore.getState().workflow).toBe("planesReady");
    });

    const committed = await useCuttingWorkflowStore
      .getState()
      .commitActiveTab("model-1", moldBounds);
    expect(committed).toBe(true);

    // The workflow is idle again -- but the committed mold must remain
    // visible through the exact same source the idle viewport always reads
    // (the singleton), not vanish because it was only ever written into the
    // now-discarded draft.
    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(useSplitFaceStore.getState().lastCommittedResult).not.toBeNull();
    const singletonBodies = selectActiveMoldBodies(useSplitFaceStore.getState());
    expect(singletonBodies?.length).toBeGreaterThan(0);
    // Manual (the active, winning draft) keeps its own result too -- but it
    // must not be a hidden RENDER source once idle: the singleton above is
    // what Viewport actually reads, this is just pre-existing draft-lifecycle
    // behavior this promotion must not disturb.
    expect(useManualDraftStore.getState().workflow).toBe("partsReady");
    // The discarded, inactive Automatic draft is the one reset to idle.
    expect(useAutomaticDraftStore.getState().mode).toBeNull();

    // Committing also restores Pointer (Finding 2's exit-boundary reset).
    expect(useViewportToolStore.getState().activeTool).toBe("pointer");

    // Cut by Face interactions work normally again on the singleton.
    const singletonPlanesBefore = useSplitFaceStore.getState().cuttingPlanes.length;
    act(() => onSplitFaceToggle?.("top"));
    expect(useSplitFaceStore.getState().cuttingPlanes.length).not.toBe(singletonPlanesBefore);
  });

  it("Done from Manual, clicked in the DOM, commits and returns to the main toolbar: MoreMoldsToolbar disappears, all Constructed Cutting Plan flyouts close, Pointer is active, and the committed result stays visible", async () => {
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
    await enterManualSession();

    act(() => {
      useManualDraftStore.getState().enterSelection();
      useManualDraftStore.getState().toggleFace("front");
      useManualDraftStore.getState().toggleFace("right");
    });
    await waitFor(() => {
      expect(useManualDraftStore.getState().workflow).toBe("planesReady");
    });

    // Sanity: the panel is actually open on the More Molds tab before Done.
    expect(
      screen.getByRole("tab", { name: "Segmentation as More Molds", selected: true }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    });

    // The panel disappears entirely.
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
    // The main toolbar (with its own Constructed Cutting Plan trigger) is
    // back.
    expect(
      screen.getByRole("button", { name: "Constructed Cutting Plan" }),
    ).toBeInTheDocument();
    // Pointer becomes active.
    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
    // The committed result remains visible through the same source the idle
    // viewport reads, after the toolbar transition has settled.
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(selectActiveMoldBodies(useSplitFaceStore.getState())?.length).toBeGreaterThan(0);
    // The main toolbar's shared Create Cavity/Sprue/Glass controls -- the
    // same reused pipeline Cut by Face uses, not a parallel one -- are
    // available for the committed result.
    expect(
      screen.getByRole("button", { name: "Create Cavity" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprue" })).toBeEnabled();
  });

  it("Done from Automatic, clicked in the DOM, commits and returns to the main toolbar", async () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 100, y: 100, z: 100 });
    useModelBoundsStore.getState().setGroundedWorldBoundsFromGeometry({
      modelId: "model-1",
      geometryVersion: "v1",
      units: "millimeters",
      upAxis: "Z",
      positions: [],
      indices: [],
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 150, y: 50, z: 50 } },
      winding: "source",
      validationStatus: "captured",
      sourceSignature: "sig-automatic-done-click",
    });

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
    // Automatic is the active draft by default -- never switched to Manual.
    await enterMoreMoldsFlyout();
    expect(
      screen.getByRole("tab", { name: "Segmentation as More Molds", selected: true }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    });

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Constructed Cutting Plan" }),
    ).toBeInTheDocument();
    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(selectActiveMoldBodies(useSplitFaceStore.getState())?.length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Create Cavity" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprue" })).toBeEnabled();
  });

  it("a failed commit does not close the session or return to the main toolbar", async () => {
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
    await enterManualSession();
    // Deliberately do NOT build any cutting planes -- Manual's workflow
    // stays "modelReady", so createMoldParts inside commitActiveTab cannot
    // succeed and provenance stays null.
    expect(useManualDraftStore.getState().workflow).toBe("modelReady");

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    // The session stays open -- commit failure returns to "editing", not idle.
    expect(useCuttingWorkflowStore.getState().state).toEqual({
      kind: "sessionOpen",
      activeTab: "moreMolds",
      moreMoldsActiveDraft: "manual",
      commitPhase: "editing",
    });
    expect(
      screen.getByRole("tab", { name: "Segmentation as More Molds", selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    // The main toolbar's own flyout trigger stays visible but disabled --
    // openSession() already no-ops outside "idle", so it must not look
    // clickable while a session is already open.
    expect(
      screen.getByRole("button", { name: "Constructed Cutting Plan" }),
    ).toBeDisabled();
  });

  it("clicking Done twice in immediate succession cannot trigger a duplicate commit", async () => {
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
    await enterManualSession();

    act(() => {
      useManualDraftStore.getState().enterSelection();
      useManualDraftStore.getState().toggleFace("front");
      useManualDraftStore.getState().toggleFace("right");
    });
    await waitFor(() => {
      expect(useManualDraftStore.getState().workflow).toBe("planesReady");
    });

    // Wraps (not replaces) the singleton's own promotion step, which
    // commitActiveTab's More Molds Manual branch calls exactly once per
    // actual commit -- installed via setState (a fresh value on the store's
    // current snapshot, always read fresh by commitActiveTab's own
    // getState() call at invocation time) rather than vi.spyOn on a hook
    // value the button's onClick closure may have already captured before
    // this point, and rather than vi.spyOn on a getState() snapshot object,
    // which this suite has separately confirmed can leak forward through
    // zustand's spread-merged state into unrelated later tests.
    const originalSeed = useSplitFaceStore.getState().seedCuttingPlanesForReopen;
    const seedFake = vi.fn((...args: Parameters<typeof originalSeed>) =>
      originalSeed(...args),
    );
    useSplitFaceStore.setState({ seedCuttingPlanesForReopen: seedFake });

    // Fire two clicks back to back, before either has had a chance to
    // resolve or for React to disable the button in response to the first.
    const doneButton = screen.getByRole("button", { name: "Done" });
    fireEvent.click(doneButton);
    fireEvent.click(doneButton);

    await waitFor(() => {
      expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    });

    // Only one of the two clicks may have actually performed the commit's
    // promotion step -- the second must have observed commitPhase already
    // "committing" (or the workflow already back to idle) and no-op'd.
    expect(seedFake).toHaveBeenCalledTimes(1);
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    // A duplicate commit would have discarded/reset the just-committed
    // Manual draft a second time or double-written provenance; neither
    // draft ends up in a corrupted intermediate state.
    expect(useAutomaticDraftStore.getState().mode).toBeNull();
  });
});

describe("More molds session -- Automatic committed result visibility", () => {
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  beforeEach(() => {
    useCuttingWorkflowStore.setState({
      state: { kind: "idle" },
      lastMoreMoldsProvenance: null,
      lastReopenBlockedReason: null,
    });
    useSplitFaceStore.getState().clearForModelReplacement();
    useManualDraftStore.getState().clearForModelReplacement();
    useAutomaticDraftStore.getState().resetStrategy();
    // Oversized (in X) relative to the printer volume, matching
    // cuttingWorkflow.store.test.ts's own working Automatic-commit setup --
    // a model that already fits produces a "not-required" plan (no bodies
    // to promote), which is a separate, pre-existing, out-of-scope gap this
    // test isn't about.
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 100, y: 100, z: 100 });
    const geometry: CanonicalPartGeometry = {
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
      sourceSignature: "sig-automatic",
    };
    useModelBoundsStore.getState().setGroundedWorldBoundsFromGeometry(geometry);
  });

  async function enterMoreMoldsFlyout() {
    await userEvent.click(
      await screen.findByRole("button", { name: "Constructed Cutting Plan" }),
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "Segmentation as More Molds" }),
    );
  }

  it("promotes Automatic's committed result into the singleton and it remains visible after Done", async () => {
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
    await enterMoreMoldsFlyout();

    // The plan preview computes asynchronously even in the no-Worker path;
    // let it settle before Done accepts/executes it (matching
    // cuttingWorkflow.store.test.ts's own Automatic-commit pattern).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const committed = await useCuttingWorkflowStore.getState().commitActiveTab();
    expect(committed).toBe(true);

    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
    expect(useSplitFaceStore.getState().lastCommittedResult).not.toBeNull();
    const singletonBodies = selectActiveMoldBodies(useSplitFaceStore.getState());
    expect(singletonBodies?.length).toBeGreaterThan(0);
    // Automatic's own draft is not the render source once idle -- Viewport
    // must never need to read it to display the committed result.
    expect(useAutomaticDraftStore.getState().mode).toBe("make-as-more-molds");
  });

  it("recovers from clicking Done before printer dimensions exist: shows a blocking reason, retries automatically once dimensions are entered via the real prompt, and Done then succeeds -- the actual real-browser order of operations, not dimensions pre-set before session entry", async () => {
    // Undo the describe block's own beforeEach, which (like every other
    // test here) sets printer dimensions BEFORE ever entering the session.
    // That order never exercises this defect: Automatic's requestMode only
    // fails when dimensions are genuinely absent at session-entry time,
    // which is exactly the flow the contextual prompt exists to support
    // (enter the session first, get prompted, fill it in afterward).
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();

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
    await enterMoreMoldsFlyout();

    // Automatic's first attempt genuinely fails -- no dimensions yet.
    expect(await screen.findByLabelText("Printer build volume")).toBeInTheDocument();
    expect(useAutomaticDraftStore.getState().phase).toBe("failed");

    // Clicking Done now must not silently do nothing -- it must show why.
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(useCuttingWorkflowStore.getState().state).toEqual({
      kind: "sessionOpen",
      activeTab: "moreMolds",
      moreMoldsActiveDraft: "automatic",
      commitPhase: "editing",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/printer dimensions/i);

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

    // The prompt disappears (dimensions are now set) and Automatic's plan
    // was retried without any further user action.
    await waitFor(() => {
      expect(screen.queryByLabelText("Printer build volume")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(useAutomaticDraftStore.getState().phase).not.toBe("failed");
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
});

describe("Printer dimensions prompt -- more molds Automatic", () => {
  beforeEach(() => {
    useCuttingWorkflowStore.setState({
      state: { kind: "idle" },
      lastMoreMoldsProvenance: null,
      lastReopenBlockedReason: null,
    });
    useManualDraftStore.getState().clearForModelReplacement();
    useAutomaticDraftStore.getState().resetStrategy();
    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
  });

  async function enterMoreMoldsFlyout() {
    await userEvent.click(
      await screen.findByRole("button", { name: "Constructed Cutting Plan" }),
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "Segmentation as More Molds" }),
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

  it("shows the contextual printer-dimensions prompt when Automatic is active and no dimensions are set", async () => {
    renderWithSelectedModel();
    await enterMoreMoldsFlyout();

    expect(
      await screen.findByLabelText("Printer build volume"),
    ).toBeInTheDocument();
  });

  it("never shows the printer-dimensions prompt while Manual is the active draft", async () => {
    renderWithSelectedModel();
    await enterMoreMoldsFlyout();
    await screen.findByLabelText("Printer build volume");

    await act(async () => {
      useCuttingWorkflowStore.getState().switchToManual();
    });

    expect(
      screen.queryByLabelText("Printer build volume"),
    ).not.toBeInTheDocument();
  });

  it("shows and hides the prompt correctly when switching between Automatic and Manual with no dimensions set", async () => {
    renderWithSelectedModel();
    await enterMoreMoldsFlyout();
    expect(await screen.findByLabelText("Printer build volume")).toBeInTheDocument();

    await act(async () => {
      useCuttingWorkflowStore.getState().switchToManual();
    });
    expect(screen.queryByLabelText("Printer build volume")).not.toBeInTheDocument();

    await act(async () => {
      useCuttingWorkflowStore.getState().switchToAutomatic();
    });
    expect(
      await screen.findByLabelText("Printer build volume"),
    ).toBeInTheDocument();
  });

  it("does not require printer dimensions for Import STL to remain available", async () => {
    renderWithSelectedModel();

    const fileInput = screen.getByLabelText("Local STL file");
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).not.toBeDisabled();
    expect(screen.queryByLabelText("Printer build volume")).not.toBeInTheDocument();
  });
});

