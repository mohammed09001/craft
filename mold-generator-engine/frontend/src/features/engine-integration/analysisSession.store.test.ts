import { describe, expect, it } from 'vitest';

import { createMockAnalysisSessionBridge } from './analysisSession.bridge';
import {
  createInitialAnalysisSessionStoreState,
  reduceAnalysisSessionEvent,
  runMockAnalysisSessionThroughStore,
  selectAnalysisSessionStatus,
} from './analysisSession.store';

import type { AnalysisSessionBridge } from './analysisSession.bridge';

describe('analysisSession.store', () => {
  it('starts in Idle state', () => {
    const state = createInitialAnalysisSessionStoreState();

    expect(state.session).toBeNull();
    expect(state.status).toBe('Idle');
    expect(state.errorMessage).toBeNull();
    expect(selectAnalysisSessionStatus(state)).toBe('Idle');
  });

  it('moves through queued and running events', () => {
    const initialState = createInitialAnalysisSessionStoreState();

    const queuedState = reduceAnalysisSessionEvent(initialState, {
      type: 'analysis-session/queued',
    });

    const runningState = reduceAnalysisSessionEvent(queuedState, {
      type: 'analysis-session/running',
    });

    expect(queuedState.status).toBe('Queued');
    expect(runningState.status).toBe('Running');
  });

  it('stores a completed mock session', async () => {
    const state = await runMockAnalysisSessionThroughStore({
      bridge: createMockAnalysisSessionBridge(),
    });

    expect(state.status).toBe('Completed');
    expect(state.session?.state).toBe('Completed');
    expect(state.session?.reportCount).toBe(4);
    expect(state.errorMessage).toBeNull();
  });

  it('stores a completed with warnings mock session', async () => {
    const state = await runMockAnalysisSessionThroughStore({
      bridge: createMockAnalysisSessionBridge(),
      request: {
        warningAnalysisId: 'mock_draft_placeholder',
      },
    });

    expect(state.status).toBe('CompletedWithWarnings');
    expect(state.session?.issueCount).toBe(1);
    expect(state.errorMessage).toBeNull();
  });

  it('stores a failed mock session', async () => {
    const state = await runMockAnalysisSessionThroughStore({
      bridge: createMockAnalysisSessionBridge(),
      request: {
        fatalAnalysisId: 'mock_undercut_placeholder',
      },
    });

    expect(state.status).toBe('Failed');
    expect(state.session?.state).toBe('Failed');
    expect(state.errorMessage).toBe('Analysis session failed.');
  });

  it('converts bridge exceptions into failed store state', async () => {
    const failingBridge: AnalysisSessionBridge = {
      async runMockAnalysisSession() {
        throw new Error('Bridge unavailable.');
      },
    };

    const state = await runMockAnalysisSessionThroughStore({
      bridge: failingBridge,
    });

    expect(state.status).toBe('Failed');
    expect(state.session).toBeNull();
    expect(state.errorMessage).toBe('Bridge unavailable.');
  });
});
