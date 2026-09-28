import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { upsertedCompetition } from '../competition/tp-competition.test-helpers';
import { TpCompetitionParticipantsService } from '../competition/tp-competition-participants.service';
import { TpCompetitionTrophyAwardsService } from '../competition/tp-competition-trophy-awards.service';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpAwardsFetchService } from './tp-awards-fetch.service';
import { TpCompetitionParticipantsBackfillService } from './tp-competition-participants-backfill.service';
import { TpInscriptionsFetchService } from './tp-inscriptions-fetch.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';

const EXTERNAL_SYSTEM_NAME = 'some-external-system';

const nothing: ImportResult = { success: true, imported: 0, errors: [] };
const one: ImportResult = { success: true, imported: 1, errors: [] };
const teamImported: TpLiveTeamImportResult = {
  team: one,
  players: one,
  era: 'Fourth era',
  teamEra: { id: 31, eraId: 40 },
};
const teamNotImported: TpLiveTeamImportResult = {
  team: {
    success: false,
    imported: 0,
    errors: [{ item: 1, message: 'no coach' }],
  },
  players: nothing,
  era: undefined,
  teamEra: undefined,
};
const AWARD: TpAward = { id: 24112, awardType: 1, rosterId: 179769 };
const LINKED = new Map([
  [163386, 31],
  [179769, 32],
]);
const fetchFailure: ImportError = { item: 1, message: 'status 429' };

describe('TpCompetitionParticipantsBackfillService', () => {
  let service: TpCompetitionParticipantsBackfillService;
  let session: MockProxy<TpFetchSession>;
  let inscriptionsFetch: MockProxy<TpInscriptionsFetchService>;
  let awardsFetch: MockProxy<TpAwardsFetchService>;
  let teamImport: MockProxy<TpLiveTeamImportService>;
  let participants: MockProxy<TpCompetitionParticipantsService>;
  let trophyAwards: MockProxy<TpCompetitionTrophyAwardsService>;

  beforeEach(async () => {
    session = mock<TpFetchSession>();
    inscriptionsFetch = mock<TpInscriptionsFetchService>();
    awardsFetch = mock<TpAwardsFetchService>();
    teamImport = mock<TpLiveTeamImportService>();
    participants = mock<TpCompetitionParticipantsService>();
    trophyAwards = mock<TpCompetitionTrophyAwardsService>();
    inscriptionsFetch.fetchParticipantRosterIds.mockResolvedValue([
      163386, 179769,
    ]);
    teamImport.importTeam.mockResolvedValue(teamImported);
    participants.linkParticipants.mockResolvedValue(LINKED);
    awardsFetch.fetchAwards.mockResolvedValue([AWARD]);
    trophyAwards.importAwards.mockResolvedValue(1);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionParticipantsBackfillService,
        TpImportResultsService,
        { provide: TpInscriptionsFetchService, useValue: inscriptionsFetch },
        { provide: TpAwardsFetchService, useValue: awardsFetch },
        { provide: TpLiveTeamImportService, useValue: teamImport },
        { provide: TpCompetitionParticipantsService, useValue: participants },
        {
          provide: TpCompetitionTrophyAwardsService,
          useValue: trophyAwards,
        },
      ],
    }).compile();
    service = moduleRef.get(TpCompetitionParticipantsBackfillService);
  });

  describe('importRegisteredTeams', () => {
    const importRegisteredTeams = (era?: string) =>
      service.importRegisteredTeams({
        tournamentSlug: 's30',
        categoryIds: [22308],
        era,
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        session,
      });

    it('fetches the inscriptions, then imports each registered team in order, through the given session', async () => {
      await expect(importRegisteredTeams('Fourth era')).resolves.toEqual({
        rosterIds: [163386, 179769],
        teams: [
          { rosterId: 163386, ...teamImported },
          { rosterId: 179769, ...teamImported },
        ],
        errors: [],
      });
      expect(inscriptionsFetch.fetchParticipantRosterIds).toHaveBeenCalledWith({
        tournamentSlug: 's30',
        categoryIds: [22308],
        errors: [],
        session,
      });
      expect(teamImport.importTeam).toHaveBeenNthCalledWith(1, {
        rosterId: 163386,
        era: 'Fourth era',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        session,
      });
      expect(teamImport.importTeam).toHaveBeenNthCalledWith(2, {
        rosterId: 179769,
        era: 'Fourth era',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        session,
      });
    });

    it('leaves each team to resolve its own era when none is given', async () => {
      await importRegisteredTeams();

      expect(teamImport.importTeam).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ era: undefined }),
      );
    });

    it('keeps a team that was not imported, and carries on', async () => {
      teamImport.importTeam
        .mockResolvedValueOnce(teamNotImported)
        .mockResolvedValueOnce(teamImported);

      const result = await importRegisteredTeams('Fourth era');

      expect(result.teams).toEqual([
        { rosterId: 163386, ...teamNotImported },
        { rosterId: 179769, ...teamImported },
      ]);
    });

    it('reports an inscriptions fetch failure and imports no team', async () => {
      inscriptionsFetch.fetchParticipantRosterIds.mockImplementation(
        ({ errors }) => {
          errors.push(fetchFailure);
          return Promise.resolve(undefined);
        },
      );

      await expect(importRegisteredTeams('Fourth era')).resolves.toEqual({
        rosterIds: undefined,
        teams: [],
        errors: [fetchFailure],
      });
      expect(teamImport.importTeam).not.toHaveBeenCalled();
    });
  });

  describe('backfill', () => {
    const backfill = () =>
      service.backfill({
        tournamentSlug: 's30',
        categoryIds: [22308],
        era: 'Fourth era',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        session,
        competition: upsertedCompetition({ created: true }),
      });

    it('imports the registered teams, links them to the competition, then records its awards', async () => {
      await expect(backfill()).resolves.toEqual({
        teams: [
          { rosterId: 163386, ...teamImported },
          { rosterId: 179769, ...teamImported },
        ],
        participation: { success: true, imported: 2, errors: [] },
        trophyAwards: one,
        awardsFetched: 1,
      });
      expect(teamImport.importTeam).toHaveBeenCalledWith(
        expect.objectContaining({ era: 'Fourth era', session }),
      );
      expect(participants.linkParticipants).toHaveBeenCalledWith({
        competition: upsertedCompetition({ created: true }),
        participantRosterIds: [163386, 179769],
        errors: [],
      });
      expect(awardsFetch.fetchAwards).toHaveBeenCalledWith({
        tournamentSlug: 's30',
        errors: [],
        session,
      });
      expect(trophyAwards.importAwards).toHaveBeenCalledWith({
        competition: upsertedCompetition({ created: true }),
        awards: [AWARD],
        teamEraIdsByRosterId: LINKED,
        errors: [],
      });
    });

    it('links no team and records no award when the inscriptions fetch fails', async () => {
      inscriptionsFetch.fetchParticipantRosterIds.mockImplementation(
        ({ errors }) => {
          errors.push(fetchFailure);
          return Promise.resolve(undefined);
        },
      );

      await expect(backfill()).resolves.toEqual({
        teams: [],
        participation: { success: false, imported: 0, errors: [fetchFailure] },
        trophyAwards: nothing,
        awardsFetched: undefined,
      });
      expect(participants.linkParticipants).not.toHaveBeenCalled();
      expect(awardsFetch.fetchAwards).not.toHaveBeenCalled();
    });

    it('records no award when linking the teams fails', async () => {
      participants.linkParticipants.mockImplementation(({ errors }) => {
        errors.push(fetchFailure);
        return Promise.resolve(undefined);
      });

      const result = await backfill();

      expect(result.participation).toEqual({
        success: false,
        imported: 0,
        errors: [fetchFailure],
      });
      expect(result.trophyAwards).toEqual(nothing);
      expect(awardsFetch.fetchAwards).not.toHaveBeenCalled();
    });

    it('reports an awards fetch failure on the trophy awards and records none', async () => {
      awardsFetch.fetchAwards.mockImplementation(({ errors }) => {
        errors.push(fetchFailure);
        return Promise.resolve(undefined);
      });

      const result = await backfill();

      expect(result.trophyAwards).toEqual({
        success: false,
        imported: 0,
        errors: [fetchFailure],
      });
      expect(trophyAwards.importAwards).not.toHaveBeenCalled();
      expect(result.awardsFetched).toBeUndefined();
    });

    it('reports zero fetched awards, not an unknown count, when TP has none yet', async () => {
      awardsFetch.fetchAwards.mockResolvedValue([]);
      trophyAwards.importAwards.mockResolvedValue(0);

      const result = await backfill();

      expect(result.awardsFetched).toBe(0);
    });

    it('reports no fetched award count when linking the teams fails', async () => {
      participants.linkParticipants.mockResolvedValue(undefined);

      const result = await backfill();

      expect(result.awardsFetched).toBeUndefined();
    });

    it('catches an unexpected exception instead of throwing, keeping the imported teams', async () => {
      participants.linkParticipants.mockRejectedValue(new Error('db down'));

      await expect(backfill()).resolves.toEqual({
        teams: [
          { rosterId: 163386, ...teamImported },
          { rosterId: 179769, ...teamImported },
        ],
        participation: {
          success: false,
          imported: 0,
          errors: [
            {
              item: { tournamentSlug: 's30' },
              message:
                'Unexpected error backfilling the registered teams of competition s30: db down',
            },
          ],
        },
        trophyAwards: nothing,
        awardsFetched: undefined,
      });
    });
  });
});
