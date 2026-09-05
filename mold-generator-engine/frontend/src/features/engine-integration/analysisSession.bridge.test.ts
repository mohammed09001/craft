import { describe, expect, it } from 'vitest';

import {
  createMockAnalysisSessionBridge,
  createMockAnalysisSessionContract,
} from './analysisSession.bridge';

describe('analysisSession.bridge', () => {
  it('creates a completed mock analysis session contract', () => {
    const session = createMockAnalysisSessionContract();

    expect(session.sessionId).toBeTruthy();
    expect(session.state).toBe('Completed');
    expect(session.currentAnalysisId).toBeNull();
    expect(session.queuedAnalysisIds).toEqual([
      'mock_pull_direction_placeholder',
      'mock_draft_placeholder',
      'mock_undercut_placeholder',
      'mock_parting_placeholder',
    ]);
    expect(session.executedAnalysisIds).toEqual(session.queuedAnalysisIds);
    expect(session.reportCount).toBe(4);
    expect(session.issueCount).toBe(0);
    expect(session.reports).toHaveLength(4);
  });

  it('creates a completed with warnings mock session', () => {
    const session = createMockAnalysisSessionContract({
      warningAnalysisId: 'mock_draft_placeholder',
    });

    expect(session.state).toBe('CompletedWithWarnings');
    expect(session.reportCount).toBe(4);
    expect(session.issueCount).toBe(1);
    expect(session.issues[0]).toMatchObject({
      severity: 'warning',
      analysisId: 'mock_draft_placeholder',
    });
  });

  it('creates a failed mock session and stops after the fatal analysis', () => {
    const session = createMockAnalysisSessionContract({
      fatalAnalysisId: 'mock_undercut_placeholder',
    });

    expect(session.state).toBe('Failed');
    expect(session.executedAnalysisIds).toEqual([
      'mock_pull_direction_placeholder',
      'mock_draft_placeholder',
      'mock_undercut_placeholder',
    ]);
    expect(session.reportCount).toBe(3);
    expect(session.issueCount).toBe(1);
    expect(session.issues[0]).toMatchObject({
      severity: 'fatal',
      analysisId: 'mock_undercut_placeholder',
    });
  });

  it('runs through the mock bridge', async () => {
    const bridge = createMockAnalysisSessionBridge();

    const session = await bridge.runMockAnalysisSession();

    expect(session.state).toBe('Completed');
    expect(session.reportCount).toBe(4);
  });
});
