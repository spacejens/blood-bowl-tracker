import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { TpCoachesImportService } from './coaches/tp-coaches-import.service';
import { TpCompetitionIdResolverService } from './competitions/tp-competition-id-resolver.service';
import { TpCompetitionSourcesService } from './competitions/tp-competition-sources.service';
import { TpCompetitionsImportService } from './competitions/tp-competitions-import.service';
import { IMPORT_TP_CONFIG_PATH } from './config/import-tp-config.service';
import { TpErasImportService } from './eras/tp-eras-import.service';
import { TpKeywordCatalogService } from './keywords/tp-keyword-catalog.service';
import { TpLeaguesImportService } from './leagues/tp-leagues-import.service';
import { TpMatchFilesImportService } from './match-files/tp-match-files-import.service';
import { TpOfficialTeamsFilesImportService } from './official-teams/tp-official-teams-files-import.service';
import { TpInducedStarPlayersStepService } from './players/tp-induced-star-players-step.service';
import { TpRosterFilesImportService } from './rosters/tp-roster-files-import.service';
import { TpRosterPlayerFactsService } from './rosters/tp-roster-player-facts.service';
import { TpRulesSetsImportService } from './rules-sets/tp-rules-sets-import.service';
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
      "{ connection: { apiBaseUrl: 'http://localhost:3000', apiToken: 'a-token' }, dataDir: 'data', league: { name: 'tLoEGBBL', eras: [{ identity: { name: 'Fourth era', rulesSets: ['BB2020'] }, dates: { startDate: '2020-11-28' }, dataSubdir: 'fourth-era' }] } }",
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
      "{ connection: { apiBaseUrl: 'http://localhost:3000', apiToken: 'a-token' }, dataDir: 'data', league: { name: 'tLoEGBBL', eras: [{ identity: { name: 'Fourth era', rulesSets: ['BB2020'] }, dates: { startDate: '2020-11-28' }, dataSubdir: 'fourth-era' }] } }",
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
    expect(moduleRef.get(TpCompetitionIdResolverService)).toBeInstanceOf(
      TpCompetitionIdResolverService,
    );
    expect(moduleRef.get(TpCoachesImportService)).toBeInstanceOf(
      TpCoachesImportService,
    );
  });

  it('registers the roster and match-file import services', async () => {
    const configPath = join(dir, 'import-tp-config.json5');
    writeFileSync(
      configPath,
      "{ connection: { apiBaseUrl: 'http://localhost:3000', apiToken: 'a-token' }, dataDir: 'data', league: { name: 'tLoEGBBL', eras: [{ identity: { name: 'Fourth era', rulesSets: ['BB2020'] }, dates: { startDate: '2020-11-28' }, dataSubdir: 'fourth-era' }] } }",
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(IMPORT_TP_CONFIG_PATH)
      .useValue(configPath)
      .compile();

    expect(moduleRef.get(TpRosterFilesImportService)).toBeInstanceOf(
      TpRosterFilesImportService,
    );
    expect(moduleRef.get(TpRosterPlayerFactsService)).toBeInstanceOf(
      TpRosterPlayerFactsService,
    );
    expect(moduleRef.get(TpInducedStarPlayersStepService)).toBeInstanceOf(
      TpInducedStarPlayersStepService,
    );
    expect(moduleRef.get(TpCompetitionSourcesService)).toBeInstanceOf(
      TpCompetitionSourcesService,
    );
    expect(moduleRef.get(TpMatchFilesImportService)).toBeInstanceOf(
      TpMatchFilesImportService,
    );
    expect(moduleRef.get(TpOfficialTeamsFilesImportService)).toBeInstanceOf(
      TpOfficialTeamsFilesImportService,
    );
  });

  it('registers the keyword catalogue service', async () => {
    const configPath = join(dir, 'import-tp-config.json5');
    writeFileSync(
      configPath,
      "{ connection: { apiBaseUrl: 'http://localhost:3000', apiToken: 'a-token' }, dataDir: 'data', league: { name: 'tLoEGBBL', eras: [{ identity: { name: 'Fourth era', rulesSets: ['BB2020'] }, dates: { startDate: '2020-11-28' }, dataSubdir: 'fourth-era' }] } }",
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(IMPORT_TP_CONFIG_PATH)
      .useValue(configPath)
      .compile();

    expect(moduleRef.get(TpKeywordCatalogService)).toBeInstanceOf(
      TpKeywordCatalogService,
    );
  });
});
