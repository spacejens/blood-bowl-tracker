import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { ExternalSystem } from '@blood-bowl-tracker/db';
import type { CompetitionWithTeamEras } from '@blood-bowl-tracker/game-data';
import {
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
} from '@blood-bowl-tracker/game-data';
import type { TpTournament } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpCompetitionSpanService } from './tp-competition-span.service';
import { TpLiveCompetitionUpsertService } from './tp-live-competition-upsert.service';

const TOURNAMENT: TpTournament = {
  id: 18442,
  name: 'tLoEGBBL Säsong 30',
  ruleSet: 25,
  phases: [],
};
const DATES = [new Date('2026-01-10'), new Date('2026-06-20')];

describe('TpLiveCompetitionUpsertService', () => {
  let service: TpLiveCompetitionUpsertService;
  let externalSystems: MockProxy<ExternalSystemsService>;
  let eras: MockProxy<ErasService>;
  let competitions: MockProxy<CompetitionsService>;
  let span: MockProxy<TpCompetitionSpanService>;
  let errors: ImportError[];

  beforeEach(async () => {
    externalSystems = mock<ExternalSystemsService>();
    eras = mock<ErasService>();
    competitions = mock<CompetitionsService>();
    span = mock<TpCompetitionSpanService>();
    errors = [];
    externalSystems.upsert.mockResolvedValue({
      system: mock<ExternalSystem>({ id: 1 }),
      created: false,
    });
    eras.resolve.mockResolvedValue({ found: true, id: 40 });
    span.derive.mockReturnValue({
      type: 'season',
      startDate: '2026-01-10',
      endDate: '2026-06-20',
    });
    competitions.upsert.mockResolvedValue({
      competition: mock<CompetitionWithTeamEras>({ id: 12 }),
      created: false,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveCompetitionUpsertService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: ExternalSystemsService, useValue: externalSystems },
        { provide: ErasService, useValue: eras },
        { provide: CompetitionsService, useValue: competitions },
        { provide: TpCompetitionSpanService, useValue: span },
      ],
    }).compile();
    service = moduleRef.get(TpLiveCompetitionUpsertService);
  });

  const upsert = () =>
    service.upsertCompetition({
      tournament: TOURNAMENT,
      playedDates: DATES,
      era: 'Fourth era',
      errors,
    });

  it('upserts the competition by TP id with its name, era, type and dates, and no group', async () => {
    await expect(upsert()).resolves.toBe(true);
    expect(externalSystems.upsert).toHaveBeenCalledWith({
      name: 'TP',
      category: 'imported_data_source',
    });
    expect(eras.resolve).toHaveBeenCalledWith({
      externalSystemId: 1,
      externalId: 'Fourth era',
    });
    expect(span.derive).toHaveBeenCalledWith(DATES);
    expect(competitions.upsert).toHaveBeenCalledWith({
      name: 'tLoEGBBL Säsong 30',
      type: 'season',
      eraId: 40,
      startDate: '2026-01-10',
      endDate: '2026-06-20',
      teamEraIds: [],
      externalIds: [{ externalSystemId: 1, externalId: '18442' }],
    });
    expect(errors).toEqual([]);
  });

  it('records one error when the TP system cannot be set up', async () => {
    externalSystems.upsert.mockRejectedValue(new Error('db down'));

    await expect(upsert()).resolves.toBe(false);
    expect(errors).toEqual([
      { item: { externalSystems: ['TP'] }, message: 'db down' },
    ]);
  });

  it('records one error naming the era when it does not exist', async () => {
    eras.resolve.mockResolvedValue({ found: false });

    await expect(upsert()).resolves.toBe(false);
    expect(errors).toEqual([
      {
        item: { competition: 18442, era: 'Fourth era' },
        message:
          'Skipping competition "tLoEGBBL Säsong 30": era "Fourth era" does not exist.',
      },
    ]);
    expect(competitions.upsert).not.toHaveBeenCalled();
  });

  it('records one error when no fixture is dated', async () => {
    span.derive.mockReturnValue(undefined);

    await expect(upsert()).resolves.toBe(false);
    expect(errors).toEqual([
      {
        item: { competition: 18442 },
        message:
          'Skipping competition "tLoEGBBL Säsong 30": no dated matches found.',
      },
    ]);
  });

  it('records one error when the upsert fails, such as a new competition with no curated group', async () => {
    competitions.upsert.mockRejectedValue(
      new Error('competition_group_id is required'),
    );

    await expect(upsert()).resolves.toBe(false);
    expect(errors).toEqual([
      {
        item: { competition: 18442 },
        message:
          'Failed to upsert competition "tLoEGBBL Säsong 30" (TP id 18442): competition_group_id is required',
      },
    ]);
  });
});
