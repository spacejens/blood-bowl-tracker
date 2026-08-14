import { ImportResultService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ManualDataReader } from '../data-file/manual-data-reader.service';
import { CoachesProcessor } from '../entities/coaches.processor';
import { CompetitionsProcessor } from '../entities/competitions.processor';
import { ErasProcessor } from '../entities/eras.processor';
import { ExternalSystemsProcessor } from '../entities/external-systems.processor';
import { LeaguesProcessor } from '../entities/leagues.processor';
import { PositionsProcessor } from '../entities/positions.processor';
import { RacesProcessor } from '../entities/races.processor';
import { RulesSetsProcessor } from '../entities/rules-sets.processor';
import { SppAwardValuesProcessor } from '../entities/spp-award-values.processor';
import { TeamsProcessor } from '../entities/teams.processor';
import type { ProcessContext } from '../references/process-context';
import { ManualImportService } from './manual-import.service';

function emptyData(): ManualDataFile {
  return {
    externalSystems: [],
    rulesSets: [],
    leagues: [],
    eras: [],
    races: [],
    positions: [],
    coaches: [],
    teams: [],
    competitions: [],
    sppAwardValues: [],
    trophies: [],
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
  leagues: MockProxy<LeaguesProcessor>;
  eras: MockProxy<ErasProcessor>;
  races: MockProxy<RacesProcessor>;
  positions: MockProxy<PositionsProcessor>;
  coaches: MockProxy<CoachesProcessor>;
  teams: MockProxy<TeamsProcessor>;
  competitions: MockProxy<CompetitionsProcessor>;
  sppAwardValues: MockProxy<SppAwardValuesProcessor>;
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
    leagues: mock<LeaguesProcessor>(),
    eras: mock<ErasProcessor>(),
    races: mock<RacesProcessor>(),
    positions: mock<PositionsProcessor>(),
    coaches: mock<CoachesProcessor>(),
    teams: mock<TeamsProcessor>(),
    competitions: mock<CompetitionsProcessor>(),
    sppAwardValues: mock<SppAwardValuesProcessor>(),
  };
  procs.rulesSets.process.mockImplementation(
    processImpl('rulesSets', overrides),
  );
  procs.leagues.process.mockImplementation(processImpl('leagues', overrides));
  procs.eras.process.mockImplementation(processImpl('eras', overrides));
  procs.races.process.mockImplementation(processImpl('races', overrides));
  procs.positions.process.mockImplementation(
    processImpl('positions', overrides),
  );
  procs.coaches.process.mockImplementation(processImpl('coaches', overrides));
  procs.teams.process.mockImplementation(processImpl('teams', overrides));
  procs.competitions.process.mockImplementation(
    processImpl('competitions', overrides),
  );
  procs.sppAwardValues.process.mockImplementation(
    processImpl('sppAwardValues', overrides),
  );

  const importResults = mock<ImportResultService>();
  importResults.result.mockImplementation(({ imported, errors }) => ({
    success: errors.length === 0,
    imported,
    errors,
  }));

  const moduleRef = await Test.createTestingModule({
    providers: [
      ManualImportService,
      { provide: ManualDataReader, useValue: reader },
      { provide: ExternalSystemsProcessor, useValue: externalSystems },
      { provide: RulesSetsProcessor, useValue: procs.rulesSets },
      { provide: LeaguesProcessor, useValue: procs.leagues },
      { provide: ErasProcessor, useValue: procs.eras },
      { provide: RacesProcessor, useValue: procs.races },
      { provide: PositionsProcessor, useValue: procs.positions },
      { provide: CoachesProcessor, useValue: procs.coaches },
      { provide: TeamsProcessor, useValue: procs.teams },
      { provide: CompetitionsProcessor, useValue: procs.competitions },
      { provide: SppAwardValuesProcessor, useValue: procs.sppAwardValues },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();

  return {
    service: moduleRef.get(ManualImportService),
    reader,
    externalSystems,
    procs,
  };
}

describe('ManualImportService', () => {
  it('sums processor counts and reports success when there are no errors', async () => {
    const { service } = await makeService({
      counts: {
        rulesSets: 1,
        leagues: 1,
        eras: 2,
        races: 1,
        coaches: 1,
        teams: 1,
        competitions: 1,
        sppAwardValues: 1,
      },
    });

    const result = await service.run('/data/dir');

    expect(result.imported).toBe(9);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reads the directory, bootstraps, and shares one context/id-map across processors', async () => {
    const { service, reader, externalSystems, procs } = await makeService({});

    await service.run('/data/dir');

    expect(reader.read).toHaveBeenCalledWith('/data/dir');
    expect(externalSystems.bootstrap).toHaveBeenCalledTimes(1);
    const rulesCtx = procs.rulesSets.process.mock.calls[0][0];
    const teamsCtx = procs.teams.process.mock.calls[0][0];
    expect(teamsCtx.idMap).toBe(rulesCtx.idMap);
    expect(teamsCtx.errors).toBe(rulesCtx.errors);
  });

  it('runs processors in dependency order', async () => {
    const order: string[] = [];
    const { service, procs } = await makeService({});
    procs.rulesSets.process.mockImplementation(() => {
      order.push('rulesSets');
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
    procs.coaches.process.mockImplementation(() => {
      order.push('coaches');
      return Promise.resolve(0);
    });
    procs.teams.process.mockImplementation(() => {
      order.push('teams');
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

    await service.run('/data/dir');

    expect(order).toEqual([
      'rulesSets',
      'leagues',
      'eras',
      'races',
      'positions',
      'coaches',
      'teams',
      'competitions',
      'sppAwardValues',
    ]);
  });

  it('reports failure when a processor collected an error', async () => {
    const { service } = await makeService({
      counts: { rulesSets: 1 },
      errorFrom: { processor: 'eras', message: 'unresolved league' },
    });

    const result = await service.run('/data/dir');

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([{ item: {}, message: 'unresolved league' }]);
  });

  it('propagates a bootstrap failure (thrown, not collected)', async () => {
    const { service } = await makeService({
      bootstrap: () => Promise.reject(new Error('api down')),
    });

    await expect(service.run('/data/dir')).rejects.toThrow('api down');
  });
});
