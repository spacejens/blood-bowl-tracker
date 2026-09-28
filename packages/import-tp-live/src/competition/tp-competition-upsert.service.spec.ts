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
import { TpCompetitionClassifierService } from './tp-competition-classifier.service';
import { TpCompetitionSpanService } from './tp-competition-span.service';
import type { TpCompetitionTournament } from './tp-competition-upsert.service';
import { TpCompetitionUpsertService } from './tp-competition-upsert.service';

const TOURNAMENT: TpCompetitionTournament = {
  id: 18442,
  name: 'tLoEGBBL Säsong 30',
};
const DATES = [new Date('2026-01-10'), new Date('2026-06-20')];

const storedCompetition = (startDate: string, endDate: string | null) => ({
  id: 12,
  name: 'Major Season 30',
  type: 'season' as const,
  eraId: 40,
  startDate,
  endDate,
});

describe('TpCompetitionUpsertService', () => {
  let service: TpCompetitionUpsertService;
  let externalSystems: MockProxy<ExternalSystemsService>;
  let eras: MockProxy<ErasService>;
  let competitions: MockProxy<CompetitionsService>;
  let span: MockProxy<TpCompetitionSpanService>;
  let classifier: MockProxy<TpCompetitionClassifierService>;
  let errors: ImportError[];

  beforeEach(async () => {
    externalSystems = mock<ExternalSystemsService>();
    eras = mock<ErasService>();
    competitions = mock<CompetitionsService>();
    span = mock<TpCompetitionSpanService>();
    classifier = mock<TpCompetitionClassifierService>();
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
    classifier.classifyNew.mockResolvedValue({
      kind: 'classified',
      competitionGroupId: 7,
      name: 'Major Season 30',
      type: undefined,
    });
    classifier.sharedTypeOfCompetitionGroup.mockResolvedValue(undefined);
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
        { provide: TpCompetitionClassifierService, useValue: classifier },
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

  const overlay = (playedDates: Date[]) =>
    service.upsertCompetition({
      tournament: TOURNAMENT,
      playedDates,
      era: 'Fourth era',
      externalSystemName: 'TP',
      overlayExisting: true,
      errors,
    });

  it('creates a new competition under its matched group, with the derived name, era, type and dates', async () => {
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
    expect(classifier.classifyNew).toHaveBeenCalledWith('tLoEGBBL Säsong 30');
    expect(competitions.findById).not.toHaveBeenCalled();
    expect(competitions.upsert).toHaveBeenCalledWith({
      name: 'Major Season 30',
      competitionGroupId: 7,
      type: 'season',
      eraId: 40,
      startDate: '2026-01-10',
      endDate: '2026-06-20',
      teamEraIds: [],
      externalIds: [{ externalSystemId: 1, externalId: '18442' }],
    });
    expect(errors).toEqual([]);
  });

  it("types a new competition by its group's shared type over the date span's", async () => {
    // A season imported after its first match day spans a single day, which
    // the date heuristic alone would call a cup.
    span.derive.mockReturnValue({
      type: 'cup',
      startDate: '2026-01-10',
      endDate: '2026-01-10',
    });
    classifier.classifyNew.mockResolvedValue({
      kind: 'classified',
      competitionGroupId: 7,
      name: 'Major Season 30',
      type: 'season',
    });

    await upsert();

    expect(competitions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'season' }),
    );
  });

  it("falls back to the date span's type when the group has no shared type", async () => {
    span.derive.mockReturnValue({
      type: 'cup',
      startDate: '2026-01-10',
      endDate: '2026-01-10',
    });

    await upsert();

    expect(competitions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cup' }),
    );
  });

  it('records one error, and upserts nothing, when no group matches a new competition', async () => {
    classifier.classifyNew.mockResolvedValue({ kind: 'unmatched' });

    await expect(upsert()).resolves.toBeUndefined();
    expect(competitions.upsert).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { competition: 18442 },
        message:
          'Skipping competition "tLoEGBBL Säsong 30": no competition group could be confidently matched.',
      },
    ]);
  });

  it('records one error naming the groups, and upserts nothing, when several groups match', async () => {
    classifier.classifyNew.mockResolvedValue({
      kind: 'ambiguous',
      groupNames: ['Major Season', 'Minor Season'],
    });

    await expect(upsert()).resolves.toBeUndefined();
    expect(competitions.upsert).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { competition: 18442 },
        message:
          'Skipping competition "tLoEGBBL Säsong 30": matched multiple competition groups (Major Season, Minor Season).',
      },
    ]);
  });

  it('reports whether the upsert created the competition', async () => {
    competitions.upsert.mockResolvedValue({
      competition: mock<CompetitionWithTeamEras>({
        id: 12,
        eraId: 40,
        competitionGroupId: 7,
      }),
      created: true,
    });

    await expect(upsert()).resolves.toEqual(
      upsertedCompetition({ created: true }),
    );
  });

  it('registers the TP system under the name it is given', async () => {
    await upsert('tourplay');

    expect(externalSystems.upsert).toHaveBeenCalledWith({
      name: 'tourplay',
      category: 'imported_data_source',
    });
  });

  it('leaves era, type, dates and group untouched when the competition is already imported', async () => {
    competitions.resolve.mockResolvedValue({ found: true, id: 12 });

    await expect(upsert()).resolves.toEqual(upsertedCompetition());
    expect(eras.resolve).not.toHaveBeenCalled();
    expect(span.derive).not.toHaveBeenCalled();
    expect(competitions.findById).not.toHaveBeenCalled();
    expect(classifier.classifyNew).not.toHaveBeenCalled();
    expect(classifier.sharedTypeOfCompetitionGroup).not.toHaveBeenCalled();
    expect(competitions.upsert).toHaveBeenCalledWith({
      name: 'tLoEGBBL Säsong 30',
      teamEraIds: [],
      externalIds: [{ externalSystemId: 1, externalId: '18442' }],
    });
    expect(errors).toEqual([]);
  });

  it('overlays era, type and dates on an already-imported competition when asked, without reclassifying it', async () => {
    competitions.resolve.mockResolvedValue({ found: true, id: 12 });
    competitions.findById.mockResolvedValue(
      storedCompetition('2026-01-10', '2026-06-20'),
    );

    await expect(overlay(DATES)).resolves.toEqual(upsertedCompetition());
    expect(eras.resolve).toHaveBeenCalledWith({
      externalSystemId: 1,
      externalId: 'Fourth era',
    });
    expect(competitions.findById).toHaveBeenCalledWith(12);
    expect(span.derive).toHaveBeenCalledWith([
      ...DATES,
      new Date('2026-01-10'),
      new Date('2026-06-20'),
    ]);
    expect(classifier.classifyNew).not.toHaveBeenCalled();
    expect(classifier.sharedTypeOfCompetitionGroup).toHaveBeenCalledWith(12);
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

  it("overlays the type its group shares over the date span's", async () => {
    competitions.resolve.mockResolvedValue({ found: true, id: 12 });
    competitions.findById.mockResolvedValue(
      storedCompetition('2026-01-10', '2026-01-11'),
    );
    span.derive.mockReturnValue({
      type: 'cup',
      startDate: '2026-01-10',
      endDate: '2026-01-11',
    });
    classifier.sharedTypeOfCompetitionGroup.mockResolvedValue('season');

    await overlay([new Date('2026-01-11')]);

    expect(competitions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'season' }),
    );
  });

  // Zero new played dates means no new information about the competition at
  // all, so era, type and dates are all left exactly as stored rather than
  // re-resolved or recomputed from a merge that could misclassify or falsely
  // close an ongoing one.
  it('keeps the stored era, type and dates when overlaying a competition with no new dated matches', async () => {
    competitions.resolve.mockResolvedValue({ found: true, id: 12 });

    await expect(overlay([])).resolves.toEqual(upsertedCompetition());
    expect(eras.resolve).not.toHaveBeenCalled();
    expect(span.derive).not.toHaveBeenCalled();
    expect(competitions.findById).not.toHaveBeenCalled();
    expect(classifier.sharedTypeOfCompetitionGroup).not.toHaveBeenCalled();
    expect(competitions.upsert).toHaveBeenCalledWith({
      name: 'tLoEGBBL Säsong 30',
      teamEraIds: [],
      externalIds: [{ externalSystemId: 1, externalId: '18442' }],
    });
    expect(errors).toEqual([]);
  });

  it('widens the stored date range with newly observed match dates', async () => {
    competitions.resolve.mockResolvedValue({ found: true, id: 12 });
    competitions.findById.mockResolvedValue(
      storedCompetition('2026-01-10', '2026-03-01'),
    );
    const earlier = new Date('2025-12-20');
    const later = new Date('2026-04-15');

    await overlay([earlier, later]);

    expect(span.derive).toHaveBeenCalledWith([
      earlier,
      later,
      new Date('2026-01-10'),
      new Date('2026-03-01'),
    ]);
  });

  it('adds only the stored start date when the stored competition has no end date', async () => {
    competitions.resolve.mockResolvedValue({ found: true, id: 12 });
    competitions.findById.mockResolvedValue(
      storedCompetition('2026-01-10', null),
    );
    const played = [new Date('2026-02-01')];

    await overlay(played);

    expect(span.derive).toHaveBeenCalledWith([
      ...played,
      new Date('2026-01-10'),
    ]);
    expect(errors).toEqual([]);
  });

  it('records one error when the resolved competition cannot be read back by id', async () => {
    competitions.resolve.mockResolvedValue({ found: true, id: 12 });
    competitions.findById.mockResolvedValue(undefined);

    await expect(overlay(DATES)).resolves.toBeUndefined();
    expect(span.derive).not.toHaveBeenCalled();
    expect(competitions.upsert).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { competition: 18442 },
        message:
          'Skipping competition "tLoEGBBL Säsong 30": stored competition could not be read back after being resolved.',
      },
    ]);
  });

  it('records one error, rather than rejecting, when reading the stored competition back fails', async () => {
    competitions.resolve.mockResolvedValue({ found: true, id: 12 });
    competitions.findById.mockRejectedValue(new Error('db down'));

    await expect(overlay(DATES)).resolves.toBeUndefined();
    expect(span.derive).not.toHaveBeenCalled();
    expect(competitions.upsert).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { competition: 18442 },
        message: 'Skipping competition "tLoEGBBL Säsong 30": db down',
      },
    ]);
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
    expect(classifier.classifyNew).not.toHaveBeenCalled();
    expect(competitions.upsert).not.toHaveBeenCalled();
  });

  it('records one error when no fixture is dated', async () => {
    // A competition not yet stored has no stored dates to fall back on.
    span.derive.mockReturnValue(undefined);

    await expect(upsert()).resolves.toBeUndefined();
    expect(competitions.findById).not.toHaveBeenCalled();
    expect(classifier.classifyNew).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { competition: 18442 },
        message:
          'Skipping competition "tLoEGBBL Säsong 30": no dated matches found.',
      },
    ]);
  });

  it('records one error when the upsert fails', async () => {
    competitions.upsert.mockRejectedValue(new Error('db down'));

    await expect(upsert()).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { competition: 18442 },
        message:
          'Failed to upsert competition "tLoEGBBL Säsong 30" (TP id 18442): db down',
      },
    ]);
  });
});
