import type { ImportResult } from '@blood-bowl-tracker/api-contract';
import type {
  TpLiveCompetitionImportResult,
  TpLiveMatchImportResult,
  TpLiveMatchTeamsImportResult,
  TpLiveOfficialTeamsImportResult,
  TpLiveTeamImportResult,
} from '@blood-bowl-tracker/import-tp-live';
import {
  TpLiveCompetitionImportService,
  TpLiveMatchImportService,
  TpLiveMatchTeamsImportService,
  TpLiveOfficialTeamsImportService,
  TpLiveTeamImportService,
} from '@blood-bowl-tracker/import-tp-live';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { TpImportDispatchService } from './tp-import-dispatch.service';

const EXTERNAL_SYSTEM_NAME = 'tourplay.net';
const one: ImportResult = { success: true, imported: 1, errors: [] };
const TEAM_RESULT: TpLiveTeamImportResult = {
  team: one,
  players: one,
  era: 'Fourth era',
  teamEra: { id: 31, eraId: 40 },
};
const COMPETITION_RESULT: TpLiveCompetitionImportResult = {
  competition: one,
  teams: [],
  participation: one,
  trophyAwards: one,
  extraTrophyAwards: one,
  era: 'Fourth era',
};
const MATCH_RESULT: TpLiveMatchImportResult = {
  competition: one,
  homeTeam: TEAM_RESULT,
  awayTeam: TEAM_RESULT,
  starPlayerHires: one,
  match: one,
  participation: one,
  events: one,
  outcome: one,
};
const MATCH_TEAMS_RESULT: TpLiveMatchTeamsImportResult = {
  match: { success: true, imported: 0, errors: [] },
  homeTeam: TEAM_RESULT,
  awayTeam: TEAM_RESULT,
};
const OFFICIAL_TEAMS_RESULT: TpLiveOfficialTeamsImportResult = {
  rulesSets: [],
};

describe('TpImportDispatchService', () => {
  let service: TpImportDispatchService;
  let config: MockProxy<DiscordBotConfigService>;
  let competitionImport: MockProxy<TpLiveCompetitionImportService>;
  let matchImport: MockProxy<TpLiveMatchImportService>;
  let matchTeamsImport: MockProxy<TpLiveMatchTeamsImportService>;
  let teamImport: MockProxy<TpLiveTeamImportService>;
  let officialTeamsImport: MockProxy<TpLiveOfficialTeamsImportService>;

  beforeEach(async () => {
    config = mock<DiscordBotConfigService>();
    config.getTpExternalSystemName.mockReturnValue(EXTERNAL_SYSTEM_NAME);
    competitionImport = mock<TpLiveCompetitionImportService>();
    matchImport = mock<TpLiveMatchImportService>();
    matchTeamsImport = mock<TpLiveMatchTeamsImportService>();
    teamImport = mock<TpLiveTeamImportService>();
    officialTeamsImport = mock<TpLiveOfficialTeamsImportService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpImportDispatchService,
        { provide: DiscordBotConfigService, useValue: config },
        {
          provide: TpLiveCompetitionImportService,
          useValue: competitionImport,
        },
        { provide: TpLiveMatchImportService, useValue: matchImport },
        { provide: TpLiveMatchTeamsImportService, useValue: matchTeamsImport },
        { provide: TpLiveTeamImportService, useValue: teamImport },
        {
          provide: TpLiveOfficialTeamsImportService,
          useValue: officialTeamsImport,
        },
      ],
    }).compile();
    service = moduleRef.get(TpImportDispatchService);
  });

  it('imports a competition page under the given era and the configured external system', async () => {
    competitionImport.importCompetition.mockResolvedValue(COMPETITION_RESULT);

    await expect(
      service.dispatch({
        page: { kind: 'competition', tournamentSlug: 's30' },
        era: 'Fourth era',
      }),
    ).resolves.toEqual({
      kind: 'competition',
      tournamentSlug: 's30',
      result: COMPETITION_RESULT,
    });
    expect(competitionImport.importCompetition).toHaveBeenCalledWith({
      tournamentSlug: 's30',
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      forceMatchBackfill: false,
    });
  });

  it('leaves the era to auto-resolution when none is given', async () => {
    competitionImport.importCompetition.mockResolvedValue(COMPETITION_RESULT);

    await service.dispatch({
      page: { kind: 'competition', tournamentSlug: 's30' },
    });

    expect(competitionImport.importCompetition).toHaveBeenCalledWith({
      tournamentSlug: 's30',
      era: undefined,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      forceMatchBackfill: false,
    });
  });

  it("imports a competition's scores page as that competition, forcing its matches to be backfilled", async () => {
    competitionImport.importCompetition.mockResolvedValue(COMPETITION_RESULT);

    await expect(
      service.dispatch({
        page: { kind: 'competitionScores', tournamentSlug: 's30' },
        era: 'Fourth era',
      }),
    ).resolves.toEqual({
      kind: 'competition',
      tournamentSlug: 's30',
      result: COMPETITION_RESULT,
    });
    expect(competitionImport.importCompetition).toHaveBeenCalledWith({
      tournamentSlug: 's30',
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      forceMatchBackfill: true,
    });
  });

  it('imports a match page', async () => {
    matchImport.importMatch.mockResolvedValue(MATCH_RESULT);

    await expect(
      service.dispatch({
        page: { kind: 'match', tournamentSlug: 's30', matchId: 576264 },
        era: 'Fourth era',
      }),
    ).resolves.toEqual({
      kind: 'match',
      tournamentSlug: 's30',
      matchId: 576264,
      result: MATCH_RESULT,
    });
    expect(matchImport.importMatch).toHaveBeenCalledWith({
      matchId: 576264,
      tournamentSlug: 's30',
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });
  });

  it("imports a match's teams without the match itself", async () => {
    matchTeamsImport.importMatchTeams.mockResolvedValue(MATCH_TEAMS_RESULT);

    await expect(
      service.dispatch({
        page: { kind: 'matchTeams', tournamentSlug: 's31', matchId: 670570 },
      }),
    ).resolves.toEqual({
      kind: 'matchTeams',
      tournamentSlug: 's31',
      matchId: 670570,
      result: MATCH_TEAMS_RESULT,
    });
    expect(matchTeamsImport.importMatchTeams).toHaveBeenCalledWith({
      matchId: 670570,
      tournamentSlug: 's31',
      era: undefined,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });
    expect(matchImport.importMatch).not.toHaveBeenCalled();
  });

  it('imports a roster page', async () => {
    teamImport.importTeam.mockResolvedValue(TEAM_RESULT);

    await expect(
      service.dispatch({ page: { kind: 'roster', rosterId: 163386 } }),
    ).resolves.toEqual({
      kind: 'roster',
      rosterId: 163386,
      result: TEAM_RESULT,
    });
    expect(teamImport.importTeam).toHaveBeenCalledWith({
      rosterId: 163386,
      era: undefined,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });
  });

  it('imports the official teams page for every rules set, ignoring any era', async () => {
    officialTeamsImport.importOfficialTeams.mockResolvedValue(
      OFFICIAL_TEAMS_RESULT,
    );

    await expect(
      service.dispatch({ page: { kind: 'officialTeams' }, era: 'Fourth era' }),
    ).resolves.toEqual({
      kind: 'officialTeams',
      result: OFFICIAL_TEAMS_RESULT,
    });
    expect(officialTeamsImport.importOfficialTeams).toHaveBeenCalledWith({
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });
  });
});
