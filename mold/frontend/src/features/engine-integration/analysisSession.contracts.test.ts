import { describe, expect, it } from 'vitest';

import {
  EMPTY_ANALYSIS_SESSION_UI_STATUS,
  getAnalysisSessionUiStatus,
  hasAnalysisSessionFailed,
  hasAnalysisSessionWarnings,
  isTerminalAnalysisSessionStatus,
} from './analysisSession.contracts';

import type { AnalysisSessionContract } from './analysisSession.contracts';

const completedSession: AnalysisSessionContract = {
  sessionId: 'session-1',
  state: 'Completed',
  createdAt: '2026-07-06T00:00:00+00:00',
  startedAt: '2026-07-06T00:00:01+00:00',
  endedAt: '2026-07-06T00:00:02+00:00',
  currentAnalysisId: null,
  queuedAnalysisIds: [
    'mock_pull_direction_placeholder',
    'mock_draft_placeholder',
  ],
  executedAnalysisIds: [
    'mock_pull_direction_placeholder',
    'mock_draft_placeholder',
  ],
  reportCount: 2,
  issueCount: 0,
  reports: [
    {
      reportId: 'session-1:mock_pull_direction_placeholder',
      analysisId: 'mock_pull_direction_placeholder',
      title: 'Mock Pull Direction Placeholder',
      status: 'ok',
      summary: 'Mock analysis completed successfully.',
      issues: [],
      metadata: {
        mock: true,
      },
    },
  ],
  issues: [],
};

describe('analysisSession.contracts', () => {
  it('returns Idle when no session exists yet', () => {
    expect(EMPTY_ANALYSIS_SESSION_UI_STATUS).toBe('Idle');
    expect(getAnalysisSessionUiStatus(null)).toBe('Idle');
    expect(getAnalysisSessionUiStatus(undefined)).toBe('Idle');
  });

  it('returns the session state when a session exists', () => {
    expect(getAnalysisSessionUiStatus(completedSession)).toBe('Completed');
  });

  it('knows terminal session states', () => {
    expect(isTerminalAnalysisSessionStatus('Idle')).toBe(false);
    expect(isTerminalAnalysisSessionStatus('Created')).toBe(false);
    expect(isTerminalAnalysisSessionStatus('Queued')).toBe(false);
    expect(isTerminalAnalysisSessionStatus('Running')).toBe(false);
    expect(isTerminalAnalysisSessionStatus('Completed')).toBe(true);
    expect(isTerminalAnalysisSessionStatus('CompletedWithWarnings')).toBe(true);
    expect(isTerminalAnalysisSessionStatus('Failed')).toBe(true);
    expect(isTerminalAnalysisSessionStatus('Cancelled')).toBe(true);
  });

  it('detects warning sessions', () => {
    const warningSession: AnalysisSessionContract = {
      ...completedSession,
      state: 'CompletedWithWarnings',
      issueCount: 1,
      issues: [
        {
          severity: 'warning',
          code: 'MOCK_WARNING',
          message: 'Mock warning.',
          analysisId: 'mock_draft_placeholder',
        },
      ],
    };

    expect(hasAnalysisSessionWarnings(completedSession)).toBe(false);
    expect(hasAnalysisSessionWarnings(warningSession)).toBe(true);
  });

  it('detects failed sessions', () => {
    const failedSession: AnalysisSessionContract = {
      ...completedSession,
      state: 'Failed',
      issueCount: 1,
      reports: [
        {
          reportId: 'session-1:mock_undercut_placeholder',
          analysisId: 'mock_undercut_placeholder',
          title: 'Mock Undercut Placeholder',
          status: 'failed',
          summary: 'Mock analysis failed.',
          issues: [
            {
              severity: 'fatal',
              code: 'MOCK_FATAL',
              message: 'Mock fatal error.',
              analysisId: 'mock_undercut_placeholder',
            },
          ],
          metadata: {
            mock: true,
          },
        },
      ],
      issues: [
        {
          severity: 'fatal',
          code: 'MOCK_FATAL',
          message: 'Mock fatal error.',
          analysisId: 'mock_undercut_placeholder',
        },
      ],
    };

    expect(hasAnalysisSessionFailed(completedSession)).toBe(false);
    expect(hasAnalysisSessionFailed(failedSession)).toBe(true);
  });
});
