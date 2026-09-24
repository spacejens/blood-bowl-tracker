import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import {
  COMPETITION_TP_ID,
  upsertedCompetition,
} from './tp-competition.test-helpers';
import type { ImportCompetitionOptions } from './tp-competition-import.service';
import { TpCompetitionImportService } from './tp-competition-import.service';
import { TpCompetitionParticipantsService } from './tp-competition-participants.service';
import { TpCompetitionTrophyAwardsService } from './tp-competition-trophy-awards.service';
import { TpCompetitionUpsertService } from './tp-competition-upsert.service';

const nothing: ImportResult = { success: true, imported: 0, errors: [] };
const one: ImportResult = { success: true, imported: 1, errors: [] };
const AWARD: TpAward = { id: 1, awardType: 1, rosterId: 163386 };
const OPTIONS: ImportCompetitionOptions = {
  tournament: { id: COMPETITION_TP_ID, name: 'Säsong 30' },
  playedDates: [new Date('2026-01-10')],
  era: 'Fourth era',
  participantRosterIds: [163386],
  awards: [AWARD],
  externalSystemName: 'TP',
};
const failure: ImportError = { item: 1, message: 'boom' };

describe('TpCompetitionImportService', () => {
  let service: TpCompetitionImportService;
  let upsert: MockProxy<TpCompetitionUpsertService>;
  let participants: MockProxy<TpCompetitionParticipantsService>;
  let trophyAwards: MockProxy<TpCompetitionTrophyAwardsService>;

  beforeEach(async () => {
    upsert = mock<TpCompetitionUpsertService>();
    participants = mock<TpCompetitionParticipantsService>();
    trophyAwards = mock<TpCompetitionTrophyAwardsService>();
    upsert.upsertCompetition.mockResolvedValue(upsertedCompetition());
    participants.linkParticipants.mockResolvedValue(new Map([[163386, 31]]));
    trophyAwards.importAwards.mockResolvedValue(1);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionImportService,
        TpImportResultsService,
        { provide: TpCompetitionUpsertService, useValue: upsert },
        {
          provide: TpCompetitionParticipantsService,
          useValue: participants,
        },
        {
          provide: TpCompetitionTrophyAwardsService,
          useValue: trophyAwards,
        },
      ],
    }).compile();
    service = moduleRef.get(TpCompetitionImportService);
  });

  it('upserts the competition, links its teams, then records its awards', async () => {
    await expect(service.importCompetition(OPTIONS)).resolves.toEqual({
      competition: one,
      participation: one,
      trophyAwards: one,
    });
    expect(upsert.upsertCompetition).toHaveBeenCalledWith({
      tournament: OPTIONS.tournament,
      playedDates: OPTIONS.playedDates,
      era: 'Fourth era',
      externalSystemName: 'TP',
      errors: [],
    });
    expect(participants.linkParticipants).toHaveBeenCalledWith({
      competition: upsertedCompetition(),
      participantRosterIds: [163386],
      errors: [],
    });
    expect(trophyAwards.importAwards).toHaveBeenCalledWith({
      competition: upsertedCompetition(),
      awards: [AWARD],
      teamEraIdsByRosterId: new Map([[163386, 31]]),
      errors: [],
    });
  });

  it('reports a failed upsert and attempts nothing else', async () => {
    upsert.upsertCompetition.mockImplementation(({ errors }) => {
      errors.push(failure);
      return Promise.resolve(undefined);
    });

    await expect(service.importCompetition(OPTIONS)).resolves.toEqual({
      competition: { success: false, imported: 0, errors: [failure] },
      participation: nothing,
      trophyAwards: nothing,
    });
    expect(participants.linkParticipants).not.toHaveBeenCalled();
    expect(trophyAwards.importAwards).not.toHaveBeenCalled();
  });

  it('reports a failed team link and records no awards', async () => {
    participants.linkParticipants.mockImplementation(({ errors }) => {
      errors.push(failure);
      return Promise.resolve(undefined);
    });

    await expect(service.importCompetition(OPTIONS)).resolves.toEqual({
      competition: one,
      participation: { success: false, imported: 0, errors: [failure] },
      trophyAwards: nothing,
    });
    expect(trophyAwards.importAwards).not.toHaveBeenCalled();
  });

  it("reports each stage's own errors in that stage", async () => {
    participants.linkParticipants.mockImplementation(({ errors }) => {
      errors.push(failure);
      return Promise.resolve(new Map([[163386, 31]]));
    });
    trophyAwards.importAwards.mockImplementation(({ errors }) => {
      errors.push(failure);
      return Promise.resolve(0);
    });

    await expect(service.importCompetition(OPTIONS)).resolves.toEqual({
      competition: one,
      participation: { success: false, imported: 1, errors: [failure] },
      trophyAwards: { success: false, imported: 0, errors: [failure] },
    });
  });
});
