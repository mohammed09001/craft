import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export type ActiveViewportTool = "select" | "measure-distance";

export type MeasurementPhase =
  | "inactive"
  | "awaiting-first-point"
  | "awaiting-second-point"
  | "complete";

export type SerializablePoint3 = {
  x: number;
  y: number;
  z: number;
};

export type DistanceMeasurementStatus = {
  activeTool: ActiveViewportTool;
  phase: MeasurementPhase;
  firstPoint?: SerializablePoint3;
  secondPoint?: SerializablePoint3;
  distance?: number;
  distanceLabel?: string;
  announcement?: string;
};

type DistanceMeasurementState = {
  measurement: DistanceMeasurementStatus;
};

type DistanceMeasurementActions = {
  setMeasurementStatus: (measurement: DistanceMeasurementStatus) => void;
  toggleMeasureDistance: () => void;
  clearMeasurement: () => void;
  resetMeasurementAfterReplacement: () => void;
};

export type DistanceMeasurementStore = DistanceMeasurementState &
  DistanceMeasurementActions;

export const initialDistanceMeasurementStatus: DistanceMeasurementStatus = {
  activeTool: "select",
  phase: "inactive",
};

export function calculateEuclideanDistance(
  firstPoint: SerializablePoint3,
  secondPoint: SerializablePoint3,
) {
  const x = secondPoint.x - firstPoint.x;
  const y = secondPoint.y - firstPoint.y;
  const z = secondPoint.z - firstPoint.z;

  return Math.sqrt(x * x + y * y + z * z);
}

export function formatModelUnitsDistance(distance: number) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  }).format(distance)} Model Units`;
}

export const useDistanceMeasurementStore =
  create<DistanceMeasurementStore>()((set) => ({
    measurement: initialDistanceMeasurementStatus,
    clearMeasurement: () =>
      set((state) => ({
        measurement: {
          activeTool: state.measurement.activeTool,
          phase:
            state.measurement.activeTool === "measure-distance"
              ? "awaiting-first-point"
              : "inactive",
          announcement: "Measurement cleared.",
        },
      })),
    resetMeasurementAfterReplacement: () =>
      set({ measurement: initialDistanceMeasurementStatus }),
    setMeasurementStatus: (measurement) => set({ measurement }),
    toggleMeasureDistance: () =>
      set((state) => {
        if (state.measurement.activeTool === "measure-distance") {
          return {
            measurement:
              state.measurement.phase === "complete"
                ? {
                    ...state.measurement,
                    activeTool: "select",
                    announcement: "Measure Distance disabled.",
                  }
                : {
                    activeTool: "select",
                    phase: "inactive",
                    announcement: "Measure Distance disabled.",
                  },
          };
        }

        return {
          measurement: {
            ...state.measurement,
            activeTool: "measure-distance",
            phase:
              state.measurement.phase === "complete"
                ? "complete"
                : "awaiting-first-point",
            announcement: "Measure Distance enabled.",
          },
        };
      }),
  }));

export const useDistanceMeasurementStatus = () =>
  useDistanceMeasurementStore((state) => state.measurement);

export const useDistanceMeasurementActions = () =>
  useDistanceMeasurementStore(
    useShallow((state) => ({
      clearMeasurement: state.clearMeasurement,
      resetMeasurementAfterReplacement: state.resetMeasurementAfterReplacement,
      setMeasurementStatus: state.setMeasurementStatus,
      toggleMeasureDistance: state.toggleMeasureDistance,
    })),
  );
