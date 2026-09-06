import {
  calculateEuclideanDistance,
  formatModelUnitsDistance,
  useDistanceMeasurementStore,
} from "@/features/viewport/modelMeasurement.store";

beforeEach(() => {
  useDistanceMeasurementStore.getState().resetMeasurementAfterReplacement();
});

it("toggles Measure Distance between select and measuring", () => {
  useDistanceMeasurementStore.getState().toggleMeasureDistance();

  expect(useDistanceMeasurementStore.getState().measurement).toEqual({
    activeTool: "measure-distance",
    phase: "awaiting-first-point",
    announcement: "Measure Distance enabled.",
  });

  useDistanceMeasurementStore.getState().toggleMeasureDistance();

  expect(useDistanceMeasurementStore.getState().measurement).toEqual({
    activeTool: "select",
    phase: "inactive",
    announcement: "Measure Distance disabled.",
  });
});

it("keeps a completed measurement visible after tool deactivation", () => {
  useDistanceMeasurementStore.getState().setMeasurementStatus({
    activeTool: "measure-distance",
    phase: "complete",
    firstPoint: { x: 0, y: 0, z: 0 },
    secondPoint: { x: 3, y: 4, z: 0 },
    distance: 5,
    distanceLabel: "5 Model Units",
  });

  useDistanceMeasurementStore.getState().toggleMeasureDistance();

  expect(useDistanceMeasurementStore.getState().measurement).toEqual({
    activeTool: "select",
    phase: "complete",
    firstPoint: { x: 0, y: 0, z: 0 },
    secondPoint: { x: 3, y: 4, z: 0 },
    distance: 5,
    distanceLabel: "5 Model Units",
    announcement: "Measure Distance disabled.",
  });
});

it("clears measurement without changing the active tool", () => {
  useDistanceMeasurementStore.getState().setMeasurementStatus({
    activeTool: "measure-distance",
    phase: "awaiting-second-point",
    firstPoint: { x: 1, y: 2, z: 3 },
  });

  useDistanceMeasurementStore.getState().clearMeasurement();

  expect(useDistanceMeasurementStore.getState().measurement).toEqual({
    activeTool: "measure-distance",
    phase: "awaiting-first-point",
    announcement: "Measurement cleared.",
  });
});

it("calculates and formats Euclidean distance in model units", () => {
  const distance = calculateEuclideanDistance(
    { x: 1, y: 2, z: 3 },
    { x: 4, y: 6, z: 3 },
  );

  expect(distance).toBe(5);
  expect(formatModelUnitsDistance(distance)).toBe("5 Model Units");
});
