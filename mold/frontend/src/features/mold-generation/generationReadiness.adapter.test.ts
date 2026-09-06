import { describe, expect, it } from 'vitest';

import { buildGenerationReadinessSnapshot } from './generationReadiness.adapter';
import type {
  Chapter9GenerationContract,
  Chapter9GenerationReadinessReport,
} from './generationReadiness.contracts';

const NOW = '2026-07-08T00:00:00.000Z';

const keysOf = <T extends { readonly key: string }>(items: readonly T[]) =>
  items.map((item) => item.key);

const buildContract = (
  overrides: Partial<Chapter9GenerationContract> = {},
): Chapter9GenerationContract => ({
  pull_direction: {
    status: 'selected',
    candidate_id: 'axis:+z',
    direction: { x: 0, y: 0, z: 1 },
    decisiveness: 'clear',
    score: 92,
    confidence: 0.92,
  },
  draft_orientation: {
    status: 'completed',
    evaluated_surface_area_ratio: 1,
    insufficient_draft_area_ratio: 0.04,
    near_zero_draft_area_ratio: 0.02,
    face_count_by_surface_type: {
      drafted: 12,
      pull_facing: 2,
    },
    face_count_by_adequacy: {
      sufficient: 12,
      insufficient: 1,
    },
  },
  undercut_indicators: [
    {
      region_id: 'undercut-region-0001',
      source: 'undercut_risk_assessment',
      face_count: 3,
      area_ratio: 0.08,
      confidence: 0.73,
      severity: 'medium',
      treatment_requirement: 'local_parting_review_required',
      requires_manual_review: true,
    },
  ],
  parting_strategies: [
    {
      candidate_id: 'parting-strategy-0001-simple-two-part',
      rank: 1,
      strategy_type: 'simple_two_part_planar',
      status: 'acceptable',
      score: 86,
      confidence: 0.85,
      pull_direction: { x: 0, y: 0, z: 1 },
      generation_mode: 'simple_two_part_candidate',
    },
    {
      candidate_id: 'parting-strategy-0002-core-assisted',
      rank: 2,
      strategy_type: 'core_assisted_planar',
      status: 'manual_review_required',
      score: 78,
      confidence: 0.68,
      pull_direction: { x: 0, y: 0, z: 1 },
      generation_mode: 'core_assisted_candidate',
      core_target_ids: ['target-a'],
      requires_manual_review: true,
    },
  ],
  core_cavity_readiness: {
    handling_required: true,
    decision_outcome: 'preliminary_linear_core_candidate',
    target_ids: ['target-a'],
    confidence: 0.7,
    source_references: ['cavity_analysis_decision'],
  },
  selected_parting_strategy_id: 'parting-strategy-0001-simple-two-part',
  confidence: 0.82,
  ...overrides,
});

const buildReport = (
  contract: Chapter9GenerationContract,
  overrides: Partial<Chapter9GenerationReadinessReport> = {},
): Chapter9GenerationReadinessReport => ({
  status: 'ready',
  summary: 'Chapter 9 generation readiness completed for Chapter 10 hand-off.',
  chapter_2_status: 'ready',
  chapter_3_status: 'completed',
  chapter_4_status: 'completed',
  contract,
  blockers: [],
  warnings: [],
  schema_version: '1.0',
  ...overrides,
});

describe('buildGenerationReadinessSnapshot', () => {
  it('returns unavailable when the Chapter 9 generation contract is missing', () => {
    const snapshot = buildGenerationReadinessSnapshot(undefined, {
      now: NOW,
    });

    expect(snapshot.status).toBe('unavailable');
    expect(snapshot.readiness).toBe('unavailable');
    expect(snapshot.canGenerate).toBe(false);
    expect(snapshot.requiresManualReview).toBe(false);
    expect(snapshot.confidence).toBe('none');
    expect(snapshot.generatedAt).toBe(NOW);
    expect(snapshot.pullDirection).toBeNull();
    expect(snapshot.partingStrategies).toHaveLength(0);

    expect(keysOf(snapshot.missingInputs)).toEqual([
      'chapter9_generation_contract',
    ]);
    expect(snapshot.reasonCodes).toEqual(
      expect.arrayContaining([
        'chapter9_generation_contract_missing',
        'blocked_by_missing_required_inputs',
      ]),
    );
  });

  it('maps the final Chapter 9 report into a generation readiness snapshot', () => {
    const snapshot = buildGenerationReadinessSnapshot(
      buildReport(buildContract()),
      { now: NOW },
    );

    expect(snapshot.status).toBe('ready');
    expect(snapshot.readiness).toBe('sufficient');
    expect(snapshot.canGenerate).toBe(true);
    expect(snapshot.requiresManualReview).toBe(true);
    expect(snapshot.confidence).toBe('high');
    expect(snapshot.chapter9DependencyLevel).toBe('generation_ready');
    expect(snapshot.blockers).toHaveLength(0);

    expect(snapshot.pullDirection?.candidateId).toBe('axis:+z');
    expect(snapshot.draftOrientation?.insufficientDraftAreaRatio).toBe(0.04);
    expect(snapshot.undercutIndicators[0]?.regionId).toBe(
      'undercut-region-0001',
    );
    expect(snapshot.partingStrategies.map((item) => item.candidateId)).toEqual([
      'parting-strategy-0001-simple-two-part',
      'parting-strategy-0002-core-assisted',
    ]);
    expect(snapshot.coreCavityReadiness?.targetIds).toEqual(['target-a']);
    expect(snapshot.selectedPartingStrategyId).toBe(
      'parting-strategy-0001-simple-two-part',
    );
    expect(snapshot.reasonCodes).toContain('ready_for_initial_generation_boundary');
  });

  it('accepts the Chapter9GenerationContract directly', () => {
    const snapshot = buildGenerationReadinessSnapshot(buildContract(), {
      now: NOW,
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.canGenerate).toBe(true);
    expect(snapshot.availableInputs.map((input) => input.key)).toEqual(
      expect.arrayContaining([
        'chapter9_generation_contract',
        'pull_direction',
        'draft_orientation',
        'parting_strategies',
        'core_cavity_readiness',
      ]),
    );
  });

  it('preserves ranked multiple parting strategies without selecting one when absent', () => {
    const contract = buildContract({
      selected_parting_strategy_id: null,
      confidence: 0.48,
    });

    const snapshot = buildGenerationReadinessSnapshot(
      buildReport(contract, { status: 'ready_with_warnings' }),
      { now: NOW },
    );

    expect(snapshot.status).toBe('blocked');
    expect(snapshot.canGenerate).toBe(false);
    expect(snapshot.requiresManualReview).toBe(true);
    expect(snapshot.confidence).toBe('low');
    expect(snapshot.partingStrategies).toHaveLength(2);
    expect(snapshot.reasonCodes).toContain('selected_parting_strategy_missing');
    expect(snapshot.reasonCodes).toContain('low_confidence');
  });

  it('maps Chapter 9 blockers and warnings from the final report', () => {
    const snapshot = buildGenerationReadinessSnapshot(
      buildReport(buildContract(), {
        status: 'blocked',
        blockers: [
          {
            code: 'parting_strategy_unavailable',
            source: 'generation_readiness',
            severity: 'error',
            message: 'No parting strategy candidate is available.',
            is_blocking: true,
          },
        ],
        warnings: [
          {
            code: 'clearance_not_evaluated',
            source: 'generation_readiness',
            severity: 'warning',
            message: 'Core clearance was not evaluated.',
          },
        ],
      }),
      { now: NOW },
    );

    expect(snapshot.status).toBe('blocked');
    expect(snapshot.canGenerate).toBe(false);
    expect(snapshot.blockers.map((item) => item.code)).toContain(
      'parting_strategy_unavailable',
    );
    expect(snapshot.warnings.map((item) => item.code)).toContain(
      'clearance_not_evaluated',
    );
    expect(snapshot.reasonCodes).toContain('blocked_by_chapter9');
  });
});
