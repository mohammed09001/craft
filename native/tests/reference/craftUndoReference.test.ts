/**
 * Undo/redo reference fixture generator for the native migration.
 *
 * Drives the REAL split-face store through sequences of editing operations with undo and redo steps in between, and
 * records after every step what the user can observe: which planes exist (and where), the mold clearance, and how many
 * undo / redo entries there are (the history entry enterSelection() pushes is dropped first: native has no such step). Replayed by
 * tst_app_workflow.cpp against the native controller. Also recorded: what undo restores after the mold parts were
 * created and a plane was removed and rebuilt (the derived result comes back, it is not recomputed), and the 50-entry
 * cap.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { beforeEach, expect, it } from "vitest";

import type { Bounds3, PartBoundingBoxFaceId } from "@/features/mold-generation/split-face";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";

const outputPath = resolve(process.env.CRAFT_UNDO_OUTPUT ?? "undo-reference.json");
const K1: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 30, z: 30 } };

const S = () => useSplitFaceStore.getState();

type Op =
  | { op: "toggle"; face: PartBoundingBoxFaceId }
  | { op: "drag"; face: PartBoundingBoxFaceId; position: number }
  | { op: "clearance"; mm: number }
  | { op: "gesture"; values: number[] }
  | { op: "remove"; face: PartBoundingBoxFaceId }
  | { op: "visibility"; id: string; visible: boolean }
  | { op: "undo" }
  | { op: "redo" };

function observe(baseline: number) {
  const s = S();
  return {
    planes: s.cuttingPlanes.map((p) => ({ face: p.sourceFaceId, position: p.normalizedPosition })),
    clearanceMm: s.clearanceMm,
    undoDepth: s.undoStack.length - baseline,
    redoDepth: s.redoStack.length,
    // The mold bodies the user hid (bodyVisibility is part of every snapshot and a toggle is a history entry).
    hidden: Object.entries(s.bodyVisibility).filter(([, visible]) => visible === false).map(([id]) => id).sort(),
  };
}

function run(ops: Op[]) {
  S().clearForModelReplacement();
  S().enterSelection();
  // enterSelection pushes a history entry of its own (a state identical to the next one). Native has no such step, so
  // that entry is dropped: depths and the 50-entry cap then count only real edits.
  useSplitFaceStore.setState({ undoStack: [], redoStack: [] });
  const baseline = 0;
  const steps = [{ op: { op: "start" }, state: observe(baseline) }];
  for (const op of ops) {
    switch (op.op) {
      case "toggle": S().toggleFace(op.face); break;
      case "drag": S().commitPlaneDrag(`cutting-plane:${op.face}`, op.position, K1); break;
      case "clearance": S().setClearanceMm(op.mm); break;
      case "gesture":
        S().beginClearanceEdit();
        for (const v of op.values) S().updateClearanceEdit(v);
        S().commitClearanceEdit();
        break;
      case "remove": S().removeSplitFace(op.face); break;
      case "visibility": S().setBodyVisibility(op.id, op.visible); break;
      case "undo": S().undo(); break;
      case "redo": S().redo(); break;
    }
    steps.push({ op, state: observe(baseline) });
  }
  return steps;
}

beforeEach(() => {
  S().clearForModelReplacement();
});

it("records the real split-face undo/redo history", async () => {
  const sequences: Array<{ name: string; steps: ReturnType<typeof run> }> = [];

  sequences.push({
    name: "planes-positions-clearance",
    steps: run([
      { op: "toggle", face: "front" },
      { op: "toggle", face: "right" },
      { op: "drag", face: "right", position: 0.4 },
      { op: "clearance", mm: 14 },
      { op: "remove", face: "front" },
      { op: "undo" }, { op: "undo" }, { op: "undo" },
      { op: "redo" }, { op: "redo" },
      { op: "toggle", face: "top" },          // a new edit clears the redo history
      { op: "redo" },                          // nothing to redo
      { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" },
      { op: "undo" },                          // past the start: nothing to undo
    ]),
  });

  sequences.push({
    name: "unchanged-edits-add-no-entry",
    steps: run([
      { op: "toggle", face: "left" },
      { op: "drag", face: "left", position: 0.3 },
      { op: "drag", face: "left", position: 0.3 },   // same position
      { op: "clearance", mm: 12 },
      { op: "clearance", mm: 12 },                    // same clearance
      { op: "remove", face: "right" },                // not a plane
      { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" },
    ]),
  });

  sequences.push({
    name: "a-gesture-is-one-entry",
    steps: run([
      { op: "toggle", face: "top" },
      { op: "gesture", values: [12, 15, 18, 22] },
      { op: "gesture", values: [22] },                // ends where it started: no entry
      { op: "undo" },
      { op: "redo" },
      { op: "undo" }, { op: "undo" },
    ]),
  });

  sequences.push({
    name: "removing-and-re-adding-a-plane",
    steps: run([
      { op: "toggle", face: "front" },
      { op: "drag", face: "front", position: 0.6 },
      { op: "remove", face: "front" },
      { op: "toggle", face: "front" },                // back at its default position
      { op: "undo" }, { op: "undo" }, { op: "undo" },
      { op: "redo" }, { op: "redo" }, { op: "redo" },
    ]),
  });

  // Hiding and showing a mold body is recorded like any other edit and restored with undo/redo; an unchanged value is no edit. Every edit that
  // replaces the committed topology (a plane chosen, moved or removed, the clearance) shows all bodies again, and undo brings the hidden set back.
  sequences.push({
    name: "body-visibility-is-recorded",
    steps: run([
      { op: "toggle", face: "front" },
      { op: "visibility", id: "body-a", visible: false },
      { op: "visibility", id: "body-a", visible: false },   // already hidden: no entry
      { op: "visibility", id: "body-b", visible: false },
      { op: "visibility", id: "body-a", visible: true },
      { op: "undo" }, { op: "undo" },
      { op: "redo" },
      { op: "toggle", face: "right" },                       // a new edit clears the redo history
      { op: "visibility", id: "body-a", visible: false },
      { op: "drag", face: "right", position: 0.4 },
      { op: "visibility", id: "body-b", visible: false },
      { op: "clearance", mm: 14 },
      { op: "visibility", id: "body-a", visible: false },
      { op: "remove", face: "front" },
      { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" },
      { op: "redo" }, { op: "redo" },
      { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" }, { op: "undo" },
      { op: "undo" },                                        // past the start
    ]),
  });
  // The 50-entry cap: 55 edits, then undo until nothing is left.
  const capOps: Op[] = [];
  for (let i = 0; i < 55; i++) capOps.push({ op: "toggle", face: i % 2 === 0 ? "front" : "back" });
  for (let i = 0; i < 55; i++) capOps.push({ op: "undo" });
  sequences.push({ name: "history-is-capped-at-50", steps: run(capOps) });

  // The derived result comes back with undo (it is not recomputed): parts created, a plane removed and rebuilt.
  S().clearForModelReplacement();
  S().enterSelection();
  S().toggleFace("front");
  S().toggleFace("right");
  expect(await S().createMoldParts("model", K1)).toBe(true);
  const derived = [] as Array<{ step: string; planes: string[]; bodyCount: number | null; workflow: string; undoDepth: number; redoDepth: number }>;
  const rec = (step: string) => {
    const s = S();
    derived.push({ step, planes: s.cuttingPlanes.map((p) => p.sourceFaceId), bodyCount: s.definition?.moldBodies?.length ?? null, workflow: s.workflow, undoDepth: s.undoStack.length, redoDepth: s.redoStack.length });
  };
  rec("parts created");
  expect(await S().removeSplitFaceAndRebuild("right", "model", K1)).toBe(true);
  rec("right removed and rebuilt");
  S().undo();
  rec("undo");
  S().redo();
  rec("redo");
  S().undo();
  S().undo();
  rec("undo twice");

  const fixture = {
    generatedFrom: "mold/frontend/src/features/mold-generation/split-face/splitFace.store.ts (history, snap, undo, redo)",
    sequences,
    derived,
    cap: 50,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(fixture, null, 1));
  expect(sequences.length).toBe(6);
});
