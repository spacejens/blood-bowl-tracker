import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { BblCoachesImportService } from './coaches/bbl-coaches-import.service';
import { IMPORT_BBL_CONFIG_PATH } from './config/import-bbl-config.service';

describe('AppModule', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-module-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('registers BblCoachesImportService with its dependencies wired', async () => {
    // AppModule.register() always resolves the config file from cwd (there's
    // no way to inject a path through it), and ApiClientModule.forRootAsync's
    // factory calls getApiBaseUrl() during module compile — which now
    // requires the connection group to be present. Point the config path at
    // a minimal fixture so this DI-wiring test doesn't depend on whatever
    // (gitignored) config file happens to exist at cwd.
    const configPath = join(dir, 'import-bbl-config.json5');
    writeFileSync(
      configPath,
      "{ connection: { apiBaseUrl: 'http://localhost:3000' } }",
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(IMPORT_BBL_CONFIG_PATH)
      .useValue(configPath)
      .compile();

    expect(moduleRef.get(BblCoachesImportService)).toBeInstanceOf(
      BblCoachesImportService,
    );
  });
});
