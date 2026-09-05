import { PullDirectionCard } from "./PullDirectionCard";
import { getVisibleEngineeringReportManifest } from '../../features/engineering-reports/engineeringReportManifest';
import { createCompletedPullDirectionSessionReport } from '../../features/engineering-reports/pull-direction/pullDirectionReport.session';
import type { EngineeringReportSupportStatus } from '../../features/engineering-reports/reportRegistry.types';

import styles from './ContextArea.module.css';

const supportStatusLabels: Record<EngineeringReportSupportStatus, string> = {
  'coming-soon': 'Coming Soon',
  supported: 'Supported',
  experimental: 'Experimental',
  hidden: 'Hidden',
  deprecated: 'Deprecated',
};

export function EngineeringReportsList() {
  const reports = getVisibleEngineeringReportManifest();

  const pullDirectionReport = createCompletedPullDirectionSessionReport({
    analysisSessionId: 'context-panel-preview',
    modelId: null,
    source: 'frontend',
    coordinateSystem: 'model',
    units: 'mm',
  });

  if (reports.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="engineering-reports-heading"
      className={styles.section}
    >
      <PullDirectionCard report={pullDirectionReport} />

      <h3
        className={styles.sectionTitle}
        id="engineering-reports-heading"
      >
        Engineering Reports
      </h3>

      <ul
        aria-label="Registered engineering reports"
        className={styles.detailList}
      >
        {reports.map((report) => (
          <li
            className={styles.detailRow}
            key={report.id}
          >
            <span>{report.displayName}</span>
            <span>({supportStatusLabels[report.supportStatus]})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
