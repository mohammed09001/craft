import type { CanonicalPartGeometry } from "./cavityGeneration.contracts";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import { MoldAppearanceToggle } from "../reference-mold-definition/MoldAppearanceToggle";
import styles from "./CavityAction.module.css";

export function CavityAction({
  sourcePartMesh,
}: {
  readonly sourcePartMesh?: CanonicalPartGeometry | null;
}) {
  const mesh = sourcePartMesh;
  const workflow = useSplitFaceStore((state) => state.workflow);
  const cavity = useSplitFaceStore((state) => state.cavity);
  const segmentationRegenerationPending = useSplitFaceStore(
    (state) => state.segmentationRegenerationCount > 0,
  );
  const createCavity = useSplitFaceStore(
    (state) => state.createCavity,
  );

  if (workflow !== "partsReady") {
    return null;
  }

  const generating = cavity.status === "generating";
  const complete = cavity.status === "complete";

  const handlePrimaryAction = () => {
    if (mesh) {
      void createCavity(mesh);
    }
  };

  return (
    <div
      className={styles.actions}
      aria-label="Cavity generation"
    >
      <button
        disabled={generating || segmentationRegenerationPending || mesh === null}
        onClick={handlePrimaryAction}
        type="button"
      >
        {generating
          ? "Creating Cavity…"
          : segmentationRegenerationPending
            ? "Segmentation regenerating…"
            : complete
              ? "Rebuild Cavity"
              : "Create Cavity"}
      </button>
      <MoldAppearanceToggle visible={complete} />


      

      {cavity.lastError && (
        <span
          className={styles.error}
          role="alert"
        >
          {cavity.lastError}
        </span>
      )}
    </div>
  );
}


