import type {
  ImportResult,
  TpMatchImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  AWAY_ROSTER_ID,
  bracketMatch,
  HOME_ROSTER_ID,
  MATCH_TP_ID,
  tpMatch,
} from '../match/tp-match.test-helpers';
import { TpMatchImportService } from '../match/tp-match-import.service';
import { TpImportResultsService } from '../tp-import-results.service';
import type { TpBracket } from './tp-bracket-fetch.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';
import { TpMatchDataImportService } from './tp-match-data-import.service';
import { TpMatchFetchService } from './tp-match-fetch.service';

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
const notAttemptedTeam: TpLiveTeamImportResult = {
  team: nothing,
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
  matches: [bracketMatch(), bracketMatch({ id: 662797, winner: undefined })],
  playedDates: [new Date('2026-06-13')],
};
const CORE: TpMatchImportResult = {
  match: one,
  participation: one,
  events: { success: true, imported: 14, errors: [] },
  outcome: one,
};

describe('TpMatchDataImportService', () => {
  let service: TpMatchDataImportService;
  let session: MockProxy<TpFetchSession>;
  let matchFetch: MockProxy<TpMatchFetchService>;
  let teamImport: MockProxy<TpLiveTeamImportService>;
  let matchImport: MockProxy<TpMatchImportService>;

  beforeEach(async () => {
    session = mock<TpFetchSession>();
    matchFetch = mock<TpMatchFetchService>();
    teamImport = mock<TpLiveTeamImportService>();
    matchImport = mock<TpMatchImportService>();
    matchFetch.fetchMatch.mockResolvedValue(tpMatch());
    teamImport.importTeam.mockResolvedValue(teamImported);
    matchImport.importMatch.mockResolvedValue(CORE);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchDataImportService,
        TpImportResultsService,
        { provide: TpMatchFetchService, useValue: matchFetch },
        { provide: TpLiveTeamImportService, useValue: teamImport },
        { provide: TpMatchImportService, useValue: matchImport },
      ],
    }).compile();
    service = moduleRef.get(TpMatchDataImportService);
  });

  const teamOptions = () => ({
    matchId: MATCH_TP_ID,
    tournamentSlug: 's30',
    externalSystemName: EXTERNAL_SYSTEM_NAME,
    session,
  });

  describe('importTeams', () => {
    it("fetches the match, then imports the home team and the away team in the home team's era, through the given session", async () => {
      await expect(service.importTeams(teamOptions())).resolves.toEqual({
        matchFetch: nothing,
        homeTeam: teamImported,
        awayTeam: teamImported,
        ready: { match: tpMatch(), era: 'Fourth era' },
      });
      expect(matchFetch.fetchMatch).toHaveBeenCalledWith({
        matchId: MATCH_TP_ID,
        tournamentSlug: 's30',
        errors: [],
        session,
      });
      expect(teamImport.importTeam).toHaveBeenNthCalledWith(1, {
        rosterId: HOME_ROSTER_ID,
        era: undefined,
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        session,
        matchEmbeddedPlayers: tpMatch().homeRosterPlayers,
      });
      expect(teamImport.importTeam).toHaveBeenNthCalledWith(2, {
        rosterId: AWAY_ROSTER_ID,
        era: 'Fourth era',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        session,
        matchEmbeddedPlayers: tpMatch().awayRosterPlayers,
      });
    });

    it('passes an explicit era to the home team', async () => {
      await service.importTeams({ ...teamOptions(), era: 'Fourth era' });

      expect(teamImport.importTeam).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ era: 'Fourth era' }),
      );
    });

    it('reports a match fetch failure and imports no team', async () => {
      matchFetch.fetchMatch.mockImplementation(({ errors }) => {
        errors.push({ item: { matchId: MATCH_TP_ID }, message: 'status 403' });
        return Promise.resolve(undefined);
      });

      await expect(service.importTeams(teamOptions())).resolves.toEqual({
        matchFetch: {
          success: false,
          imported: 0,
          errors: [{ item: { matchId: MATCH_TP_ID }, message: 'status 403' }],
        },
        homeTeam: notAttemptedTeam,
        awayTeam: notAttemptedTeam,
        ready: undefined,
      });
      expect(teamImport.importTeam).not.toHaveBeenCalled();
    });

    it('refuses a match with no recorded result', async () => {
      matchFetch.fetchMatch.mockResolvedValue(tpMatch({ winner: undefined }));

      const result = await service.importTeams(teamOptions());

      expect(result.matchFetch).toEqual({
        success: false,
        imported: 0,
        errors: [
          {
            item: { matchId: MATCH_TP_ID },
            message: `TP match ${MATCH_TP_ID} is not completed yet (it has no recorded result); only completed matches are imported.`,
          },
        ],
      });
      expect(result.ready).toBeUndefined();
      expect(teamImport.importTeam).not.toHaveBeenCalled();
    });

    it('stops after a home team that was not imported', async () => {
      teamImport.importTeam.mockResolvedValue(teamNotImported);

      await expect(service.importTeams(teamOptions())).resolves.toEqual({
        matchFetch: nothing,
        homeTeam: teamNotImported,
        awayTeam: notAttemptedTeam,
        ready: undefined,
      });
      expect(teamImport.importTeam).toHaveBeenCalledTimes(1);
    });

    it('is not ready when the away team was not imported', async () => {
      teamImport.importTeam
        .mockResolvedValueOnce(teamImported)
        .mockResolvedValueOnce(teamNotImported);

      await expect(service.importTeams(teamOptions())).resolves.toEqual({
        matchFetch: nothing,
        homeTeam: teamImported,
        awayTeam: teamNotImported,
        ready: undefined,
      });
    });
  });

  describe('writeMatch', () => {
    it("imports the match through the shared core, under the bracket's competition", async () => {
      await expect(
        service.writeMatch({
          match: tpMatch(),
          bracket: BRACKET,
          externalSystemName: EXTERNAL_SYSTEM_NAME,
        }),
      ).resolves.toEqual(CORE);
      expect(matchImport.importMatch).toHaveBeenCalledWith({
        match: tpMatch(),
        bracket: BRACKET.matches,
        competitionTpId: 18442,
        externalSystemName: EXTERNAL_SYSTEM_NAME,
      });
    });
  });

  describe('importMatchData', () => {
    it('imports both teams, then the match against the given bracket', async () => {
      await expect(
        service.importMatchData({ ...teamOptions(), bracket: BRACKET }),
      ).resolves.toEqual({
        homeTeam: teamImported,
        awayTeam: teamImported,
        ...CORE,
      });
      expect(matchImport.importMatch).toHaveBeenCalledWith({
        match: tpMatch(),
        bracket: BRACKET.matches,
        competitionTpId: 18442,
        externalSystemName: EXTERNAL_SYSTEM_NAME,
      });
    });

    it('writes no match when its teams are not ready, reporting the match fetch on the match stage', async () => {
      matchFetch.fetchMatch.mockImplementation(({ errors }) => {
        errors.push({ item: { matchId: MATCH_TP_ID }, message: 'status 403' });
        return Promise.resolve(undefined);
      });

      await expect(
        service.importMatchData({ ...teamOptions(), bracket: BRACKET }),
      ).resolves.toEqual({
        homeTeam: notAttemptedTeam,
        awayTeam: notAttemptedTeam,
        match: {
          success: false,
          imported: 0,
          errors: [{ item: { matchId: MATCH_TP_ID }, message: 'status 403' }],
        },
        participation: nothing,
        events: nothing,
        outcome: nothing,
      });
      expect(matchImport.importMatch).not.toHaveBeenCalled();
    });
  });
});
