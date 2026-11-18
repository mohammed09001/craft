/**
 * Engineering-reports reference fixture generator for the native migration.
 *
 * Runs the real reference registry, contracts, pull-direction completion,
 * session reports, candidate pipeline and evaluation layer on fixed inputs and
 * records inputs and outputs in native/tests/fixtures/reference/reports-reference.json,
 * which native/tests/tst_reports_equivalence.cpp replays.
 *
 * Encoding: non-finite numbers are written as the strings "NaN", "Infinity" and
 * "-Infinity" (JSON has no such numbers); `undefined` properties are omitted.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PullDirectionCard } from "@/systems/context-area/PullDirectionCard";

import { DEFAULT_ENGINEERING_REPORTS } from "@/features/engineering-reports/defaultEngineeringReports";
import {
  getEngineeringReportManifest,
  getVisibleEngineeringReportManifest,
} from "@/features/engineering-reports/engineeringReportManifest";
import { createEngineeringReportRegistry } from "@/features/engineering-reports/reportRegistry";
import { defaultEngineeringReportRegistry } from "@/features/engineering-reports/defaultReportRegistry";
import type { EngineeringReportDefinition } from "@/features/engineering-reports/reportRegistry.types";
import { completePullDirection } from "@/features/engineering-reports/pull-direction/pullDirectionCompletion";
import {
  createCompletedPullDirectionSessionReport,
  createPullDirectionSessionReport,
} from "@/features/engineering-reports/pull-direction/pullDirectionReport.session";
import { createMockPullDirectionReport } from "@/features/engineering-reports/pull-direction/pullDirectionReport.mock";
import { pullDirectionEngineeringReportDefinition } from "@/features/engineering-reports/pull-direction/pullDirectionReport.definition";
import { pullDirectionReportRegistryEntry } from "@/features/engineering-reports/pull-direction/pullDirectionReport.registry";
import { createPullDirectionAnalysisEngine } from "@/features/engineering-reports/pull-direction/pullDirectionAnalysisEngine";
import { createPullDirectionAnalysisPipeline } from "@/features/engineering-reports/pull-direction/pullDirectionAnalysisPipeline";
import { createPullDirectionAnalysisInputFromSession } from "@/features/engineering-reports/pull-direction/pullDirectionAnalysisSessionAdapter";
import type { PullDirectionCandidateDirection } from "@/features/engineering-reports/pull-direction/pullDirectionAnalysisEngine.contracts";
import {
  createPullDirectionEvaluationBundle,
  createPullDirectionEvaluationReportViewModel,
  createPullDirectionEvaluationScoreProfile,
  evaluatePullDirectionCandidates,
  validatePullDirectionEvaluationReportSnapshot,
} from "@/features/engineering-reports/pull-direction/evaluation";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = process.env.CRAFT_REPORTS_OUTPUT ?? resolve(here, "../fixtures/reference/reports-reference.json");

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

const def = (over: Partial<EngineeringReportDefinition> & { id: string; type: string }): EngineeringReportDefinition => ({
  displayName: over.id,
  description: "d",
  category: "moldability",
  displayOrder: 10,
  visible: true,
  supportStatus: "supported",
  version: "1.0.0",
  ...over,
}) as EngineeringReportDefinition;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_NOW));
});
afterAll(() => vi.useRealTimers());

it("writes the engineering reports reference fixture", () => {
  // --- registry -------------------------------------------------------------------------------------------------------------------
  const registryCases: { name: string; definitions: unknown[]; ops: Record<string, unknown>[] }[] = [
    {
      name: "ordering-visibility-lookup",
      definitions: [
        def({ id: "b-report", type: "type-b", displayName: "Beta", displayOrder: 20 }),
        def({ id: "a-report", type: "type-a", displayName: "Alpha", displayOrder: 20, icon: "arrow", metadata: { stage: "3", count: 4, flag: true, none: null } }),
        def({ id: "c-hidden", type: "type-c", displayName: "Gamma", displayOrder: 5, supportStatus: "hidden", category: "geometry" }),
        def({ id: "d-invisible", type: "type-d", displayName: "Delta", displayOrder: 1, visible: false, category: "geometry" }),
        def({ id: "e-case", type: "Type-E", displayName: "alpha", displayOrder: 20, category: "quality", supportStatus: "experimental" }),
        def({ id: "f-accent", type: "type-f", displayName: "Älpha", displayOrder: 20, category: "manufacturing", supportStatus: "deprecated" }),
        def({ id: "g-neg", type: "type-g", displayName: "Zeta", displayOrder: -3.5, category: "diagnostics", supportStatus: "coming-soon" }),
        def({ id: "h-other", type: "type-h", displayName: "Eta", displayOrder: 20, category: "other" }),
      ],
      ops: [
        { op: "discover" },
        { op: "discover", includeHidden: true },
        { op: "discover", category: "geometry" },
        { op: "discover", category: "geometry", includeHidden: true },
        { op: "getById", id: "  A-REPORT " },
        { op: "getById", id: "missing" },
        { op: "getByType", type: " TYPE-e" },
        { op: "getByType", type: "nope" },
        { op: "getByCategory", category: "moldability" },
        { op: "getByCategory", category: "moldability", includeHidden: true },
        { op: "getVisible" },
        { op: "toManifest" },
        { op: "toManifest", includeHidden: true },
        { op: "toManifest", category: "quality" },
        { op: "register", definition: def({ id: "z-new", type: "type-z", displayName: "Aardvark", displayOrder: 0 }), then: "discover" },
        { op: "register", definition: def({ id: "A-REPORT", type: "type-new" }), then: "discover" },
        { op: "register", definition: def({ id: "new-id", type: "TYPE-A" }), then: "discover" },
      ],
    },
    { name: "empty", definitions: [], ops: [{ op: "discover" }, { op: "toManifest", includeHidden: true }, { op: "getById", id: "x" }] },
    ...[
      ["empty-id", def({ id: "  ", type: "t" })],
      ["empty-type", def({ id: "i", type: "" })],
      ["empty-display-name", def({ id: "i", type: "t", displayName: " " })],
      ["empty-description", def({ id: "i", type: "t", description: "" })],
      ["empty-version", def({ id: "i", type: "t", version: "\t" })],
      ["bad-category", def({ id: "i", type: "t", category: "nonsense" as never })],
      ["bad-status", def({ id: "i", type: "t", supportStatus: "nonsense" as never })],
      ["nan-order", def({ id: "i", type: "t", displayOrder: NaN })],
      ["infinite-order", def({ id: "i", type: "t", displayOrder: Infinity })],
    ].map(([name, d]) => ({ name: `invalid-${name as string}`, definitions: [d as EngineeringReportDefinition], ops: [] as Record<string, unknown>[] })),
    { name: "duplicate-id", definitions: [def({ id: "Same", type: "t1" }), def({ id: "same", type: "t2" })], ops: [] },
    { name: "duplicate-type", definitions: [def({ id: "i1", type: "Same" }), def({ id: "i2", type: " same " })], ops: [] },
  ];

  const runRegistryCase = (c: (typeof registryCases)[number]) => {
    try {
      let registry = createEngineeringReportRegistry(c.definitions as EngineeringReportDefinition[]);
      const outputs: unknown[] = [];
      for (const op of c.ops) {
        try {
          switch (op.op) {
            case "discover": outputs.push(registry.discover({ ...(op.includeHidden !== undefined ? { includeHidden: op.includeHidden as boolean } : {}), ...(op.category !== undefined ? { category: op.category as never } : {}) })); break;
            case "getById": outputs.push(registry.getById(op.id as string) ?? null); break;
            case "getByType": outputs.push(registry.getByType(op.type as string) ?? null); break;
            case "getByCategory": outputs.push(registry.getByCategory(op.category as never, op.includeHidden !== undefined ? { includeHidden: op.includeHidden as boolean } : {})); break;
            case "getVisible": outputs.push(registry.getVisible()); break;
            case "toManifest": outputs.push(registry.toManifest({ ...(op.includeHidden !== undefined ? { includeHidden: op.includeHidden as boolean } : {}), ...(op.category !== undefined ? { category: op.category as never } : {}) })); break;
            case "register": {
              try {
                const next = registry.register(op.definition as EngineeringReportDefinition);
                outputs.push({ ok: true, list: next.discover({ includeHidden: true }) });
              } catch (error) {
                outputs.push({ ok: false, error: (error as Error).message });
              }
              break;
            }
            default: throw new Error("unknown op");
          }
        } catch (error) {
          outputs.push({ error: (error as Error).message });
        }
      }
      void registry;
      return { ok: true as const, outputs };
    } catch (error) {
      return { ok: false as const, error: (error as Error).message };
    }
  };
  const registry = {
    cases: registryCases.map((c) => ({ name: c.name, definitions: c.definitions, ops: c.ops, result: runRegistryCase(c) })),
    defaultReports: DEFAULT_ENGINEERING_REPORTS,
    manifestAll: getEngineeringReportManifest(),
    manifestVisible: getVisibleEngineeringReportManifest(),
    defaultRegistryAll: defaultEngineeringReportRegistry.toManifest({ includeHidden: true }),
    defaultRegistryVisible: defaultEngineeringReportRegistry.toManifest(),
    pullDirectionDefinition: pullDirectionEngineeringReportDefinition,
    pullDirectionRegistryEntry: (() => {
      const { createInitialReport, ...rest } = pullDirectionReportRegistryEntry;
      return { ...rest, initialReport: createInitialReport() };
    })(),
  };

  // --- completion -----------------------------------------------------------------------------------------------------------------
  type Cand = { id: string; direction: [number, number, number]; label?: string; rank?: number | null; score?: number | null; preliminaryScore?: number | null; engineeringScore?: number | null; isValid?: boolean; isFilteredOut?: boolean; warnings?: string[] };
  const z = (id: string, over: Partial<Cand> = {}): Cand => ({ id, direction: [0, 0, 1], ...over });
  const completionCases: { name: string; candidates: Cand[] }[] = [
    { name: "empty", candidates: [] },
    { name: "mvp-sample", candidates: [z("pull-positive-z", { label: "+Z", rank: 1, score: 88 }), z("pull-positive-x", { direction: [1, 0, 0], rank: 2, score: 71 }), z("pull-positive-y", { direction: [0, 1, 0], rank: 3, score: 52, warnings: ["Low confidence candidate."] })] },
    { name: "close-runner-up", candidates: [z("a", { rank: 1, score: 90 }), z("b", { rank: 2, score: 85 })] },
    { name: "review-band", candidates: [z("a", { rank: 1, score: 60 })] },
    { name: "poor-band", candidates: [z("a", { rank: 1, score: 30 })] },
    { name: "fraction-scores", candidates: [z("a", { rank: 1, score: 0.9 }), z("b", { rank: 2, score: 0.5 })] },
    { name: "one-is-fraction-edge", candidates: [z("a", { score: 1 }), z("b", { score: 1.0001 })] },
    { name: "rank-ties-sorted-by-score", candidates: [z("a", { rank: 1, score: 40 }), z("b", { rank: 1, score: 95 }), z("c", { rank: 1, score: 95 })] },
    { name: "null-ranks-fallback-to-score", candidates: [z("a", { rank: null, score: 55 }), z("b", { score: 99 }), z("c", { rank: 2, score: 10 })] },
    { name: "score-fallback-chain", candidates: [z("a", { rank: 1, score: null, preliminaryScore: 70 }), z("b", { rank: 2, engineeringScore: 99 }), z("c", { rank: 3 })] },
    { name: "invalid-and-filtered", candidates: [z("bad", { rank: 1, score: 99, isValid: false }), z("filtered", { rank: 2, score: 98, isFilteredOut: true }), z("good", { rank: 3, score: 83, isValid: true, isFilteredOut: false })] },
    { name: "all-unselectable", candidates: [z("a", { isValid: false }), z("b", { isFilteredOut: true })] },
    { name: "non-finite-scores", candidates: [z("a", { rank: 1, score: NaN }), z("b", { rank: 2, score: Infinity })] },
    { name: "above-100", candidates: [z("a", { rank: 1, score: 250 }), z("b", { rank: 2, score: -4 })] },
    { name: "rounding", candidates: [z("a", { rank: 1, score: 82.5 }), z("b", { rank: 2, score: 74.5 })] },
    { name: "warning-dedupe", candidates: [z("a", { rank: 1, score: 50, warnings: ["  x ", "x", "", "  ", "y"] }), z("b", { rank: 2, score: 49 })] },
    { name: "single-high", candidates: [z("a", { rank: 1, score: 100 })] },
  ];
  const completion = completionCases.map((c) => ({ name: c.name, candidates: c.candidates, result: completePullDirection(c.candidates) }));

  // --- session reports ------------------------------------------------------------------------------------------------------------
  const sessionInputs = [
    { analysisSessionId: "s1", modelId: "m1" },
    { analysisSessionId: "s2", modelId: null, status: "ready", source: "engine", coordinateSystem: "world", units: "cm" },
    { analysisSessionId: "context-panel-preview", modelId: null, source: "frontend", coordinateSystem: "model", units: "mm" },
    { analysisSessionId: "s4", modelId: "m4", status: "failed", source: "import_pipeline", units: "inch" },
  ];
  const sessions = {
    mock: createMockPullDirectionReport(),
    cases: sessionInputs.map((input) => ({
      input,
      waiting: createPullDirectionSessionReport(input as never),
      completed: createCompletedPullDirectionSessionReport(input as never),
    })),
  };

  // --- analysis foundation --------------------------------------------------------------------------------------------------------
  const analysisInputs = [
    { sessionId: "sess-1", modelId: "model-1", fileName: "part.stl", unit: "mm", geometry: { any: 1 } },
    { modelId: "model-2" },
    { sessionId: "sess-3", modelId: "model-3", source: "engine-bridge", requestedAt: "2026-02-03T00:00:00.000Z", metadata: { k: "v" } },
    { modelId: "model-4", source: "test", geometry: 0 },
  ];
  const analysis = analysisInputs.map((input) => {
    const engineInput = createPullDirectionAnalysisInputFromSession(input as never);
    const result = createPullDirectionAnalysisEngine({ clock: () => FIXED_NOW }).execute(engineInput);
    return { input, result };
  });

  const customGenerator = (candidates: PullDirectionCandidateDirection[]) => ({
    generate: () => ({ strategy: "canonical-axis-seed" as const, candidates, inspectedMesh: false as const, inspectedFaceNormals: false as const, computedScores: false as const, selectedBestDirection: false as const }),
  });
  const mk = (id: string, x: number, y: number, z2: number): PullDirectionCandidateDirection => ({ id, label: id, vector: { x, y, z: z2 }, source: "canonical-axis-seed", strategy: "canonical-axis-seed", coordinateSystem: "model-space", requiresGeometryInspection: false, score: null, rank: null });
  const pipelineCases: { name: string; candidates: PullDirectionCandidateDirection[] }[] = [
    { name: "canonical", candidates: [mk("px", 1, 0, 0), mk("nx", -1, 0, 0), mk("py", 0, 1, 0)] },
    { name: "non-finite-and-zero", candidates: [mk("nan", NaN, 0, 1), mk("inf", Infinity, 0, 0), mk("zero", 0, 0, 0), mk("tiny", 1e-10, 0, 0), mk("ok", 3, 4, 0)] },
    { name: "duplicates", candidates: [mk("a", 0, 0, 2), mk("b", 0, 0, 5), mk("c", 0, 0, -1), mk("d", 1e-7, 0, 1), mk("e", 1e-8, 0, 1), mk("f", 0.6, 0.8, 0)] },
    { name: "empty", candidates: [] },
  ];
  const pipelines = pipelineCases.map((c) => {
    const out = createPullDirectionAnalysisPipeline({ candidateGenerator: customGenerator(c.candidates) }).execute({ model: { modelId: "m" }, source: "test" });
    return { name: c.name, candidates: c.candidates, output: out };
  });

  // --- evaluation -----------------------------------------------------------------------------------------------------------------
  type Ranked = Record<string, unknown>;
  const dir = (x: number, y: number, z2: number) => ({ x, y, z: z2 });
  const rankedCases: { name: string; rankedCandidates: Ranked[]; scoreProfile?: Record<string, unknown> }[] = [
    { name: "mvp-sample", rankedCandidates: [{ id: "pull-positive-z", direction: dir(0, 0, 1), rank: 1, score: 88 }, { id: "pull-positive-x", direction: dir(1, 0, 0), rank: 2, score: 71 }, { id: "pull-positive-y", direction: dir(0, 1, 0), rank: 3, score: 52 }] },
    { name: "confidence-and-priority", rankedCandidates: [{ id: "a", direction: dir(0, 0, 3), confidence: 0.9, sourcePriority: 1 }, { id: "b", direction: dir(0, 4, 3), confidence: 0.4, sourcePriority: 0.2 }] },
    { name: "aliases-and-missing-direction", rankedCandidates: [{ candidateId: "alias-id", vector: dir(1, 1, 0), valid: true }, { id: "pd", pullDirection: dir(0, -2, 0), isValid: true, confidence: 0.8 }, { id: "nodir", direction: null }, { id: "partial", direction: { x: 1, y: 2 } }] },
    { name: "non-finite-and-zero", rankedCandidates: [{ id: "nan", direction: dir(NaN, 0, 1), confidence: 0.9 }, { id: "inf", direction: dir(Infinity, 0, 0) }, { id: "zero", direction: dir(0, 0, 0), confidence: 1 }, { id: "tiny", direction: dir(1e-10, 0, 0), confidence: 1 }] },
    { name: "invalid-flags", rankedCandidates: [{ id: "bad", direction: dir(0, 0, 1), isValid: false, confidence: 1 }, { id: "bad2", direction: dir(0, 0, 1), valid: false }, { id: "good", direction: dir(1, 0, 0), isValid: true, valid: false }] },
    { name: "clamping", rankedCandidates: [{ id: "hi", direction: dir(0, 0, 1), confidence: 1.7, sourcePriority: 3 }, { id: "lo", direction: dir(0, 0, 1), confidence: -2, sourcePriority: -1 }, { id: "big-score", direction: dir(1, 0, 0), score: 250 }, { id: "frac-score", direction: dir(0, 1, 0), score: 0.4 }] },
    { name: "ties-and-blank-ids", rankedCandidates: [{ id: "b", direction: dir(0, 0, 1), confidence: 0.5, sourcePriority: 0 }, { id: "a", direction: dir(0, 0, 1), confidence: 0.5, sourcePriority: 0 }, { id: "  ", direction: dir(1, 0, 0), confidence: 0.5, sourcePriority: 0 }, { id: " trimmed ", direction: dir(0, 1, 0), confidence: 0.5, sourcePriority: 0 }, { id: "B", direction: dir(0, 0, 1), confidence: 0.5, sourcePriority: 0 }] },
    { name: "empty", rankedCandidates: [] },
    { name: "all-rejected", rankedCandidates: [{ id: "a", direction: dir(0, 0, 0) }, { id: "b", direction: null }] },
    { name: "weak-best", rankedCandidates: [{ id: "w", direction: dir(0, 0, 1), confidence: 0, sourcePriority: 0 }] },
    { name: "rank-fallbacks", rankedCandidates: [{ id: "r0", direction: dir(0, 0, 1), rank: 0 }, { id: "rneg", direction: dir(1, 0, 0), rank: -2 }, { id: "r3", direction: dir(0, 1, 0), rank: 3 }, { id: "rnan", direction: dir(0, -1, 0), rank: NaN }] },
    { name: "single", rankedCandidates: [{ id: "only", direction: dir(0, 0, 1), confidence: 1, sourcePriority: 1 }] },
    {
      name: "custom-profile",
      rankedCandidates: [{ id: "a", direction: dir(0, 0, 1), confidence: 0.9, sourcePriority: 0.5 }, { id: "b", direction: dir(1, 0, 0), confidence: 0.3 }, { id: "c", direction: dir(0, 0, 0) }],
      scoreProfile: { minScore: 5, maxScore: 90, minVectorLength: 0.5, defaultConfidence: 0.25, precisionDecimals: 1, thresholds: { recommended: 70, usable: 50, weak: 20 }, weights: { baseScore: 30, confidenceContribution: 40, sourcePriorityContribution: 20 } },
    },
    {
      name: "partial-profile-with-bad-fields",
      rankedCandidates: [{ id: "a", direction: dir(0, 0, 1), confidence: 0.77 }, { id: "b", direction: dir(0.1, 0, 0), confidence: 0.2 }],
      scoreProfile: { precisionDecimals: 0, thresholds: { usable: 60 }, weights: { baseScore: NaN, confidenceContribution: 50 }, minScore: Infinity },
    },
  ];
  const profileInputs: Record<string, unknown>[] = [{}, { minScore: 1, maxScore: 50 }, { thresholds: { weak: 10 }, weights: { sourcePriorityContribution: 99 } }, { precisionDecimals: -3 }, { maxScore: NaN, defaultConfidence: "x" }];
  const evaluation = {
    profiles: profileInputs.map((input) => ({ input, profile: createPullDirectionEvaluationScoreProfile(input as never) })),
    cases: rankedCases.map((c) => {
      const profile = c.scoreProfile === undefined ? undefined : createPullDirectionEvaluationScoreProfile(c.scoreProfile as never);
      const bundle = createPullDirectionEvaluationBundle({ rankedCandidates: c.rankedCandidates as never, ...(profile === undefined ? {} : { scoreProfile: profile }) });
      const viewModel = createPullDirectionEvaluationReportViewModel({ report: { rankedCandidates: c.rankedCandidates as never }, ...(profile === undefined ? {} : { scoreProfile: profile }) });
      const direct = evaluatePullDirectionCandidates(
        { candidates: c.rankedCandidates.map((r, index) => ({ id: typeof r.id === "string" ? r.id : `c${index}`, direction: (r.direction as never) ?? dir(0, 0, 0), ...(r.isValid !== undefined ? { isValid: r.isValid as boolean } : {}), ...(r.confidence !== undefined ? { confidence: r.confidence as number } : {}), ...(r.sourcePriority !== undefined ? { sourcePriority: r.sourcePriority as number } : {}) })) },
        profile === undefined ? {} : { scoreProfile: profile },
      );
      return { name: c.name, rankedCandidates: c.rankedCandidates, scoreProfileInput: c.scoreProfile ?? null, bundle, viewModel, direct };
    }),
    nullReport: createPullDirectionEvaluationReportViewModel({ report: null }),
  };

  // Snapshot validation on crafted (valid-shape, bad-value) snapshots.
  const baseSnapshot = createPullDirectionEvaluationBundle({ rankedCandidates: [{ id: "a", direction: dir(0, 0, 1), confidence: 0.9 }] as never }).snapshot;
  const clone = () => JSON.parse(JSON.stringify(baseSnapshot)) as Record<string, any>;
  const bad: { name: string; snapshot: Record<string, any> }[] = [{ name: "valid", snapshot: clone() }];
  { const s = clone(); s.summary.totalCandidates = -1; s.summary.recommendedCandidates = 1.5; bad.push({ name: "bad-counts", snapshot: s }); }
  { const s = clone(); s.summary.decisionCounts.usable = 4; bad.push({ name: "counts-not-summing", snapshot: s }); }
  { const s = clone(); s.bestCandidate.candidateId = "  "; s.bestCandidate.score = "NaN"; s.bestCandidate.normalizedDirection = { x: "NaN", y: 0, z: 1 }; bad.push({ name: "bad-best", snapshot: s }); }
  { const s = clone(); s.evaluations[0].candidateId = ""; s.evaluations[0].originalDirection.z = "Infinity"; s.evaluations[0].vectorLength = "NaN"; s.evaluations[0].score = "NaN"; bad.push({ name: "bad-evaluation", snapshot: s }); }
  { const s = clone(); s.bestCandidate = null; s.summary.bestCandidateScore = "Infinity"; bad.push({ name: "bad-summary-score", snapshot: s }); }
  const decode = (v: any): any => (v === "NaN" ? NaN : v === "Infinity" ? Infinity : v === "-Infinity" ? -Infinity : Array.isArray(v) ? v.map(decode) : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)])) : v);
  const snapshotValidation = bad.map((b) => ({ name: b.name, snapshot: b.snapshot, result: validatePullDirectionEvaluationReportSnapshot(decode(b.snapshot)) }));

  // --- context-panel card (real React component rendered to static markup) -----------------------------------------------
  const completedBase = createCompletedPullDirectionSessionReport({ analysisSessionId: "card", modelId: null, source: "frontend", coordinateSystem: "model", units: "mm" });
  const withBest = (direction: { x: number; y: number; z: number }, over: Record<string, unknown>) => ({
    ...completedBase,
    bestCandidate: { ...completedBase.bestCandidate!, direction: { ...direction, normalized: true }, ...over },
  });
  const cardReports: { name: string; report: unknown }[] = [
    { name: "null-report", report: null },
    { name: "mock-not-analyzed", report: createMockPullDirectionReport() },
    { name: "waiting", report: createPullDirectionSessionReport({ analysisSessionId: "w", modelId: null }) },
    { name: "completed-sample", report: completedBase },
    { name: "failed-no-best", report: { ...completedBase, status: "failed", bestCandidate: null } },
    { name: "completed-no-best", report: { ...completedBase, bestCandidate: null, statistics: { ...completedBase.statistics, evaluatedDirectionsCount: 0 } } },
    { name: "oblique-good", report: withBest({ x: 0.6, y: 0.8, z: 0 }, { confidence: 0.9, quality: "good" }) },
    { name: "axis-negative-x-acceptable", report: withBest({ x: -1, y: 0, z: 0 }, { confidence: 0.6, quality: "acceptable" }) },
    { name: "percent-scale-confidence", report: withBest({ x: 0, y: 0, z: 1 }, { confidence: 70, quality: "poor" }) },
    { name: "null-confidence-warning-state", report: withBest({ x: 0, y: 1, z: 0 }, { confidence: null, quality: "unknown", validation: { state: "warning", messages: [] } }) },
    { name: "low-confidence-poor", report: withBest({ x: 0, y: 0, z: -1 }, { confidence: 0.3, quality: "poor" }) },
    { name: "near-axis-tolerance", report: withBest({ x: 0.05, y: -0.1, z: 0.95 }, { confidence: 0.85, quality: "poor" }) },
    { name: "just-outside-axis", report: withBest({ x: 0.2, y: 0, z: 0.89 }, { confidence: 0.85, quality: "poor" }) },
    { name: "non-finite-component", report: withBest({ x: Number.NaN, y: 0.3333333, z: 2 }, { confidence: 0.5, quality: "excellent" }) },
    { name: "tie-axis-dominant-first", report: withBest({ x: 0.7071, y: 0.7071, z: 0 }, { confidence: 0.99, quality: "good" }) },
    { name: "warnings", report: { ...completedBase, warnings: [{ code: "A", message: "First warning", severity: "warning" }, { code: "B", message: "Second warning", severity: "info" }] } },
  ];
  const cards = cardReports.map((c) => ({ name: c.name, report: c.report, markup: renderToStaticMarkup(createElement(PullDirectionCard, { report: c.report as never })) }));

  const fixture = { cards, generatedFrom: "mold/frontend/src/features/engineering-reports", fixedNow: FIXED_NOW, registry, completion, sessions, analysis, pipelines, evaluation, snapshotValidation };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(enc(fixture), null, 1));
  expect(registry.cases.length).toBeGreaterThan(0);
});
