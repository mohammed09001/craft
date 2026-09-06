import { Eye, EyeOff } from "lucide-react";
import { selectActiveMoldBodies, useSplitFaceStore } from "../split-face/splitFace.store";
import styles from "./MoldBodiesBrowser.module.css";

type MoldBodiesBrowserProps = {
  modelVisible?: boolean;
  onModelVisibilityChange?: (visible: boolean) => void;
};

export function MoldBodiesBrowser({
  modelVisible = true,
  onModelVisibilityChange,
}: MoldBodiesBrowserProps = {}) {
  const bodies = useSplitFaceStore(selectActiveMoldBodies);
  const setBodyVisibility = useSplitFaceStore((state) => state.setBodyVisibility);

  if (!bodies?.length) return null;

  return (
    <aside aria-label="Molds" className={styles.browser}>
      <div className={styles.heading}>Molds</div>

      {bodies.map((body) => (
        <div className={styles.row} key={body.id}>
          <button
            aria-label={`${body.visible ? "Hide" : "Show"} ${body.name}`}
            aria-pressed={body.visible}
            className={styles.eye}
            onClick={() => setBodyVisibility(body.id, !body.visible)}
            type="button"
          >
            {body.visible
              ? <Eye aria-hidden="true" size={15} />
              : <EyeOff aria-hidden="true" size={15} />}
          </button>
          <span>{body.name}</span>
        </div>
      ))}

      <div className={styles.heading}>Model</div>

      <div className={styles.row}>
        <button
          aria-label={`${modelVisible ? "Hide" : "Show"} Model`}
          aria-pressed={modelVisible}
          className={styles.eye}
          onClick={() => onModelVisibilityChange?.(!modelVisible)}
          type="button"
        >
          {modelVisible
            ? <Eye aria-hidden="true" size={15} />
            : <EyeOff aria-hidden="true" size={15} />}
        </button>
        <span>Original</span>
      </div>
    </aside>
  );
}
