import { useState } from "react";

import toolbarStyles from "../shared/MoldToolbar.module.css";
import { useMasterMoldStore } from "./masterMold.store";
import { deriveMasterMoldUiState, hasRenderableToolingGeometry, masterMoldPieceKey, MASTER_MOLD_SCHEMA_VERSION } from "./masterMold.contracts";

/**
 * Execution 06 Article 15: the Master Mold pieces browser.
 *
 * Lists the generated Working Mold pieces and their Master Tooling pieces
 * with hide/show toggles and per-set isolation, so a user can inspect one
 * Master Tooling Set at a time. Execution 07 LOOP 08: renderable only when
 * the derived UI state has real tooling geometry to inspect -- a
 * blocked-only or failed result is never presented as generated geometry,
 * while a partial success exposes its valid pieces next to the blocked
 * diagnostics.
 */
export function MasterMoldPiecesBrowser() {
  const sets = useMasterMoldStore((s) => s.sets);
  const plan = useMasterMoldStore((s) => s.plan);
  const status = useMasterMoldStore((s) => s.status);
  const lastError = useMasterMoldStore((s) => s.lastError);
  const pieceVisibility = useMasterMoldStore((s) => s.pieceVisibility);
  const togglePieceVisibility = useMasterMoldStore((s) => s.togglePieceVisibility);
  const isolateToolingSet = useMasterMoldStore((s) => s.isolateToolingSet);
  const showAllPieces = useMasterMoldStore((s) => s.showAllPieces);
  const [open, setOpen] = useState(false);

  const uiState = deriveMasterMoldUiState({ status, sets, lastError });
  // The pieces icon exists only when renderable tooling geometry exists.
  // A blocked-only result (sets present, geometry absent) and a hard error
  // must not look like generated geometry; a partial success stays
  // inspectable with its blocked diagnostics inline.
  if (!hasRenderableToolingGeometry(sets) || uiState.kind === "blocked" || uiState.kind === "error") return null;

  const workingMoldPieceCount = plan?.moldPieces.length ?? 0;

  return (
    <div aria-label="Master Mold pieces" className={toolbarStyles.flyoutWithBanner} data-master-mold-ui-state={uiState.kind}>
      <button
        aria-expanded={open}
        aria-label="Master Mold pieces"
        className={toolbarStyles.iconButton}
        onClick={() => setOpen((value) => !value)}
        title="Master Mold pieces"
        type="button"
      >
        <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
          <path
            d="M2 4h12M2 8h12M2 12h12"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
          <circle cx="5" cy="4" r="1.4" fill="currentColor" />
          <circle cx="11" cy="8" r="1.4" fill="currentColor" />
          <circle cx="6" cy="12" r="1.4" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          aria-label="Master Mold pieces list"
          className={toolbarStyles.reopenBlockedBanner}
          role="group"
          style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 260 }}
        >
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <strong>
              Working mold: {workingMoldPieceCount} part{workingMoldPieceCount === 1 ? "" : "s"}
            </strong>
            <button aria-label="Show all Master Mold pieces" onClick={showAllPieces} type="button">
              Show all
            </button>
          </div>
          {sets.map((entry) => (
            <fieldset key={entry.moldPartId} style={{ border: "1px solid currentColor", margin: 0, padding: 4 }}>
              <legend style={{ fontSize: "0.85em" }}>
                {entry.moldPartName}
                {entry.set !== null && entry.set.assembly.pieces.length > 0 && (
                  <button
                    aria-label={`Isolate ${entry.moldPartName} tooling`}
                    onClick={() => isolateToolingSet(entry.moldPartId)}
                    style={{ marginLeft: 6 }}
                    type="button"
                  >
                    Isolate
                  </button>
                )}
              </legend>
              {(entry.set?.assembly.pieces ?? []).map((piece) => {
                // Engine piece ids are set-local: visibility keys the
                // composite (set, piece) identity (Execution 07 LOOP 10).
                const pieceKey = masterMoldPieceKey(entry.moldPartId, piece.pieceId);
                return (
                  <label key={pieceKey} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      aria-label={`Show ${piece.name}`}
                      checked={pieceVisibility[pieceKey] !== false}
                      onChange={() => togglePieceVisibility(pieceKey)}
                      type="checkbox"
                    />
                    <span data-master-mold-piece-visible={pieceVisibility[pieceKey] !== false}>
                      {piece.name}
                    </span>
                  </label>
                );
              })}
              {entry.status === "blocked" && (
                <span style={{ fontSize: "0.85em" }} data-status="blocked">
                  {entry.failureMessage ?? "tooling could not be generated"}
                </span>
              )}
            </fieldset>
          ))}
          <span style={{ fontSize: "0.75em" }}>schema v{MASTER_MOLD_SCHEMA_VERSION}</span>
        </div>
      )}
    </div>
  );
}
