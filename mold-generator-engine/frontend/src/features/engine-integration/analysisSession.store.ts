import {
  EMPTY_ANALYSIS_SESSION_UI_STATUS,
  getAnalysisSessionUiStatus,
} from './analysisSession.contracts';

import type {
  AnalysisSessionContract,
  AnalysisSessionUiStatus,
} from './analysisSession.contracts';
import type {
  AnalysisSessionBridge,
  RunAnalysisSessionRequest,
} from './analysisSession.bridge';

export interface AnalysisSessionStoreState {
  session: AnalysisSessionContract | null;
  status: AnalysisSessionUiStatus;
  errorMessage: string | null;
  lastEventType: AnalysisSessionEvent['type'] | null;
}

export type AnalysisSessionEvent =
  | {
      type: 'analysis-session/reset';
    }
  | {
      type: 'analysis-session/queued';
    }
  | {
      type: 'analysis-session/running';
    }
  | {
      type: 'analysis-session/completed';
      session: AnalysisSessionContract;
    }
  | {
      type: 'analysis-session/failed';
      errorMessage: string;
      session?: AnalysisSessionContract;
    }
  | {
      type: 'analysis-session/cancelled';
    };

export function createInitialAnalysisSessionStoreState(): AnalysisSessionStoreState {
  return {
    session: null,
    status: EMPTY_ANALYSIS_SESSION_UI_STATUS,
    errorMessage: null,
    lastEventType: null,
  };
}

export function reduceAnalysisSessionEvent(
  state: AnalysisSessionStoreState,
  event: AnalysisSessionEvent,
): AnalysisSessionStoreState {
  if (event.type === 'analysis-session/reset') {
    return createInitialAnalysisSessionStoreState();
  }

  if (event.type === 'analysis-session/queued') {
    return {
      ...state,
      status: 'Queued',
      errorMessage: null,
      lastEventType: event.type,
    };
  }

  if (event.type === 'analysis-session/running') {
    return {
      ...state,
      status: 'Running',
      errorMessage: null,
      lastEventType: event.type,
    };
  }

  if (event.type === 'analysis-session/completed') {
    return {
      session: event.session,
      status: getAnalysisSessionUiStatus(event.session),
      errorMessage: null,
      lastEventType: event.type,
    };
  }

  if (event.type === 'analysis-session/failed') {
    return {
      session: event.session ?? state.session,
      status: event.session ? getAnalysisSessionUiStatus(event.session) : 'Failed',
      errorMessage: event.errorMessage,
      lastEventType: event.type,
    };
  }

  return {
    ...state,
    status: 'Cancelled',
    lastEventType: event.type,
  };
}

export async function runMockAnalysisSessionThroughStore(params: {
  bridge: AnalysisSessionBridge;
  request?: RunAnalysisSessionRequest;
  initialState?: AnalysisSessionStoreState;
}): Promise<AnalysisSessionStoreState> {
  let state =
    params.initialState ?? createInitialAnalysisSessionStoreState();

  state = reduceAnalysisSessionEvent(state, {
    type: 'analysis-session/queued',
  });

  state = reduceAnalysisSessionEvent(state, {
    type: 'analysis-session/running',
  });

  try {
    const session = await params.bridge.runMockAnalysisSession(params.request);

    if (session.state === 'Failed') {
      return reduceAnalysisSessionEvent(state, {
        type: 'analysis-session/failed',
        errorMessage: 'Analysis session failed.',
        session,
      });
    }

    return reduceAnalysisSessionEvent(state, {
      type: 'analysis-session/completed',
      session,
    });
  } catch (error: unknown) {
    return reduceAnalysisSessionEvent(state, {
      type: 'analysis-session/failed',
      errorMessage:
        error instanceof Error
          ? error.message
          : 'Unknown analysis session failure.',
    });
  }
}

export function selectAnalysisSessionStatus(
  state: AnalysisSessionStoreState,
): AnalysisSessionUiStatus {
  return state.status;
}

export function selectCurrentAnalysisSession(
  state: AnalysisSessionStoreState,
): AnalysisSessionContract | null {
  return state.session;
}
