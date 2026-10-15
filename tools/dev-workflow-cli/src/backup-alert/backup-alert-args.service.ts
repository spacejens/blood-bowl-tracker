import { Injectable } from '@nestjs/common';

import { BACKUP_ALERT_KINDS, BackupAlertKind } from './backup-alert-kinds';

const BACKUP_ALERT_USAGE =
  'Usage: node dist/main.js <raise-alert|resolve-alert> ' +
  `<${BACKUP_ALERT_KINDS.map((kind) => kind.id).join('|')}> <run-url>`;

/** `https://github.com/<owner>/<repo>/actions/runs/<id>`, nothing more. */
const RUN_URL = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+$/;

export interface BackupAlertRequest {
  readonly kind: BackupAlertKind;
  /** The workflow run that failed (raise) or succeeded (resolve). */
  readonly runUrl: string;
}

/**
 * Turns `raise-alert` / `resolve-alert` argv into a request. Split out of
 * `main.ts` so validation is unit-testable: argv is a parameter here.
 */
@Injectable()
export class BackupAlertArgsService {
  parse(argv: readonly string[]): BackupAlertRequest {
    const kindId = argv[3];
    const runUrl = argv[4];
    if (kindId === undefined || runUrl === undefined) {
      throw new Error(BACKUP_ALERT_USAGE);
    }
    if (argv.length > 5) {
      throw new Error(
        `${BACKUP_ALERT_USAGE} (unexpected argument: ${argv[5]})`,
      );
    }
    const kind = BACKUP_ALERT_KINDS.find(
      (candidate) => candidate.id === kindId,
    );
    if (kind === undefined) {
      throw new Error(`${BACKUP_ALERT_USAGE} (unknown kind: ${kindId})`);
    }
    if (!RUN_URL.test(runUrl)) {
      throw new Error(
        `${BACKUP_ALERT_USAGE} (not a GitHub Actions run URL: ${runUrl})`,
      );
    }
    return { kind, runUrl };
  }
}
