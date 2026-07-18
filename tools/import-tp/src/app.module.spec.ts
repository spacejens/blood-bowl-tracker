import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { IMPORT_TP_CONFIG_PATH } from './config/import-tp-config.service';
import { TpSourceReader } from './source/tp-source-reader';

describe('AppModule', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-module-tp-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('registers TpSourceReader with its dependencies wired', async () => {
    const configPath = join(dir, 'import-tp-config.json5');
    writeFileSync(
      configPath,
      "{ connection: { apiBaseUrl: 'http://localhost:3000' }, dataDir: 'data', eras: [{ name: 'Fourth era', dataSubdir: 'fourth-era' }] }",
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(IMPORT_TP_CONFIG_PATH)
      .useValue(configPath)
      .compile();

    expect(moduleRef.get(TpSourceReader)).toBeInstanceOf(TpSourceReader);
  });
});
