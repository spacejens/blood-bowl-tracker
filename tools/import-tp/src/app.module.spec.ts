import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { TpCoachesImportService } from './coaches/tp-coaches-import.service';
import { TpCompetitionsImportService } from './competitions/tp-competitions-import.service';
import { IMPORT_TP_CONFIG_PATH } from './config/import-tp-config.service';
import { TpErasImportService } from './eras/tp-eras-import.service';
import { TpLeaguesImportService } from './leagues/tp-leagues-import.service';
import { TpPositionRaceErasImportService } from './positions/tp-position-race-eras-import.service';
import { TpPositionsImportService } from './positions/tp-positions-import.service';
import { TpRacesImportService } from './races/tp-races-import.service';
import { TpRulesSetsImportService } from './rules-sets/tp-rules-sets-import.service';
import { TpSourceReader } from './source/tp-source-reader';
import { TpTeamsImportService } from './teams/tp-teams-import.service';

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
      "{ connection: { apiBaseUrl: 'http://localhost:3000' }, dataDir: 'data', league: { name: 'tLoEGBBL', eras: [{ identity: { name: 'Fourth era', rulesSets: ['BB2020'] }, dates: { startDate: '2020-11-28' }, dataSubdir: 'fourth-era' }] } }",
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

  it('registers the league, rule-sets and eras import services', async () => {
    const configPath = join(dir, 'import-tp-config.json5');
    writeFileSync(
      configPath,
      "{ connection: { apiBaseUrl: 'http://localhost:3000' }, dataDir: 'data', league: { name: 'tLoEGBBL', eras: [{ identity: { name: 'Fourth era', rulesSets: ['BB2020'] }, dates: { startDate: '2020-11-28' }, dataSubdir: 'fourth-era' }] } }",
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(IMPORT_TP_CONFIG_PATH)
      .useValue(configPath)
      .compile();

    expect(moduleRef.get(TpLeaguesImportService)).toBeInstanceOf(
      TpLeaguesImportService,
    );
    expect(moduleRef.get(TpRulesSetsImportService)).toBeInstanceOf(
      TpRulesSetsImportService,
    );
    expect(moduleRef.get(TpErasImportService)).toBeInstanceOf(
      TpErasImportService,
    );
    expect(moduleRef.get(TpCompetitionsImportService)).toBeInstanceOf(
      TpCompetitionsImportService,
    );
    expect(moduleRef.get(TpCoachesImportService)).toBeInstanceOf(
      TpCoachesImportService,
    );
  });

  it('registers the races, teams and positions import services', async () => {
    const configPath = join(dir, 'import-tp-config.json5');
    writeFileSync(
      configPath,
      "{ connection: { apiBaseUrl: 'http://localhost:3000' }, dataDir: 'data', league: { name: 'tLoEGBBL', eras: [{ identity: { name: 'Fourth era', rulesSets: ['BB2020'] }, dates: { startDate: '2020-11-28' }, dataSubdir: 'fourth-era' }] } }",
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(IMPORT_TP_CONFIG_PATH)
      .useValue(configPath)
      .compile();

    expect(moduleRef.get(TpRacesImportService)).toBeInstanceOf(
      TpRacesImportService,
    );
    expect(moduleRef.get(TpTeamsImportService)).toBeInstanceOf(
      TpTeamsImportService,
    );
    expect(moduleRef.get(TpPositionsImportService)).toBeInstanceOf(
      TpPositionsImportService,
    );
    expect(moduleRef.get(TpPositionRaceErasImportService)).toBeInstanceOf(
      TpPositionRaceErasImportService,
    );
  });
});
