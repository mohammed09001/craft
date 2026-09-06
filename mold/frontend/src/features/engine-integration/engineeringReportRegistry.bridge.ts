import { getVisibleEngineeringReportManifest } from '../engineering-reports/engineeringReportManifest';
import type { EngineeringReportManifestItem } from '../engineering-reports/reportRegistry.types';

export type FrontendEngineeringReportManifestItem = EngineeringReportManifestItem;

export const getRegisteredEngineeringReportsForFrontend =
  (): readonly FrontendEngineeringReportManifestItem[] => {
    return getVisibleEngineeringReportManifest();
  };
