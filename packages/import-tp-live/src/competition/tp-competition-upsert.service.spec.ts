import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { ExternalSystem } from '@blood-bowl-tracker/db';
import type { CompetitionWithTeamEras } from '@blood-bowl-tracker/game-data';
import {
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { upsertedCompetition } from './tp-competition.test-helpers';
import { TpCompetitionSpanService } from './tp-competition-span.service';
import type { TpCompetitionTournament } from './tp-competition-upsert.service';
import { TpCompetitionUpsertService } from './tp-competition-upsert.service';

const TOURNAMENT: TpCompetitionTournament = {
  id: 18442,
  name: 'tLoEGBBL Säsong 30',
};
const DATES = [new Date('2026-01-10'), new Date('2026-06-20')];

describe('TpCompetitionUpsertService', () => {
  let service: TpCompetitionUpsertService;
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
    competitions.resolve.mockResolvedValue({ found: false });
    eras.resolve.mockResolvedValue({ found: true, id: 40 });
    span.derive.mockReturnValue({
      type: 'season',
      startDate: '2026-01-10',
      endDate: '2026-06-20',
    });
    competitions.upsert.mockResolvedValue({
      competition: mock<CompetitionWithTeamEras>({
        id: 12,
        eraId: 40,
        competitionGroupId: 7,
      }),
      created: false,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionUpsertService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: ExternalSystemsService, useValue: externalSystems },
        { provide: ErasService, useValue: eras },
        { provide: CompetitionsService, useValue: competitions },
        { provide: TpCompetitionSpanService, useValue: span },
      ],
    }).compile();
    service = moduleRef.get(TpCompetitionUpsertService);
  });

  const upsert = (externalSystemName = 'TP') =>
    service.upsertCompetition({
      tournament: TOURNAMENT,
      playedDates: DATES,
      era: 'Fourth era',
      externalSystemName,
      errors,
    });

  it('upserts a new competition by TP id with its name, era, type and dates, and no group', async () => {
    await expect(upsert()).resolves.toEqual(upsertedCompetition());
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

  it('registers the TP system under the name it is given', async () => {
    await upsert('tourplay');

    expect(externalSystems.upsert).toHaveBeenCalledWith({
      name: 'tourplay',
      category: 'imported_data_source',
    });
  });

  it('leaves era, type and dates untouched when the competition is already imported', async () => {
    competitions.resolve.mockResolvedValue({ found: true, id: 12 });

    await expect(upsert()).resolves.toEqual(upsertedCompetition());
    expect(eras.resolve).not.toHaveBeenCalled();
    expect(span.derive).not.toHaveBeenCalled();
    expect(competitions.upsert).toHaveBeenCalledWith({
      name: 'tLoEGBBL Säsong 30',
      teamEraIds: [],
      externalIds: [{ externalSystemId: 1, externalId: '18442' }],
    });
    expect(errors).toEqual([]);
  });

  it('records one error when the TP system cannot be set up', async () => {
    externalSystems.upsert.mockRejectedValue(new Error('db down'));

    await expect(upsert()).resolves.toBeUndefined();
    expect(errors).toEqual([
      { item: { externalSystems: ['TP'] }, message: 'db down' },
    ]);
  });

  it('records one error naming the era when it does not exist', async () => {
    eras.resolve.mockResolvedValue({ found: false });

    await expect(upsert()).resolves.toBeUndefined();
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

    await expect(upsert()).resolves.toBeUndefined();
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

    await expect(upsert()).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { competition: 18442 },
        message:
          'Failed to upsert competition "tLoEGBBL Säsong 30" (TP id 18442): competition_group_id is required',
      },
    ]);
  });
});
