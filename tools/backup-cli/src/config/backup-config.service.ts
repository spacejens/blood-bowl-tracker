import { join } from 'node:path';

import { createConfigLoaderServiceBase } from '@blood-bowl-tracker/config-loader';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

/** DI token carrying the absolute path to the JSON5 config file. */
export const BACKUP_CONFIG_PATH = Symbol('BACKUP_CONFIG_PATH');

/** DI token carrying the environment the settings may be overridden from. */
export const BACKUP_ENV = Symbol('BACKUP_ENV');

/** File name this tool's config lives in, named in every error about it. */
export const CONFIG_FILE_NAME = 'backup-cli-config.json5';

/**
 * `tools/backup-cli/backup-cli-config.json5`, resolved from this file's own
 * location (two levels below the package root in both `src/` and `dist/`)
 * rather than the working directory: the workflow runs the CLI from the repo
 * root, developers from anywhere.
 */
export const DEFAULT_BACKUP_CONFIG_PATH = join(
  __dirname,
  '..',
  '..',
  CONFIG_FILE_NAME,
);

export const DEFAULT_RETENTION_DAYS = 30;

export type BackupEnv = Readonly<Record<string, string | undefined>>;

/** Everything needed to reach the backup bucket. */
export interface StorageSettings {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/** One required string setting: where it lives in the file, and its env var. */
interface StringSetting {
  readonly group: string;
  readonly key: string;
  readonly envVar: string;
}

/**
 * Total by design: an absent or non-object group yields `{}`, so each getter
 * raises its own per-field error.
 */
const groupSchema = z.looseObject({}).catch({});
const nonEmptyStringSchema = z.string().min(1);
const positiveIntegerSchema = z.number().int().min(1);

/**
 * backup-cli's settings. Each comes from a non-empty environment variable
 * when set (how CI supplies them, with no file), else from the gitignored
 * JSON5 file. Validation is lazy and per-field, so `list` never fails over a
 * missing database url only `create` needs. Errors name the setting and its
 * env var, never a value.
 */
@Injectable()
export class BackupConfigService extends createConfigLoaderServiceBase({
  pathToken: BACKUP_CONFIG_PATH,
  schema: z.looseObject({}),
}) {
  constructor(
    @Inject(BACKUP_CONFIG_PATH) filePath: string,
    @Inject(BACKUP_ENV) private readonly env: BackupEnv,
  ) {
    super(filePath);
  }

  /** Connection string of the database `create` dumps. */
  getDatabaseUrl(): string {
    const url = this.requiredString({
      group: 'database',
      key: 'url',
      envVar: 'BACKUP_DATABASE_URL',
    });
    if (!/^postgres(ql)?:\/\//.test(url)) {
      throw new Error(
        'database.url (BACKUP_DATABASE_URL) is not a postgres:// or ' +
          'postgresql:// connection string.',
      );
    }
    return url;
  }

  getStorageSettings(): StorageSettings {
    return {
      endpoint: this.requiredString({
        group: 'storage',
        key: 'endpoint',
        envVar: 'BACKUP_STORAGE_ENDPOINT',
      }),
      bucket: this.requiredString({
        group: 'storage',
        key: 'bucket',
        envVar: 'BACKUP_STORAGE_BUCKET',
      }),
      accessKeyId: this.requiredString({
        group: 'storage',
        key: 'accessKeyId',
        envVar: 'BACKUP_STORAGE_ACCESS_KEY_ID',
      }),
      secretAccessKey: this.requiredString({
        group: 'storage',
        key: 'secretAccessKey',
        envVar: 'BACKUP_STORAGE_SECRET_ACCESS_KEY',
      }),
    };
  }

  /** How many days `prune` keeps backups for. */
  getRetentionDays(): number {
    const fromEnv = this.envValue('BACKUP_RETENTION_DAYS');
    const raw =
      fromEnv === undefined
        ? this.get<unknown>('retentionDays')
        : Number(fromEnv);
    if (raw === undefined) {
      return DEFAULT_RETENTION_DAYS;
    }
    const parsed = positiveIntegerSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `retentionDays in ${CONFIG_FILE_NAME} (or BACKUP_RETENTION_DAYS) ` +
          'must be a positive integer.',
      );
    }
    return parsed.data;
  }

  private requiredString(setting: StringSetting): string {
    const fromEnv = this.envValue(setting.envVar);
    if (fromEnv !== undefined) {
      return fromEnv;
    }
    const group = groupSchema.parse(this.get<unknown>(setting.group));
    const fromFile = nonEmptyStringSchema.safeParse(group[setting.key]);
    if (fromFile.success) {
      return fromFile.data;
    }
    const name = `${setting.group}.${setting.key}`;
    throw new Error(
      `${name} is not set: set ${setting.envVar} or ${name} in ${CONFIG_FILE_NAME}.`,
    );
  }

  private envValue(name: string): string | undefined {
    const value = this.env[name];
    return value === undefined || value === '' ? undefined : value;
  }
}
