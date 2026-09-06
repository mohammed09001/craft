import { type FormEvent, type PointerEvent, useState } from "react";

import {
  sizeOfBounds,
  useAutomaticSegmentationMoldFrameBounds,
  useFitAnalysis,
} from "@/features/mold-generation/segmentation";
import { useGroundedWorldBounds } from "@/features/viewport/modelBounds.store";
import {
  parsePrinterBuildVolume,
  type PrinterBuildVolumeDraft,
  usePrinterBuildVolume,
  usePrinterBuildVolumeStore,
} from "@/features/viewport/printerBuildVolume.store";

import styles from "@/features/viewport/Viewport.module.css";

const EMPTY_DRAFT: PrinterBuildVolumeDraft = {
  x: "",
  y: "",
  z: "",
};

function formatMm(value: number): string {
  return `${Math.round(value)} mm`;
}

export function PrinterDimensionsPrompt() {
  const dimensions = usePrinterBuildVolume();
  const setPrinterBuildVolume = usePrinterBuildVolumeStore(
    (state) => state.setPrinterBuildVolume,
  );
  // Same authoritative fit-analysis source Viewport.tsx uses for oversized
  // workflow routing -- this row never decides oversize status itself, it
  // only reflects it.
  const fit = useFitAnalysis();
  const groundedWorldBounds = useGroundedWorldBounds();
  const automaticMoldFrame = useAutomaticSegmentationMoldFrameBounds();
  const automaticMoldSize = sizeOfBounds(
    automaticMoldFrame?.referenceMoldBlockBounds ?? null,
  );
  const showModelSize =
    fit.overall === "DOES_NOT_FIT" &&
    groundedWorldBounds !== null &&
    automaticMoldSize !== null;
  const axisFit =
    showModelSize && fit.moldStage.status === "DOES_NOT_FIT"
      ? fit.moldStage.axisFit
      : null;
  const [draft, setDraft] = useState<PrinterBuildVolumeDraft>(() =>
    dimensions === null
      ? EMPTY_DRAFT
      : {
          x: String(dimensions.x),
          y: String(dimensions.y),
          z: String(dimensions.z),
        },
  );
  const [error, setError] = useState<string | null>(null);
  const isComplete = dimensions !== null;

  function updateDimension(
    axis: keyof PrinterBuildVolumeDraft,
    value: string,
  ) {
    setDraft((current) => ({ ...current, [axis]: value }));
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parsePrinterBuildVolume(draft);

    if (!result.ok) {
      setError("Enter positive X, Y, and Z dimensions.");
      return;
    }

    setPrinterBuildVolume(result.dimensions);
    setDraft({
      x: String(result.dimensions.x),
      y: String(result.dimensions.y),
      z: String(result.dimensions.z),
    });
    setError(null);
  }

  function stopViewportPointerInteraction(event: PointerEvent<HTMLFormElement>) {
    event.stopPropagation();
  }

  return (
    <form
      aria-label="Printer build volume"
      className={`${styles.buildVolumeBar} ${
        isComplete ? styles.buildVolumeBarComplete : ""
      }`}
      data-placement={isComplete ? "bottom" : "center"}
      noValidate
      onPointerDown={stopViewportPointerInteraction}
      onSubmit={handleSubmit}
    >
      <span className={styles.buildVolumePrompt}>Printer build volume</span>
      {(["x", "y", "z"] as const).map((axis) => (
        <label className={styles.buildVolumeField} key={axis}>
          <span>{axis.toUpperCase()}</span>
          <input
            aria-invalid={error !== null}
            aria-label={`Printer ${axis.toUpperCase()} dimension`}
            className={styles.buildVolumeInput}
            inputMode="decimal"
            min="0"
            onChange={(event) => updateDimension(axis, event.target.value)}
            placeholder="0"
            step="any"
            type="number"
            value={draft[axis]}
          />
        </label>
      ))}
      <span className={styles.buildVolumeUnit}>mm</span>
      <button className={styles.buildVolumeSubmit} type="submit">
        {isComplete ? "Re-enter" : "Enter"}
      </button>
      {error !== null && (
        <span className={styles.buildVolumeError} role="alert">
          {error}
        </span>
      )}
      {showModelSize && (
        <div aria-label="Automatic mold size" className={styles.modelSizeRow}>
          <span className={styles.modelSizeLabel}>Mold</span>
          {(["x", "y", "z"] as const).map((axis) => (
            <span className={styles.modelSizeField} key={axis}>
              <span>{axis.toUpperCase()}</span>
              <output
                aria-label={`Mold ${axis.toUpperCase()} dimension`}
                className={`${styles.modelSizeValue} ${
                  axisFit !== null && !axisFit[axis]
                    ? styles.modelSizeValueExceeded
                    : ""
                }`}
              >
                {formatMm(automaticMoldSize![axis])}
              </output>
            </span>
          ))}
        </div>
      )}
    </form>
  );
}
