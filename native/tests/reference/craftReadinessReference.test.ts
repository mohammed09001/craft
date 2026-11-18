/**
 * Generation-readiness reference fixture generator for the native migration.
 *
 * Feeds real Python `GenerationReadinessReport.to_dict()` samples
 * (fixtures/reference/readiness-python-samples.json, written by
 * make_readiness_samples.py) plus synthetic edge cases through the real
 * `buildGenerationReadinessSnapshot` adapter and records inputs and snapshots in
 * native/tests/fixtures/reference/readiness-reference.json, which
 * native/tests/tst_reports_equivalence.cpp replays.
 *
 * Encoding: non-finite numbers are written as "NaN" / "Infinity" / "-Infinity".
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { buildGenerationReadinessSnapshot } from "@/features/mold-generation/generationReadiness.adapter";

const here = dirname(fileURLToPath(import.meta.url));
const samplesPath = process.env.CRAFT_READINESS_SAMPLES ?? resolve(here, "../fixtures/reference/readiness-python-samples.json");
const outputPath = process.env.CRAFT_READINESS_OUTPUT ?? resolve(here, "../fixtures/reference/readiness-reference.json");
const FIXED_NOW = "2026-01-02T03:04:05.678Z";

const enc = (value: unknown): unknown => {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
    return value;
  }
  if (Array.isArray(value)) return value.map(enc);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) out[key] = enc(item);
    }
    return out;
  }
  return value;
};

type Json = any;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

it("writes the generation readiness reference fixture", () => {
  const samples = JSON.parse(readFileSync(samplesPath, "utf8")) as { name: string; report: Json }[];
  const real = samples.find((s) => s.name === "closed_tetrahedron")!.report;

  const strategy = (id: string, rank: number, over: Json = {}): Json => ({
    candidate_id: id, rank, strategy_type: "single_axis", status: "candidate", score: 80 - rank, confidence: 0.7,
    pull_direction: { x: 0, y: 0, z: 1 }, generation_mode: "two_part", core_target_ids: [], warning_codes: [], blocker_codes: [], requires_manual_review: false, ...over,
  });
  const readyContract = (): Json => {
    const contract = clone(real.contract);
    contract.selected_parting_strategy_id = "s-1";
    contract.parting_strategies = [strategy("s-1", 1)];
    contract.core_cavity_readiness = { handling_required: false, decision_outcome: null, target_ids: [], confidence: 0.9, blocker_codes: [], warning_codes: [], source_references: [] };
    contract.confidence = 0.9;
    return contract;
  };
  const readyReport = (over: Json = {}): Json => ({ ...clone(real), status: "ready", warnings: [], blockers: [], contract: readyContract(), ...over });

  const cases: { name: string; input: unknown }[] = [];
  for (const s of samples) {
    cases.push({ name: `python-${s.name}`, input: s.report });
    cases.push({ name: `python-${s.name}-contract-only`, input: s.report.contract });
  }
  cases.push(
    { name: "null", input: null },
    { name: "empty-object", input: {} },
    { name: "string", input: "ready" },
    { name: "array", input: [] },
    { name: "report-with-invalid-contract", input: { status: "ready", contract: { pull_direction: {} } } },
    { name: "report-with-blank-status", input: { ...readyReport(), status: "  " } },
    { name: "ready-with-selected-strategy", input: readyReport() },
    { name: "ready-with-report-warning", input: readyReport({ warnings: [{ code: "W1", source: "chapter_3", severity: "warning", message: "Heads up." }] }) },
    { name: "ready-selected-id-not-in-strategies", input: readyReport({ contract: { ...readyContract(), selected_parting_strategy_id: "nope" } }) },
    { name: "ready-no-selection-at-all", input: readyReport({ contract: { ...readyContract(), selected_parting_strategy_id: null } }) },
    { name: "report-ready-with-warnings-no-findings", input: readyReport({ status: "ready_with_warnings" }) },
    { name: "report-blocked-no-findings", input: readyReport({ status: "blocked" }) },
    { name: "report-blocked-with-findings", input: readyReport({ status: "blocked", blockers: [{ code: "B1", source: "chapter_2", severity: "error", message: "Stop.", is_blocking: true, metadata: { a: 1 } }] }) },
    { name: "unknown-report-status", input: readyReport({ status: "weird" }) },
    { name: "invalid-findings-are-ignored", input: readyReport({ warnings: [{ code: "W", source: "s", message: "no severity" }], blockers: "nope" }) },
    { name: "no-pull-direction", input: readyReport({ contract: { ...readyContract(), pull_direction: { ...readyContract().pull_direction, direction: null, candidate_id: null } } }) },
    { name: "pull-direction-candidate-without-direction", input: readyReport({ contract: { ...readyContract(), pull_direction: { ...readyContract().pull_direction, direction: null } } }) },
    { name: "draft-unavailable", input: readyReport({ contract: { ...readyContract(), draft_orientation: { ...readyContract().draft_orientation, status: "unavailable" } } }) },
    { name: "no-parting-strategies", input: readyReport({ contract: { ...readyContract(), parting_strategies: [], selected_parting_strategy_id: null } }) },
    {
      name: "strategies-sorted-by-rank-with-codes",
      input: readyReport({
        status: "ready_with_warnings",
        contract: {
          ...readyContract(), selected_parting_strategy_id: "s-2",
          parting_strategies: [
            strategy("s-3", 3, { warning_codes: ["w-a", "w-b"], requires_manual_review: true, confidence: 0.2 }),
            strategy("s-1", 1, { blocker_codes: ["b-a"], core_target_ids: ["c1"], confidence: 0.81 }),
            strategy("s-2", 2, { confidence: 0.55, pull_direction: null }),
            strategy("s-2b", 2, { confidence: 0.549 }),
          ],
        },
      }),
    },
    {
      name: "core-cavity-with-codes",
      input: readyReport({ contract: { ...readyContract(), core_cavity_readiness: { handling_required: true, decision_outcome: "core_required", target_ids: ["t1", "t2"], confidence: 0.4, blocker_codes: ["cb"], warning_codes: ["cw1", "cw2"], source_references: ["ref-a"] } } }),
    },
    { name: "core-cavity-minimal", input: readyReport({ contract: { ...readyContract(), core_cavity_readiness: { handling_required: false, decision_outcome: null, target_ids: [], confidence: 0 } } }) },
    { name: "core-cavity-invalid-target-ids", input: readyReport({ contract: { ...readyContract(), core_cavity_readiness: { handling_required: false, decision_outcome: null, target_ids: ["", "x"], confidence: 0.5 } } }) },
    { name: "confidence-bands-high", input: readyReport({ contract: { ...readyContract(), confidence: 0.8 } }) },
    { name: "confidence-bands-medium", input: readyReport({ contract: { ...readyContract(), confidence: 0.55 } }) },
    { name: "confidence-bands-low", input: readyReport({ contract: { ...readyContract(), confidence: 0.54999 } }) },
    { name: "confidence-bands-none", input: readyReport({ contract: { ...readyContract(), confidence: 0 } }) },
    { name: "confidence-negative", input: readyReport({ contract: { ...readyContract(), confidence: -1 } }) },
    {
      name: "ratio-normalization",
      input: readyReport({ contract: { ...readyContract(), draft_orientation: { ...readyContract().draft_orientation, evaluated_surface_area_ratio: 1.7, insufficient_draft_area_ratio: -0.5, near_zero_draft_area_ratio: 0.1234567891, face_count_by_surface_type: { planar: 12, curved: 3 }, face_count_by_adequacy: { adequate: 9 } } } }),
    },
    {
      name: "undercut-indicators",
      input: readyReport({
        contract: {
          ...readyContract(),
          undercut_indicators: [
            { region_id: "r1", source: "external", face_count: 4, area_ratio: 0.25, confidence: 0.9, severity: "high", treatment_requirement: "side_action", is_blocking: true, requires_manual_review: true },
            { region_id: "r2", source: "external", face_count: 1, area_ratio: 1.4, confidence: 0.3 },
          ],
        },
      }),
    },
    { name: "undercut-indicator-invalid", input: readyReport({ contract: { ...readyContract(), undercut_indicators: [{ region_id: "", source: "x", face_count: 1, area_ratio: 0.1, confidence: 0.1 }] } }) },
    { name: "direction-with-extra-keys", input: readyReport({ contract: { ...readyContract(), pull_direction: { ...readyContract().pull_direction, direction: { x: 1, y: 0, z: 0, extra: "kept" } } } }) },
    { name: "contract-only-ready-inputs", input: readyContract() },
    { name: "warning-codes-on-pull-direction-ignored", input: readyReport({ contract: { ...readyContract(), pull_direction: { ...readyContract().pull_direction, warning_codes: ["ignored"] } } }) },
  );

  const results = cases.map((c) => ({ name: c.name, input: c.input, snapshot: buildGenerationReadinessSnapshot(c.input, { now: FIXED_NOW }) }));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(enc({ fixedNow: FIXED_NOW, cases: results }), null, 1));
  expect(results.length).toBeGreaterThan(10);
});
