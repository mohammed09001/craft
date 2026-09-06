export const ANALYSIS_SESSION_STATES = [
  'Created',
  'Queued',
  'Running',
  'Completed',
  'CompletedWithWarnings',
  'Failed',
  'Cancelled',
] as const;

export type AnalysisSessionState = (typeof ANALYSIS_SESSION_STATES)[number];

export type AnalysisIssueSeverity = 'warning' | 'fatal';

export type AnalysisReportStatus = 'ok' | 'warning' | 'failed';

export type AnalysisSessionUiStatus = 'Idle' | AnalysisSessionState;

export interface AnalysisIssueContract {
  severity: AnalysisIssueSeverity;
  code: string;
  message: string;
  analysisId: string | null;
}

export interface AnalysisReportContract {
  reportId: string;
  analysisId: string;
  title: string;
  status: AnalysisReportStatus;
  summary: string;
  issues: AnalysisIssueContract[];
  metadata: Record<string, unknown>;
}

export interface AnalysisSessionContract {
  sessionId: string;
  state: AnalysisSessionState;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  currentAnalysisId: string | null;
  queuedAnalysisIds: string[];
  executedAnalysisIds: string[];
  reportCount: number;
  issueCount: number;
  reports: AnalysisReportContract[];
  issues: AnalysisIssueContract[];
}

export const EMPTY_ANALYSIS_SESSION_UI_STATUS: AnalysisSessionUiStatus = 'Idle';

export function getAnalysisSessionUiStatus(
  session: AnalysisSessionContract | null | undefined,
): AnalysisSessionUiStatus {
  return session?.state ?? EMPTY_ANALYSIS_SESSION_UI_STATUS;
}

export function isTerminalAnalysisSessionStatus(
  status: AnalysisSessionUiStatus,
): boolean {
  return (
    status === 'Completed' ||
    status === 'CompletedWithWarnings' ||
    status === 'Failed' ||
    status === 'Cancelled'
  );
}

export function hasAnalysisSessionWarnings(
  session: AnalysisSessionContract | null | undefined,
): boolean {
  return (
    session?.state === 'CompletedWithWarnings' ||
    session?.issues.some((issue) => issue.severity === 'warning') === true ||
    session?.reports.some((report) => report.status === 'warning') === true
  );
}

export function hasAnalysisSessionFailed(
  session: AnalysisSessionContract | null | undefined,
): boolean {
  return (
    session?.state === 'Failed' ||
    session?.issues.some((issue) => issue.severity === 'fatal') === true ||
    session?.reports.some((report) => report.status === 'failed') === true
  );
}
