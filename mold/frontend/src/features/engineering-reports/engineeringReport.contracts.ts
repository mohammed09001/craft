export const ENGINEERING_REPORT_SCHEMA = "engineering_report" as const;
export const ENGINEERING_REPORT_SCHEMA_VERSION = "1.0.0" as const;

export type EngineeringReportSchema = typeof ENGINEERING_REPORT_SCHEMA;

export type EngineeringReportStatus =
  | "success"
  | "success_with_warnings"
  | "partial"
  | "failed"
  | "unsupported"
  | "skipped";

export type EngineeringReportSource =
  | "python-engine"
  | "engine-bridge"
  | "frontend";

export type EngineeringReportPrimitive =
  | string
  | number
  | boolean
  | null;

export type EngineeringReportJson =
  | EngineeringReportPrimitive
  | readonly EngineeringReportJson[]
  | { readonly [key: string]: EngineeringReportJson };

export type EngineeringReportStatistics = Readonly<
  Record<string, EngineeringReportPrimitive>
>;

export type EngineeringReportData = Readonly<
  Record<string, EngineeringReportJson>
>;

export interface EngineeringReportMetadata {
  readonly reportId: string;
  readonly analysisName: string;
  readonly reportName: string;
  readonly createdAt: string;
  readonly source: EngineeringReportSource;
  readonly engineVersion?: string | null;
  readonly contractVersion?: string;
}

export interface EngineeringReportWarning {
  readonly code: string;
  readonly message: string;
  readonly source?: string | null;
  readonly details?: EngineeringReportJson;
}

export interface EngineeringReportError {
  readonly code: string;
  readonly message: string;
  readonly source?: string | null;
  readonly recoverable?: boolean;
  readonly details?: EngineeringReportJson;
}

export interface EngineeringReport<
  TData extends EngineeringReportData = EngineeringReportData,
> {
  readonly schema: EngineeringReportSchema;
  readonly schemaVersion: string;
  readonly metadata: EngineeringReportMetadata;
  readonly status: EngineeringReportStatus;
  readonly success: boolean;
  readonly warnings: readonly EngineeringReportWarning[];
  readonly errors: readonly EngineeringReportError[];
  readonly statistics: EngineeringReportStatistics;
  readonly data: TData;
}

export type EngineeringReportCollection = readonly EngineeringReport[];
