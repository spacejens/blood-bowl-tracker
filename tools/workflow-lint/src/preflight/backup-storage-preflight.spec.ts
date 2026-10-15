import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_WORKFLOWS_DIR } from '../lint/workflow-lint.service';
import { BashScriptRunnerService } from './bash-script-runner.service';
import {
  WorkflowJob,
  WorkflowJobReaderService,
  WorkflowStep,
} from './workflow-job-reader.service';

const STEP_NAME = 'Check required settings';
const CLI = 'tools/backup-cli/dist/main.js';

interface WorkflowCase {
  readonly file: string;
  readonly jobId: string;
  /**
   * Every setting the pre-flight step must check, by environment variable,
   * mapped to the GitHub name it is read from (as the error must print it).
   */
  readonly githubNames: Readonly<Record<string, string>>;
}

const CASES: readonly WorkflowCase[] = [
  {
    file: 'verify-backup.yml',
    jobId: 'verify',
    githubNames: {
      BACKUP_STORAGE_ENDPOINT: 'vars.BACKUP_STORAGE_ENDPOINT',
      BACKUP_STORAGE_BUCKET: 'vars.BACKUP_STORAGE_BUCKET',
      BACKUP_STORAGE_ACCESS_KEY_ID: 'secrets.BACKUP_STORAGE_READ_ACCESS_KEY_ID',
      BACKUP_STORAGE_SECRET_ACCESS_KEY:
        'secrets.BACKUP_STORAGE_READ_SECRET_ACCESS_KEY',
    },
  },
  {
    file: 'backup-production.yml',
    jobId: 'backup',
    githubNames: {
      BACKUP_DATABASE_URL: 'secrets.PRODUCTION_DATABASE_URL',
      BACKUP_STORAGE_ENDPOINT: 'vars.BACKUP_STORAGE_ENDPOINT',
      BACKUP_STORAGE_BUCKET: 'vars.BACKUP_STORAGE_BUCKET',
      BACKUP_STORAGE_ACCESS_KEY_ID:
        'secrets.BACKUP_STORAGE_WRITE_ACCESS_KEY_ID',
      BACKUP_STORAGE_SECRET_ACCESS_KEY:
        'secrets.BACKUP_STORAGE_WRITE_SECRET_ACCESS_KEY',
    },
  },
];

/** Distinct, recognizable value per key, so a leaked value is detectable. */
function sampleValue(key: string): string {
  return `value-of-${key}`;
}

function settings(
  keys: readonly string[],
  empty: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    keys.map((key) => [key, empty.includes(key) ? '' : sampleValue(key)]),
  );
}

/**
 * The subject under test is the workflow YAML files, not a service, so the
 * reader and runner services are intentionally real providers: mocking them
 * would leave the workflow steps untested. They have no collaborators of
 * their own to isolate from.
 */
describe.each(CASES)('$file required-settings pre-flight', (workflow) => {
  const keys = Object.keys(workflow.githubNames);
  let runner: BashScriptRunnerService;
  let job: WorkflowJob;
  let step: WorkflowStep;
  let script: string;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WorkflowJobReaderService, BashScriptRunnerService],
    }).compile();
    runner = moduleRef.get(BashScriptRunnerService);
    job = moduleRef
      .get(WorkflowJobReaderService)
      .readJob(
        readFileSync(join(DEFAULT_WORKFLOWS_DIR, workflow.file), 'utf8'),
        workflow.jobId,
      );
    const found = job.steps.find((s) => s.name === STEP_NAME);
    expect(found, `step '${STEP_NAME}' in ${workflow.file}`).toBeDefined();
    step = found as WorkflowStep;
    expect(step.run).toBeDefined();
    script = step.run as string;
  });

  it('runs before the first step that invokes backup-cli', () => {
    const preflight = job.steps.indexOf(step);
    const firstCli = job.steps.findIndex((s) => s.run?.includes(CLI));

    expect(firstCli).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(firstCli);
  });

  it("names the job's own GitHub environment", () => {
    const match = /^environment=([A-Za-z0-9_-]+)$/m.exec(script);

    expect(job.environment).toBeDefined();
    expect(match?.[1]).toBe(job.environment);
  });

  it('reads every setting from the same place as the backup-cli steps', () => {
    const expected = Object.fromEntries(
      keys.map((key) => [key, `\${{ ${workflow.githubNames[key]} }}`]),
    );
    const cliSteps = job.steps.filter((s) => s.run?.includes(CLI));

    expect(cliSteps.length).toBeGreaterThan(0);
    expect(step.env).toEqual(expected);
    for (const key of keys) {
      const readers = cliSteps.filter((s) => key in s.env);
      expect(readers.length, `a backup-cli step reads ${key}`).toBeGreaterThan(
        0,
      );
      for (const reader of readers) {
        expect(reader.env[key], `${key} in '${reader.name}'`).toBe(
          expected[key],
        );
      }
    }
  });

  it('fails naming every setting and the unconfigured environment when all are empty', () => {
    const result = runner.run(script, settings(keys, keys));

    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/^::error::/);
    expect(result.stdout).toContain(`'${job.environment}'`);
    expect(result.stdout).toContain('looks unconfigured');
    expect(result.stdout).toContain(
      `Settings -> Environments -> ${job.environment}`,
    );
    expect(result.stdout).toContain('docs/discord-bot/production-backups.md');
    for (const key of keys) {
      expect(result.stdout).toContain(workflow.githubNames[key]);
    }
  });

  it.each(keys)('fails naming only %s when just it is empty', (empty) => {
    const result = runner.run(script, settings(keys, [empty]));

    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/^::error::/);
    expect(result.stdout).toContain(`'${job.environment}'`);
    expect(result.stdout).not.toContain('looks unconfigured');
    for (const key of keys) {
      if (key === empty) {
        expect(result.stdout).toContain(workflow.githubNames[key]);
      } else {
        expect(result.stdout).not.toContain(workflow.githubNames[key]);
        expect(result.stdout).not.toContain(sampleValue(key));
      }
    }
  });

  it('succeeds silently when every setting is set', () => {
    const result = runner.run(script, settings(keys, []));

    expect(result).toEqual({ status: 0, stdout: '', stderr: '' });
  });
});
