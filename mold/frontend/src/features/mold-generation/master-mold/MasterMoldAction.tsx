import { useState } from "react";

import type { CanonicalPartGeometry } from "../cavity-generation/cavityGeneration.contracts";
import { MasterMoldIcon } from "../shared/MoldToolbarIcons";
import toolbarStyles from "../shared/MoldToolbar.module.css";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import { synthesizeFinalMoldTarget } from "../workflow";
import { useMasterMoldStore, type MasterMoldFinalBodyInput } from "./masterMold.store";

/**
 * Master Mold's toolbar entry -- an independent peer to Create Cavity, not
 * gated behind it (Article 02/09). If Create Cavity has already produced a
 * current committed result this reuses it directly; otherwise it synthesizes
 * the same final-mold-target geometry itself via the shared workflow seam,
 * so the user is never forced to press "Create Cavity" first.
 */
export function MasterMoldAction({
  sourcePartMesh,
}: {
  readonly sourcePartMesh?: CanonicalPartGeometry | null;
}) {
  const workflow = useSplitFaceStore((s) => s.workflow);
  const definition = useSplitFaceStore((s) => s.definition);
  const cuttingPlanes = useSplitFaceStore((s) => s.cuttingPlanes);
  const cavityClearanceMm = useSplitFaceStore((s) => s.cavity.clearanceMm);
  const qualityMode = useSplitFaceStore((s) => s.cavity.qualityMode);
  const sprueDefinitions = useSplitFaceStore((s) => s.sprueDefinitions);
  const moldDocument = useSplitFaceStore((s) => s.document);
  const lastCommittedResult = useSplitFaceStore((s) => s.lastCommittedResult);
  const segmentationRegenerationPending = useSplitFaceStore((s) => s.segmentationRegenerationCount > 0);

  const generate = useMasterMoldStore((s) => s.generate);
  const status = useMasterMoldStore((s) => s.status);
  const bodies = useMasterMoldStore((s) => s.bodies);
  const workerError = useMasterMoldStore((s) => s.lastError);

  const [preparing, setPreparing] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  if (workflow !== "partsReady") {
    return null;
  }

  const mesh = sourcePartMesh ?? null;
  const generating = status === "generating" || preparing;
  const complete = status === "current";
  const blocked = status === "blocked";
  const blockedMessages = bodies.filter((body) => body.status === "blocked").map((body) => body.failureMessage).filter((message): message is string => message !== null);
  const lastError = synthesisError ?? workerError ?? (blockedMessages.length > 0 ? blockedMessages[0]! : null);

  const handleClick = async () => {
    if (mesh === null || definition === null || generating || segmentationRegenerationPending) {
      return;
    }

    setPreparing(true);
    setSynthesisError(null);

    try {
      // `lastCommittedResult` already exists right after the cutting commit,
      // before Create Cavity has ever run (`stages.cavityResult` is null
      // then) -- that's the base "Committed Cutting Result", not a final
      // mold part, so only reuse it once it genuinely reflects cavity
      // geometry. Otherwise synthesize it directly (Article 02): Master
      // Mold must not require the user to press Create Cavity first.
      const resultIsCurrent =
        lastCommittedResult !== null &&
        lastCommittedResult.stages.cavityResult !== null &&
        lastCommittedResult.sourceRevision === moldDocument.revision &&
        lastCommittedResult.sourceFingerprint === moldDocument.fingerprint;

      const targetBodies = resultIsCurrent
        ? lastCommittedResult.bodies
        : (
            await synthesizeFinalMoldTarget({
              sourcePartMesh: mesh,
              definition,
              cuttingPlanes,
              cavityClearanceMm,
              qualityMode,
              generationVersion: moldDocument.revision,
              requestId: `master-mold-target:${moldDocument.revision}:${moldDocument.fingerprint}`,
              sourceRevision: moldDocument.revision,
              sourceFingerprint: moldDocument.fingerprint,
              sprueDefinitions,
            })
          ).bodies;

      const finalMoldBodies: MasterMoldFinalBodyInput[] = targetBodies.map((body) => ({
        id: body.id,
        name: body.name,
        mesh: body.mesh,
        bounds: body.bounds,
        volumeMm3: body.volumeMm3,
      }));

      await generate(finalMoldBodies);
    } catch (error) {
      setSynthesisError(error instanceof Error ? error.message : "Master Mold could not obtain the final-mold geometry.");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <button
      aria-label="Master Mold"
      aria-pressed={complete}
      className={`${toolbarStyles.iconButton} ${complete ? toolbarStyles.primaryButton : ""}`}
      disabled={generating || segmentationRegenerationPending || mesh === null}
      onClick={() => void handleClick()}
      title={
        generating
          ? "Generating Master Mold…"
          : blocked && lastError !== null
            ? `Master Mold: ${lastError}`
            : "Master Mold"
      }
      type="button"
    >
      <MasterMoldIcon />
    </button>
  );
}
