import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { DEFAULT_WORKFLOWS_DIR } from '../lint/workflow-lint.service';

const ALERT_WORKFLOW = './.github/workflows/backup-alert.yml';

/**
 * The kind ids of `BACKUP_ALERT_KINDS` in
 * `tools/backup-cli/src/backup-alert/backup-alert-kinds.ts`. Repeated here
 * because workflow-lint does not depend on backup-cli; update both together.
 */
const KIND_IDS = ['backup', 'verify', 'stale'];
const COMMANDS = ['raise-alert', 'resolve-alert'];

interface AlertCaller {
  readonly file: string;
  readonly where: string;
  readonly kind: unknown;
  readonly command: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Every job, in any workflow, that calls the shared backup alert workflow. */
function alertCallers(): AlertCaller[] {
  const callers: AlertCaller[] = [];
  for (const file of readdirSync(DEFAULT_WORKFLOWS_DIR)) {
    if (!/\.ya?ml$/.test(file)) {
      continue;
    }
    const root = record(
      parse(readFileSync(join(DEFAULT_WORKFLOWS_DIR, file), 'utf8')),
    );
    for (const [jobId, job] of Object.entries(record(root.jobs))) {
      const { uses, with: inputs } = record(job);
      if (uses === ALERT_WORKFLOW) {
        callers.push({
          file,
          where: `${file} job '${jobId}'`,
          kind: record(inputs).kind,
          command: record(inputs).command,
        });
      }
    }
  }
  return callers;
}

/** Every `<workflow file>: <command>/<kind>` pair that must exist, once. */
const EXPECTED_CALLERS = [
  'backup-production.yml: raise-alert/backup',
  'backup-production.yml: resolve-alert/backup',
  'check-backup-freshness.yml: raise-alert/stale',
  'check-backup-freshness.yml: resolve-alert/stale',
  'verify-backup.yml: raise-alert/verify',
  'verify-backup.yml: resolve-alert/verify',
];

/** The shared alert workflow's single job, as parsed from its YAML. */
function alertJob(): Record<string, unknown> {
  const root = record(
    parse(
      readFileSync(join(DEFAULT_WORKFLOWS_DIR, 'backup-alert.yml'), 'utf8'),
    ),
  );
  return record(record(root.jobs).alert);
}

describe('backup-alert.yml failure handling', () => {
  // The backup run's conclusion gates verify-backup.yml, so a failed resolve
  // must not fail the calling run, while a failed raise must stay visible.
  // Whether GitHub then counts the called job as successful is runtime
  // behavior no spec can show; this only keeps the setting from being lost
  // or widened to the raise path.
  const RESOLVE_ONLY =
    /^\$\{\{\s*inputs\.command\s*==\s*'resolve-alert'\s*\}\}$/;

  it('lets only a failed resolve-alert continue on error', () => {
    expect(String(alertJob()['continue-on-error'])).toMatch(RESOLVE_ONLY);
  });
});

describe('jobs calling backup-alert.yml', () => {
  const callers = alertCallers();

  it('are exactly the expected workflow/command/kind pairs', () => {
    const actual = callers.map(
      (caller) =>
        `${caller.file}: ${String(caller.command)}/${String(caller.kind)}`,
    );
    expect(actual.sort()).toEqual(EXPECTED_CALLERS);
  });

  it('pass a kind that backup-cli knows', () => {
    for (const caller of callers) {
      expect(KIND_IDS, `kind of ${caller.where}`).toContain(caller.kind);
    }
  });

  it('pass a command that backup-cli implements', () => {
    for (const caller of callers) {
      expect(COMMANDS, `command of ${caller.where}`).toContain(caller.command);
    }
  });
});
