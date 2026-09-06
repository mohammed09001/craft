export type EngineeringReportId = string;

export type EngineeringReportType =
  | 'pull-direction'
  | 'draft-analysis'
  | 'undercut-analysis'
  | 'parting-analysis'
  | 'thickness-analysis'
  | (string & { readonly __customEngineeringReportType?: never });

export type EngineeringReportCategory =
  | 'moldability'
  | 'geometry'
  | 'manufacturing'
  | 'quality'
  | 'diagnostics'
  | 'other';

export type EngineeringReportSupportStatus =
  | 'coming-soon'
  | 'supported'
  | 'experimental'
  | 'hidden'
  | 'deprecated';

export type EngineeringReportMetadataValue =
  | string
  | number
  | boolean
  | null;

export type EngineeringReportMetadata = Readonly<
  Record<string, EngineeringReportMetadataValue>
>;

export interface EngineeringReportDefinition {
  readonly id: EngineeringReportId;
  readonly type: EngineeringReportType;
  readonly displayName: string;
  readonly description: string;
  readonly category: EngineeringReportCategory;
  readonly displayOrder: number;
  readonly visible: boolean;
  readonly supportStatus: EngineeringReportSupportStatus;
  readonly version: string;
  readonly icon?: string;
  readonly metadata?: EngineeringReportMetadata;
}

export interface EngineeringReportDiscoverOptions {
  readonly includeHidden?: boolean;
  readonly category?: EngineeringReportCategory;
}

export interface EngineeringReportManifestItem {
  readonly id: EngineeringReportId;
  readonly type: EngineeringReportType;
  readonly displayName: string;
  readonly description: string;
  readonly category: EngineeringReportCategory;
  readonly displayOrder: number;
  readonly visible: boolean;
  readonly supportStatus: EngineeringReportSupportStatus;
  readonly version: string;
  readonly icon?: string;
  readonly metadata?: EngineeringReportMetadata;
}

export interface EngineeringReportRegistry {
  readonly register: (
    definition: EngineeringReportDefinition,
  ) => EngineeringReportRegistry;

  readonly discover: (
    options?: EngineeringReportDiscoverOptions,
  ) => readonly EngineeringReportDefinition[];

  readonly getById: (
    id: EngineeringReportId,
  ) => EngineeringReportDefinition | undefined;

  readonly getByType: (
    type: EngineeringReportType,
  ) => EngineeringReportDefinition | undefined;

  readonly getByCategory: (
    category: EngineeringReportCategory,
    options?: Omit<EngineeringReportDiscoverOptions, 'category'>,
  ) => readonly EngineeringReportDefinition[];

  readonly getVisible: () => readonly EngineeringReportDefinition[];

  readonly toManifest: (
    options?: EngineeringReportDiscoverOptions,
  ) => readonly EngineeringReportManifestItem[];
}
