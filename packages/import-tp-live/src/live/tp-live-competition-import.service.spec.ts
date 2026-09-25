import type {
  ImportError,
  ImportResult,
  TpCompetitionImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpCompetitionImportService } from '../competition/tp-competition-import.service';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpAwardsFetchService } from './tp-awards-fetch.service';
import type { TpBracket } from './tp-bracket-fetch.service';
import { TpBracketFetchService } from './tp-bracket-fetch.service';
import { TpInscriptionsFetchService } from './tp-inscriptions-fetch.service';
import { TpLiveCompetitionImportService } from './tp-live-competition-import.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';

const EXTERNAL_SYSTEM_NAME = 'some-external-system';

const nothing: ImportResult = { success: true, imported: 0, errors: [] };
const one: ImportResult = { success: true, imported: 1, errors: [] };
const teamImported: TpLiveTeamImportResult = {
  team: one,
  players: one,
  era: 'Fourth era',
};
const teamNotImported: TpLiveTeamImportResult = {
  team: {
    success: false,
    imported: 0,
    errors: [{ item: 1, message: 'no coach' }],
  },
  players: nothing,
  era: undefined,
};
const BRACKET: TpBracket = {
  tournament: {
    id: 18442,
    name: 'Säsong 30',
    ruleSet: 25,
    phases: [],
    categoryIds: [22308],
  },
  matches: [],
  playedDates: [new Date('2026-01-10'), new Date('2026-06-20')],
};
const AWARD: TpAward = { id: 24112, awardType: 1, rosterId: 179769 };
const CORE: TpCompetitionImportResult = {
  competition: one,
  participation: { success: true, imported: 2, errors: [] },
  trophyAwards: one,
};
const fetchFailure: ImportError = { item: 1, message: 'status 429' };

describe('TpLiveCompetitionImportService', () => {
  let service: TpLiveCompetitionImportService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let bracketFetch: MockProxy<TpBracketFetchService>;
  let inscriptionsFetch: MockProxy<TpInscriptionsFetchService>;
  let awardsFetch: MockProxy<TpAwardsFetchService>;
  let teamImport: MockProxy<TpLiveTeamImportService>;
  let competitionImport: MockProxy<TpCompetitionImportService>;

  beforeEach(async () => {
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    bracketFetch = mock<TpBracketFetchService>();
    inscriptionsFetch = mock<TpInscriptionsFetchService>();
    awardsFetch = mock<TpAwardsFetchService>();
    teamImport = mock<TpLiveTeamImportService>();
    competitionImport = mock<TpCompetitionImportService>();
    bracketFetch.fetchBracket.mockResolvedValue(BRACKET);
    inscriptionsFetch.fetchParticipantRosterIds.mockResolvedValue([
      163386, 179769,
    ]);
    teamImport.importTeam.mockResolvedValue(teamImported);
    awardsFetch.fetchAwards.mockResolvedValue([AWARD]);
    competitionImport.importCompetition.mockResolvedValue(CORE);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveCompetitionImportService,
        TpImportResultsService,
        { provide: TpFetcherService, useValue: fetcher },
        { provide: TpBracketFetchService, useValue: bracketFetch },
        { provide: TpInscriptionsFetchService, useValue: inscriptionsFetch },
        { provide: TpAwardsFetchService, useValue: awardsFetch },
        { provide: TpLiveTeamImportService, useValue: teamImport },
        { provide: TpCompetitionImportService, useValue: competitionImport },
      ],
    }).compile();
    service = moduleRef.get(TpLiveCompetitionImportService);
  });

  const importCompetition = () =>
    service.importCompetition({
      tournamentSlug: 's30',
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

  it('fetches the bracket and inscriptions, imports each team, fetches the awards, then imports the competition, through one session', async () => {
    await expect(importCompetition()).resolves.toEqual({
      competition: one,
      teams: [
        { rosterId: 163386, ...teamImported },
        { rosterId: 179769, ...teamImported },
      ],
      participation: CORE.participation,
      trophyAwards: one,
    });
    expect(bracketFetch.fetchBracket).toHaveBeenCalledWith({
      tournamentSlug: 's30',
      errors: [],
      session,
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
    expect(awardsFetch.fetchAwards).toHaveBeenCalledWith({
      tournamentSlug: 's30',
      errors: [],
      session,
    });
    expect(competitionImport.importCompetition).toHaveBeenCalledWith({
      tournament: { id: 18442, name: 'Säsong 30' },
      playedDates: BRACKET.playedDates,
      era: 'Fourth era',
      participantRosterIds: [163386, 179769],
      awards: [AWARD],
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });
  });

  it('fetches through a given session', async () => {
    const given = mock<TpFetchSession>();

    await service.importCompetition({
      tournamentSlug: 's30',
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session: given,
    });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    expect(bracketFetch.fetchBracket).toHaveBeenCalledWith(
      expect.objectContaining({ session: given }),
    );
  });

  it('reports a bracket fetch failure and attempts nothing else', async () => {
    bracketFetch.fetchBracket.mockImplementation(({ errors }) => {
      errors.push(fetchFailure);
      return Promise.resolve(undefined);
    });

    await expect(importCompetition()).resolves.toEqual({
      competition: { success: false, imported: 0, errors: [fetchFailure] },
      teams: [],
      participation: nothing,
      trophyAwards: nothing,
    });
    expect(inscriptionsFetch.fetchParticipantRosterIds).not.toHaveBeenCalled();
    expect(competitionImport.importCompetition).not.toHaveBeenCalled();
  });

  it('still imports the competition when the inscriptions fetch fails, with no teams and no awards', async () => {
    inscriptionsFetch.fetchParticipantRosterIds.mockImplementation(
      ({ errors }) => {
        errors.push(fetchFailure);
        return Promise.resolve(undefined);
      },
    );
    competitionImport.importCompetition.mockResolvedValue({
      competition: one,
      participation: nothing,
      trophyAwards: nothing,
    });

    const result = await importCompetition();

    expect(teamImport.importTeam).not.toHaveBeenCalled();
    expect(awardsFetch.fetchAwards).not.toHaveBeenCalled();
    expect(competitionImport.importCompetition).toHaveBeenCalledWith(
      expect.objectContaining({ participantRosterIds: [], awards: [] }),
    );
    expect(result.teams).toEqual([]);
    expect(result.participation).toEqual({
      success: false,
      imported: 0,
      errors: [fetchFailure],
    });
  });

  it('still imports the competition when the awards fetch fails, with no awards', async () => {
    awardsFetch.fetchAwards.mockImplementation(({ errors }) => {
      errors.push(fetchFailure);
      return Promise.resolve(undefined);
    });
    competitionImport.importCompetition.mockResolvedValue({
      ...CORE,
      trophyAwards: nothing,
    });

    const result = await importCompetition();

    expect(competitionImport.importCompetition).toHaveBeenCalledWith(
      expect.objectContaining({ awards: [] }),
    );
    expect(result.trophyAwards).toEqual({
      success: false,
      imported: 0,
      errors: [fetchFailure],
    });
  });

  it('keeps going when a team cannot be imported, reporting it in teams', async () => {
    teamImport.importTeam
      .mockResolvedValueOnce(teamNotImported)
      .mockResolvedValueOnce(teamImported);

    const result = await importCompetition();

    expect(result.teams).toEqual([
      { rosterId: 163386, ...teamNotImported },
      { rosterId: 179769, ...teamImported },
    ]);
    expect(competitionImport.importCompetition).toHaveBeenCalledWith(
      expect.objectContaining({ participantRosterIds: [163386, 179769] }),
    );
  });

  it('catches an unexpected exception instead of throwing, keeping already-imported teams', async () => {
    competitionImport.importCompetition.mockRejectedValue(new Error('db down'));

    await expect(importCompetition()).resolves.toEqual({
      competition: {
        success: false,
        imported: 0,
        errors: [
          {
            item: { tournamentSlug: 's30' },
            message: 'Unexpected error importing competition s30: db down',
          },
        ],
      },
      teams: [
        { rosterId: 163386, ...teamImported },
        { rosterId: 179769, ...teamImported },
      ],
      participation: nothing,
      trophyAwards: nothing,
    });
  });
});
