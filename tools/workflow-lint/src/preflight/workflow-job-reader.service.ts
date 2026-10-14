import { Injectable } from '@nestjs/common';
import { parse } from 'yaml';

/** One step of a workflow job; fields absent or not a string are left out. */
export interface WorkflowStep {
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly env: Readonly<Record<string, string>>;
}

/** One workflow job: the GitHub environment it runs in, and its steps. */
export interface WorkflowJob {
  readonly environment?: string;
  readonly steps: readonly WorkflowStep[];
}

type YamlRecord = Record<string, unknown>;

/**
 * Reads one job out of a GitHub Actions workflow's YAML source, so tests can
 * assert on a step's placement, environment variables and script.
 */
@Injectable()
export class WorkflowJobReaderService {
  readJob(source: string, jobId: string): WorkflowJob {
    const root: unknown = parse(source);
    const job = this.field(this.field(root, 'jobs'), jobId);
    if (!this.isRecord(job)) {
      throw new Error(`Job '${jobId}' not found`);
    }
    if (!Array.isArray(job.steps)) {
      throw new Error(`Job '${jobId}' has no steps list`);
    }
    const steps: unknown[] = job.steps;
    return {
      environment: this.environmentName(job.environment),
      steps: steps.map((step) => this.step(step)),
    };
  }

  private isRecord(value: unknown): value is YamlRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private field(value: unknown, key: string): unknown {
    return this.isRecord(value) ? value[key] : undefined;
  }

  private text(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  /** `environment:` is either a name or a mapping with a `name` key. */
  private environmentName(value: unknown): string | undefined {
    return this.text(value) ?? this.text(this.field(value, 'name'));
  }

  private step(value: unknown): WorkflowStep {
    const step: WorkflowStep = { env: this.env(this.field(value, 'env')) };
    const name = this.text(this.field(value, 'name'));
    const run = this.text(this.field(value, 'run'));
    const uses = this.text(this.field(value, 'uses'));
    return {
      ...(name === undefined ? {} : { name }),
      ...(run === undefined ? {} : { run }),
      ...(uses === undefined ? {} : { uses }),
      ...step,
    };
  }

  private env(value: unknown): Record<string, string> {
    if (!this.isRecord(value)) {
      return {};
    }
    const env: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string') {
        env[key] = entry;
      }
    }
    return env;
  }
}
