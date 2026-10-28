import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ManualDataReader } from '../data-file/manual-data-reader.service';
import { AdvancementCostsProcessor } from '../entities/advancement-costs.processor';
import { CoachesProcessor } from '../entities/coaches.processor';
import { CompetitionGroupsProcessor } from '../entities/competition-groups.processor';
import { CompetitionsProcessor } from '../entities/competitions.processor';
import { ErasProcessor } from '../entities/eras.processor';
import { ExternalSystemsProcessor } from '../entities/external-systems.processor';
import { KeywordsProcessor } from '../entities/keywords.processor';
import { LeaguesProcessor } from '../entities/leagues.processor';
import { PositionRulesSetSkillsProcessor } from '../entities/position-rules-set-skills.processor';
import { PositionRulesSetsProcessor } from '../entities/position-rules-sets.processor';
import { PositionsProcessor } from '../entities/positions.processor';
import { RacesProcessor } from '../entities/races.processor';
import { RulesSetsProcessor } from '../entities/rules-sets.processor';
import { SkillRulesSetsProcessor } from '../entities/skill-rules-sets.processor';
import { SkillsProcessor } from '../entities/skills.processor';
import { SppAwardValuesProcessor } from '../entities/spp-award-values.processor';
import { TeamsProcessor } from '../entities/teams.processor';
import { TrophiesProcessor } from '../entities/trophies.processor';
import { TrophyAwardsProcessor } from '../entities/trophy-awards.processor';
import type { ProcessContext } from '../references/process-context';
import { ManualImportService } from './manual-import.service';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import-shared/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

function emptyData(): ManualDataFile {
  return {
    externalSystems: [],
    rulesSets: [],
    leagues: [],
    eras: [],
    races: [],
    positions: [],
    positionRulesSets: [],
    positionRulesSetSkills: [],
    skills: [],
    skillRulesSets: [],
    keywords: [],
    coaches: [],
    teams: [],
    competitions: [],
    sppAwardValues: [],
    advancementCosts: [],
    trophies: [],
    competitionGroups: [],
    trophyAwards: [],
  };
}

interface Overrides {
  read?: () => Promise<ManualDataFile>;
  bootstrap?: () => Promise<Map<string, number>>;
  counts?: Partial<Record<string, number>>;
  errorFrom?: { processor: string; message: string };
}

interface ProcessorMocks {
  rulesSets: MockProxy<RulesSetsProcessor>;
  skills: MockProxy<SkillsProcessor>;
  skillRulesSets: MockProxy<SkillRulesSetsProcessor>;
  keywords: MockProxy<KeywordsProcessor>;
  leagues: MockProxy<LeaguesProcessor>;
  eras: MockProxy<ErasProcessor>;
  races: MockProxy<RacesProcessor>;
  positions: MockProxy<PositionsProcessor>;
  positionRulesSets: MockProxy<PositionRulesSetsProcessor>;
  positionRulesSetSkills: MockProxy<PositionRulesSetSkillsProcessor>;
  coaches: MockProxy<CoachesProcessor>;
  teams: MockProxy<TeamsProcessor>;
  competitionGroups: MockProxy<CompetitionGroupsProcessor>;
  competitions: MockProxy<CompetitionsProcessor>;
  sppAwardValues: MockProxy<SppAwardValuesProcessor>;
  advancementCosts: MockProxy<AdvancementCostsProcessor>;
  trophies: MockProxy<TrophiesProcessor>;
  trophyAwards: MockProxy<TrophyAwardsProcessor>;
}

function processImpl(name: string, overrides: Overrides) {
  return (ctx: ProcessContext): Promise<number> => {
    if (overrides.errorFrom?.processor === name) {
      ctx.errors.push({ item: {}, message: overrides.errorFrom.message });
    }
    return Promise.resolve(overrides.counts?.[name] ?? 0);
  };
}

async function makeService(overrides: Overrides = {}): Promise<{
  service: ManualImportService;
  reader: MockProxy<ManualDataReader>;
  externalSystems: MockProxy<ExternalSystemsProcessor>;
  procs: ProcessorMocks;
  importResults: MockProxy<ImportResultService>;
}> {
  const reader = mock<ManualDataReader>();
  reader.read.mockImplementation(
    overrides.read ?? (() => Promise.resolve(emptyData())),
  );

  const externalSystems = mock<ExternalSystemsProcessor>();
  externalSystems.bootstrap.mockImplementation(
    overrides.bootstrap ?? (() => Promise.resolve(new Map())),
  );

  const procs: ProcessorMocks = {
    rulesSets: mock<RulesSetsProcessor>(),
    skills: mock<SkillsProcessor>(),
    skillRulesSets: mock<SkillRulesSetsProcessor>(),
    keywords: mock<KeywordsProcessor>(),
    leagues: mock<LeaguesProcessor>(),
    eras: mock<ErasProcessor>(),
    races: mock<RacesProcessor>(),
    positions: mock<PositionsProcessor>(),
    positionRulesSets: mock<PositionRulesSetsProcessor>(),
    positionRulesSetSkills: mock<PositionRulesSetSkillsProcessor>(),
    coaches: mock<CoachesProcessor>(),
    teams: mock<TeamsProcessor>(),
    competitionGroups: mock<CompetitionGroupsProcessor>(),
    competitions: mock<CompetitionsProcessor>(),
    sppAwardValues: mock<SppAwardValuesProcessor>(),
    advancementCosts: mock<AdvancementCostsProcessor>(),
    trophies: mock<TrophiesProcessor>(),
    trophyAwards: mock<TrophyAwardsProcessor>(),
  };
  procs.rulesSets.process.mockImplementation(
    processImpl('rulesSets', overrides),
  );
  procs.skills.process.mockImplementation(processImpl('skills', overrides));
  procs.skillRulesSets.process.mockImplementation(
    processImpl('skillRulesSets', overrides),
  );
  procs.keywords.process.mockImplementation(processImpl('keywords', overrides));
  procs.leagues.process.mockImplementation(processImpl('leagues', overrides));
  procs.eras.process.mockImplementation(processImpl('eras', overrides));
  procs.races.process.mockImplementation(processImpl('races', overrides));
  procs.positions.process.mockImplementation(
    processImpl('positions', overrides),
  );
  procs.positionRulesSets.process.mockImplementation(
    processImpl('positionRulesSets', overrides),
  );
  procs.positionRulesSetSkills.process.mockImplementation(
    processImpl('positionRulesSetSkills', overrides),
  );
  procs.coaches.process.mockImplementation(processImpl('coaches', overrides));
  procs.teams.process.mockImplementation(processImpl('teams', overrides));
  procs.competitionGroups.process.mockImplementation(
    processImpl('competitionGroups', overrides),
  );
  procs.competitions.process.mockImplementation(
    processImpl('competitions', overrides),
  );
  procs.sppAwardValues.process.mockImplementation(
    processImpl('sppAwardValues', overrides),
  );
  procs.advancementCosts.process.mockImplementation(
    processImpl('advancementCosts', overrides),
  );
  procs.trophies.process.mockImplementation(processImpl('trophies', overrides));
  procs.trophyAwards.process.mockImplementation(
    processImpl('trophyAwards', overrides),
  );

  const importResults = mock<ImportResultService>();
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      ManualImportService,
      { provide: ManualDataReader, useValue: reader },
      { provide: ExternalSystemsProcessor, useValue: externalSystems },
      { provide: RulesSetsProcessor, useValue: procs.rulesSets },
      { provide: SkillsProcessor, useValue: procs.skills },
      { provide: SkillRulesSetsProcessor, useValue: procs.skillRulesSets },
      { provide: KeywordsProcessor, useValue: procs.keywords },
      { provide: LeaguesProcessor, useValue: procs.leagues },
      { provide: ErasProcessor, useValue: procs.eras },
      { provide: RacesProcessor, useValue: procs.races },
      { provide: PositionsProcessor, useValue: procs.positions },
      {
        provide: PositionRulesSetsProcessor,
        useValue: procs.positionRulesSets,
      },
      {
        provide: PositionRulesSetSkillsProcessor,
        useValue: procs.positionRulesSetSkills,
      },
      { provide: CoachesProcessor, useValue: procs.coaches },
      { provide: TeamsProcessor, useValue: procs.teams },
      {
        provide: CompetitionGroupsProcessor,
        useValue: procs.competitionGroups,
      },
      { provide: CompetitionsProcessor, useValue: procs.competitions },
      { provide: SppAwardValuesProcessor, useValue: procs.sppAwardValues },
      {
        provide: AdvancementCostsProcessor,
        useValue: procs.advancementCosts,
      },
      { provide: TrophiesProcessor, useValue: procs.trophies },
      { provide: TrophyAwardsProcessor, useValue: procs.trophyAwards },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();

  return {
    service: moduleRef.get(ManualImportService),
    reader,
    externalSystems,
    procs,
    importResults,
  };
}

describe('ManualImportService', () => {
  it('sums processor counts and hands no errors to the result', async () => {
    const { service, importResults } = await makeService({
      counts: {
        rulesSets: 1,
        skills: 1,
        skillRulesSets: 1,
        keywords: 1,
        leagues: 1,
        eras: 2,
        races: 1,
        positionRulesSets: 1,
        positionRulesSetSkills: 1,
        coaches: 1,
        teams: 1,
        competitionGroups: 1,
        competitions: 1,
        sppAwardValues: 1,
        advancementCosts: 1,
        trophies: 1,
        trophyAwards: 1,
      },
    });

    await service.run('/data/dir');

    expect(resultArgs(importResults)).toEqual({ imported: 18, errors: [] });
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service } = await makeService();

    await expect(service.run('/data/dir')).resolves.toBe(CANNED_RESULT);
  });

  it('reads the directory, bootstraps, and shares one context across processors', async () => {
    const { service, reader, externalSystems, procs } = await makeService({});
    const systemIds = new Map([['Name', 2]]);
    externalSystems.bootstrap.mockResolvedValue(systemIds);

    await service.run('/data/dir');

    expect(reader.read).toHaveBeenCalledWith('/data/dir');
    expect(externalSystems.bootstrap).toHaveBeenCalledTimes(1);
    const rulesCtx = procs.rulesSets.process.mock.calls[0][0];
    const teamsCtx = procs.teams.process.mock.calls[0][0];
    expect(teamsCtx.errors).toBe(rulesCtx.errors);
    const ctx = rulesCtx;
    expect(ctx).not.toHaveProperty('idMap');
    expect(ctx.systemIds).toBe(systemIds);
    expect(ctx.errors).toEqual([]);
  });

  it('runs processors in dependency order', async () => {
    const order: string[] = [];
    const { service, procs } = await makeService({});
    procs.rulesSets.process.mockImplementation(() => {
      order.push('rulesSets');
      return Promise.resolve(0);
    });
    procs.skills.process.mockImplementation(() => {
      order.push('skills');
      return Promise.resolve(0);
    });
    procs.skillRulesSets.process.mockImplementation(() => {
      order.push('skillRulesSets');
      return Promise.resolve(0);
    });
    procs.keywords.process.mockImplementation(() => {
      order.push('keywords');
      return Promise.resolve(0);
    });
    procs.leagues.process.mockImplementation(() => {
      order.push('leagues');
      return Promise.resolve(0);
    });
    procs.eras.process.mockImplementation(() => {
      order.push('eras');
      return Promise.resolve(0);
    });
    procs.races.process.mockImplementation(() => {
      order.push('races');
      return Promise.resolve(0);
    });
    procs.positions.process.mockImplementation(() => {
      order.push('positions');
      return Promise.resolve(0);
    });
    procs.positionRulesSets.process.mockImplementation(() => {
      order.push('positionRulesSets');
      return Promise.resolve(0);
    });
    procs.positionRulesSetSkills.process.mockImplementation(() => {
      order.push('positionRulesSetSkills');
      return Promise.resolve(0);
    });
    procs.coaches.process.mockImplementation(() => {
      order.push('coaches');
      return Promise.resolve(0);
    });
    procs.teams.process.mockImplementation(() => {
      order.push('teams');
      return Promise.resolve(0);
    });
    procs.competitionGroups.process.mockImplementation(() => {
      order.push('competitionGroups');
      return Promise.resolve(0);
    });
    procs.competitions.process.mockImplementation(() => {
      order.push('competitions');
      return Promise.resolve(0);
    });
    procs.sppAwardValues.process.mockImplementation(() => {
      order.push('sppAwardValues');
      return Promise.resolve(0);
    });
    procs.advancementCosts.process.mockImplementation(() => {
      order.push('advancementCosts');
      return Promise.resolve(0);
    });
    procs.trophies.process.mockImplementation(() => {
      order.push('trophies');
      return Promise.resolve(0);
    });
    procs.trophyAwards.process.mockImplementation(() => {
      order.push('trophyAwards');
      return Promise.resolve(0);
    });

    await service.run('/data/dir');

    expect(order).toEqual([
      'rulesSets',
      'skills',
      'skillRulesSets',
      'keywords',
      'leagues',
      'eras',
      'races',
      'positions',
      'positionRulesSets',
      'positionRulesSetSkills',
      'coaches',
      'teams',
      'competitionGroups',
      'competitions',
      'sppAwardValues',
      'advancementCosts',
      'trophies',
      'trophyAwards',
    ]);
  });

  it("hands a processor's collected error to the result", async () => {
    const { service, importResults } = await makeService({
      counts: { rulesSets: 1 },
      errorFrom: { processor: 'eras', message: 'unresolved league' },
    });

    await service.run('/data/dir');

    expect(resultArgs(importResults).errors).toEqual([
      { item: {}, message: 'unresolved league' },
    ]);
  });

  it('propagates a bootstrap failure (thrown, not collected)', async () => {
    const { service } = await makeService({
      bootstrap: () => Promise.reject(new Error('api down')),
    });

    await expect(service.run('/data/dir')).rejects.toThrow('api down');
  });
});
