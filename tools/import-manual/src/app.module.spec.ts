import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { IMPORT_MANUAL_CONFIG_PATH } from './config/import-manual-config.service';
import { ManualImportService } from './import/manual-import.service';

describe('AppModule', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-module-manual-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('registers ManualImportService with its dependencies wired', async () => {
    const configPath = join(dir, 'import-manual-config.json5');
    writeFileSync(
      configPath,
      "{ connection: { apiBaseUrl: 'http://localhost:3000' } }",
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(IMPORT_MANUAL_CONFIG_PATH)
      .useValue(configPath)
      .compile();

    expect(moduleRef.get(ManualImportService)).toBeInstanceOf(
      ManualImportService,
    );
  });
});
