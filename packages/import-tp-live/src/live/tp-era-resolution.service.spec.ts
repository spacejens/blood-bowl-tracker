import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { ExternalSystem } from '@blood-bowl-tracker/db';
import {
  ErasService,
  ExternalSystemsService,
  RacesService,
} from '@blood-bowl-tracker/game-data';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpEraResolutionService } from './tp-era-resolution.service';

const TP_SYSTEM_ID = 1;
const EXTERNAL_SYSTEM_NAME = 'some-external-system';

const roster: TpRoster = {
  id: 163386,
  teamName: 'Da Boyz',
  teamRaceCode: 'orc',
  raceName: 'Orc',
  coachTpId: 'c-42',
  coachName: 'Grimgor',
  positions: [],
  starPositions: [],
  players: [],
};

describe('TpEraResolutionService', () => {
  let service: TpEraResolutionService;
  let externalSystems: MockProxy<ExternalSystemsService>;
  let eras: MockProxy<ErasService>;
  let races: MockProxy<RacesService>;
  let errors: ImportError[];

  beforeEach(async () => {
    externalSystems = mock<ExternalSystemsService>();
    eras = mock<ErasService>();
    races = mock<RacesService>();
    errors = [];
    externalSystems.upsert.mockResolvedValue({
      system: mock<ExternalSystem>({ id: TP_SYSTEM_ID }),
      created: false,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpEraResolutionService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: ExternalSystemsService, useValue: externalSystems },
        { provide: ErasService, useValue: eras },
        { provide: RacesService, useValue: races },
      ],
    }).compile();
    service = moduleRef.get(TpEraResolutionService);
  });

  it('uses an explicitly given era once it validates against the DB', async () => {
    eras.resolve.mockResolvedValue({ found: true, id: 40 });

    await expect(
      service.resolveEra({
        roster,
        era: 'Fourth era',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        errors,
      }),
    ).resolves.toBe('Fourth era');
    expect(eras.resolve).toHaveBeenCalledWith({
      externalSystemId: TP_SYSTEM_ID,
      externalId: 'Fourth era',
    });
    expect(externalSystems.upsert).toHaveBeenCalledWith({
      name: EXTERNAL_SYSTEM_NAME,
      category: 'imported_data_source',
    });
    expect(errors).toEqual([]);
  });

  it('records one error when the explicitly given era does not exist', async () => {
    eras.resolve.mockResolvedValue({ found: false });

    await expect(
      service.resolveEra({
        roster,
        era: 'Ghost era',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        errors,
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { team: 163386, era: 'Ghost era' },
        message:
          'Could not resolve an era for team "Da Boyz": era "Ghost era" does not exist',
      },
    ]);
  });

  it("resolves the race's single ongoing era", async () => {
    races.resolve.mockResolvedValue({ found: true, id: 7 });
    races.listOngoingEras.mockResolvedValue([{ id: 40, name: 'Fourth era' }]);

    await expect(
      service.resolveEra({
        roster,
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        errors,
      }),
    ).resolves.toBe('Fourth era');
    expect(races.resolve).toHaveBeenCalledWith({
      externalSystemId: TP_SYSTEM_ID,
      externalId: 'orc',
    });
    expect(races.listOngoingEras).toHaveBeenCalledWith(7);
  });

  it('records one error when the race is in no ongoing era', async () => {
    races.resolve.mockResolvedValue({ found: true, id: 7 });
    races.listOngoingEras.mockResolvedValue([]);

    await expect(
      service.resolveEra({
        roster,
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        errors,
      }),
    ).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe(
      'Could not resolve an era for team "Da Boyz": race "Orc" has no ongoing era',
    );
  });

  it('records one error naming every era when the race is in several ongoing eras', async () => {
    // A race belongs to Dungeon Bowl or to normal play, never both, so this
    // models the genuine ambiguity: the race is linked to two overlapping
    // normal eras, not a normal era plus a Dungeon Bowl one.
    races.resolve.mockResolvedValue({ found: true, id: 7 });
    races.listOngoingEras.mockResolvedValue([
      { id: 40, name: 'Fourth era' },
      { id: 41, name: 'Fifth era' },
    ]);

    await expect(
      service.resolveEra({
        roster,
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        errors,
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: {
          team: 163386,
          teamRaceCode: 'orc',
          ongoingEras: ['Fourth era', 'Fifth era'],
        },
        message:
          'Could not resolve an era for team "Da Boyz": race "Orc" is in several ongoing eras (Fourth era, Fifth era); the era must be specified explicitly',
      },
    ]);
  });

  it('records one error when the race cannot be resolved', async () => {
    races.resolve.mockResolvedValue({ found: false });

    await expect(
      service.resolveEra({
        roster,
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        errors,
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { team: 163386, teamRaceCode: 'orc' },
        message:
          'Could not resolve an era for team "Da Boyz": could not resolve race for code "orc"',
      },
    ]);
    expect(races.listOngoingEras).not.toHaveBeenCalled();
  });

  it('records one error when the external system cannot be set up', async () => {
    externalSystems.upsert.mockRejectedValue(new Error('db down'));

    await expect(
      service.resolveEra({
        roster,
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        errors,
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      { item: { externalSystems: [EXTERNAL_SYSTEM_NAME] }, message: 'db down' },
    ]);
  });

  it('records one error naming the race when listing its ongoing eras fails', async () => {
    races.resolve.mockResolvedValue({ found: true, id: 7 });
    races.listOngoingEras.mockRejectedValue(new Error('boom'));

    await expect(
      service.resolveEra({
        roster,
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        errors,
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { race: 7, ongoingEras: 'list' },
        message: 'Failed to list ongoing eras for race 7: boom',
      },
    ]);
  });
});
