import { DEFAULT_ENGINEERING_REPORTS } from './defaultEngineeringReports';
import { createEngineeringReportRegistry } from './reportRegistry';
import type {
  EngineeringReportManifestItem,
  EngineeringReportRegistry,
} from './reportRegistry.types';

const defaultEngineeringReportRegistry = createEngineeringReportRegistry(
  DEFAULT_ENGINEERING_REPORTS,
);

export const getEngineeringReportRegistry = (): EngineeringReportRegistry => {
  return defaultEngineeringReportRegistry;
};

export const getEngineeringReportManifest = (): readonly EngineeringReportManifestItem[] => {
  return defaultEngineeringReportRegistry.toManifest({
    includeHidden: true,
  });
};

export const getVisibleEngineeringReportManifest = (): readonly EngineeringReportManifestItem[] => {
  return defaultEngineeringReportRegistry.toManifest();
};
