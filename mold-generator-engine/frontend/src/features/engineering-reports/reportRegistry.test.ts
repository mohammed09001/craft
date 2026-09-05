import { describe, expect, it } from 'vitest';

import { DEFAULT_ENGINEERING_REPORTS } from './defaultEngineeringReports';
import {
  getEngineeringReportManifest,
  getVisibleEngineeringReportManifest,
} from './engineeringReportManifest';
import { createEngineeringReportRegistry } from './reportRegistry';
import type { EngineeringReportDefinition } from './reportRegistry.types';

const createSampleReport = (
  overrides: Partial<EngineeringReportDefinition> = {},
): EngineeringReportDefinition => ({
  id: 'sample-report',
  type: 'sample-report',
  displayName: 'Sample Report',
  description: 'A sample report used for registry tests.',
  category: 'diagnostics',
  displayOrder: 100,
  visible: true,
  supportStatus: 'coming-soon',
  version: '0.1.0',
  ...overrides,
});

describe('Engineering Report Registry', () => {
  it('discovers default reports in display order', () => {
    const reports = getVisibleEngineeringReportManifest();

    expect(reports.map((report) => report.displayName)).toEqual([
      'Pull Direction',
      'Draft Analysis',
      'Undercut Analysis',
      'Parting Analysis',
      'Thickness Analysis',
    ]);

    expect(reports.every((report) => report.supportStatus === 'coming-soon')).toBe(true);
  });

  it('looks up reports by id and type', () => {
    const registry = createEngineeringReportRegistry(DEFAULT_ENGINEERING_REPORTS);

    expect(registry.getById('pull-direction')?.displayName).toBe('Pull Direction');
    expect(registry.getByType('draft-analysis')?.displayName).toBe('Draft Analysis');
  });

  it('filters reports by category', () => {
    const registry = createEngineeringReportRegistry(DEFAULT_ENGINEERING_REPORTS);

    expect(
      registry.getByCategory('moldability').map((report) => report.type),
    ).toEqual([
      'pull-direction',
      'draft-analysis',
      'undercut-analysis',
    ]);
  });

  it('does not mutate an existing registry when registering a new report', () => {
    const emptyRegistry = createEngineeringReportRegistry();
    const nextRegistry = emptyRegistry.register(createSampleReport());

    expect(emptyRegistry.discover()).toHaveLength(0);
    expect(nextRegistry.discover()).toHaveLength(1);
  });

  it('rejects duplicate report ids', () => {
    expect(() =>
      createEngineeringReportRegistry([
        createSampleReport(),
        createSampleReport({
          type: 'another-sample-report',
        }),
      ]),
    ).toThrow(/Duplicate engineering report id/);
  });

  it('rejects duplicate report types', () => {
    expect(() =>
      createEngineeringReportRegistry([
        createSampleReport(),
        createSampleReport({
          id: 'another-sample-report',
        }),
      ]),
    ).toThrow(/Duplicate engineering report type/);
  });

  it('excludes hidden reports by default and includes them on demand', () => {
    const registry = createEngineeringReportRegistry([
      createSampleReport(),
      createSampleReport({
        id: 'hidden-report',
        type: 'hidden-report',
        displayName: 'Hidden Report',
        displayOrder: 110,
        visible: false,
      }),
    ]);

    expect(registry.discover().map((report) => report.id)).toEqual([
      'sample-report',
    ]);

    expect(
      registry.discover({ includeHidden: true }).map((report) => report.id),
    ).toEqual([
      'sample-report',
      'hidden-report',
    ]);
  });

  it('provides a serializable manifest for integration boundaries', () => {
    const manifest = getEngineeringReportManifest();

    expect(manifest).toHaveLength(DEFAULT_ENGINEERING_REPORTS.length);
    expect(manifest[0]).toHaveProperty('id');
    expect(manifest[0]).toHaveProperty('type');
    expect(manifest[0]).toHaveProperty('version');
    expect(manifest[0]).toHaveProperty('supportStatus');
  });
});

