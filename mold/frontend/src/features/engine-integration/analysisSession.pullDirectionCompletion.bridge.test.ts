import { describe, expect, it } from 'vitest';

import { createMockAnalysisSessionContract } from './analysisSession.bridge';

describe('Analysis Session Pull Direction Completion Bridge', () => {
  it('adds a completed pull direction result to the pull direction report metadata', () => {
    const session = createMockAnalysisSessionContract({
      requestedAnalysisIds: ['mock_pull_direction_placeholder'],
    });

    const pullDirectionReport = session.reports.find(
      (report) => report.analysisId === 'mock_pull_direction_placeholder',
    );

    expect(pullDirectionReport).toBeDefined();
    expect(pullDirectionReport?.title).toBe('Pull Direction');
    expect(pullDirectionReport?.summary).toContain('Best pull direction selected');

    const completion = pullDirectionReport?.metadata?.pullDirectionCompletion;

    expect(completion).toMatchObject({
      status: 'Good',
      confidenceScore: 88,
    });
  });
});
