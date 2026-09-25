import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpRoster, TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpRosterImportService } from '../roster/tp-roster-import.service';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpEraResolutionService } from './tp-era-resolution.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';
import { TpRosterFetchService } from './tp-roster-fetch.service';

const EXTERNAL_SYSTEM_NAME = 'some-external-system';

const ROSTER: TpRoster = {
  id: 163386,
  teamName: 'Da Boyz',
  teamRaceCode: 'Orc',
  raceName: 'Orc',
  coachTpId: 'guid-c',
  coachName: 'Coach C',
  positions: [],
  starPositions: [],
  players: [],
};

const TEAM_RESULT: ImportResult = { success: true, imported: 1, errors: [] };
const PLAYERS_RESULT: ImportResult = {
  success: true,
  imported: 11,
  errors: [],
};

describe('TpLiveTeamImportService', () => {
  let service: TpLiveTeamImportService;
  let rosterFetch: MockProxy<TpRosterFetchService>;
  let eraResolution: MockProxy<TpEraResolutionService>;
  let rosterImport: MockProxy<TpRosterImportService>;

  beforeEach(async () => {
    rosterFetch = mock<TpRosterFetchService>();
    eraResolution = mock<TpEraResolutionService>();
    rosterImport = mock<TpRosterImportService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveTeamImportService,
        { provide: TpRosterFetchService, useValue: rosterFetch },
        { provide: TpEraResolutionService, useValue: eraResolution },
        { provide: TpRosterImportService, useValue: rosterImport },
        TpImportResultsService,
      ],
    }).compile();
    service = moduleRef.get(TpLiveTeamImportService);
  });

  function stubHappyPath(): void {
    rosterFetch.fetchRoster.mockResolvedValue(ROSTER);
    eraResolution.resolveEra.mockResolvedValue('Fourth era');
    rosterImport.importRoster.mockResolvedValue({
      team: TEAM_RESULT,
      players: PLAYERS_RESULT,
      teamEras: [],
      importedPlayers: [],
      mercenaryPositionUsages: [],
    });
  }

  it('fetches the roster, resolves its era, then imports the team and its players', async () => {
    stubHappyPath();

    const result = await service.importTeam({
      rosterId: 163386,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

    expect(result).toEqual({
      team: TEAM_RESULT,
      players: PLAYERS_RESULT,
      era: 'Fourth era',
    });
    expect(rosterFetch.fetchRoster).toHaveBeenCalledWith({
      rosterId: 163386,
      errors: [],
      session: undefined,
    });
    expect(eraResolution.resolveEra).toHaveBeenCalledWith({
      roster: ROSTER,
      era: undefined,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      errors: [],
    });
    expect(rosterImport.importRoster).toHaveBeenCalledWith({
      roster: ROSTER,
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });
  });

  it('imports the team with no competition attached', async () => {
    stubHappyPath();

    await service.importTeam({
      rosterId: 163386,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

    // Exactly { roster, era, externalSystemName }: a live team import needs no competition.
    expect(rosterImport.importRoster).toHaveBeenCalledWith({
      roster: ROSTER,
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });
  });

  it('passes an explicit era and a caller-supplied session through', async () => {
    rosterFetch.fetchRoster.mockResolvedValue(ROSTER);
    eraResolution.resolveEra.mockResolvedValue('Fifth era');
    rosterImport.importRoster.mockResolvedValue({
      team: TEAM_RESULT,
      players: PLAYERS_RESULT,
      teamEras: [],
      importedPlayers: [],
      mercenaryPositionUsages: [],
    });
    const session = mock<TpFetchSession>();

    await service.importTeam({
      rosterId: 163386,
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session,
    });

    expect(rosterFetch.fetchRoster).toHaveBeenCalledWith(
      expect.objectContaining({ session }),
    );
    expect(eraResolution.resolveEra).toHaveBeenCalledWith(
      expect.objectContaining({ era: 'Fourth era' }),
    );
  });

  it('reports a fetch or parse failure in the team result and imports nothing', async () => {
    const fetchError: ImportError = {
      item: { rosterId: 163386 },
      message: 'Could not fetch TP roster 163386: status 403',
    };
    rosterFetch.fetchRoster.mockImplementation(({ errors }) => {
      errors.push(fetchError);
      return Promise.resolve(undefined);
    });

    const result = await service.importTeam({
      rosterId: 163386,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

    expect(result.team.success).toBe(false);
    expect(result.team.errors).toHaveLength(1);
    expect(result.team.errors[0].message).toBe(
      'Could not fetch TP roster 163386: status 403',
    );
    expect(result.players.success).toBe(true);
    expect(result.players.imported).toBe(0);
    expect(result.era).toBeUndefined();
    expect(eraResolution.resolveEra).not.toHaveBeenCalled();
    expect(rosterImport.importRoster).not.toHaveBeenCalled();
  });

  it('reports an era resolution failure in the team result and imports nothing', async () => {
    const eraError: ImportError = {
      item: { team: 163386, teamRaceCode: 'Orc', ongoingEras: [] },
      message:
        'Could not resolve an era for team "Da Boyz": race "Orc" has no ongoing era',
    };
    rosterFetch.fetchRoster.mockResolvedValue(ROSTER);
    eraResolution.resolveEra.mockImplementation(({ errors }) => {
      errors.push(eraError);
      return Promise.resolve(undefined);
    });

    const result = await service.importTeam({
      rosterId: 163386,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

    expect(result.team.success).toBe(false);
    expect(result.team.errors).toHaveLength(1);
    expect(result.team.errors[0].message).toContain('Could not resolve an era');
    expect(result.era).toBeUndefined();
    expect(rosterImport.importRoster).not.toHaveBeenCalled();
  });

  it('catches an unexpected exception from a collaborator instead of throwing, reporting one error naming the roster id', async () => {
    rosterFetch.fetchRoster.mockResolvedValue(ROSTER);
    eraResolution.resolveEra.mockResolvedValue('Fourth era');
    rosterImport.importRoster.mockRejectedValue(new Error('db down'));

    const result = await service.importTeam({
      rosterId: 163386,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

    expect(result.team.success).toBe(false);
    expect(result.team.errors).toHaveLength(1);
    expect(result.team.errors[0]).toEqual({
      item: { rosterId: 163386 },
      message: 'Unexpected error importing team 163386: db down',
    });
    expect(result.players.success).toBe(true);
    expect(result.players.imported).toBe(0);
    expect(result.era).toBeUndefined();
  });

  it("passes a match's embedded players through to the roster import", async () => {
    stubHappyPath();
    const departed: TpRosterPlayer = {
      id: 5009,
      name: 'Grim',
      number: 9,
      lineUpMasterId: 77,
      rosterId: 163386,
      fallbackPositionName: 'Lineman',
      isBigGuy: false,
      totalStarPlayerPoints: 4,
    };

    await service.importTeam({
      rosterId: 163386,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      matchEmbeddedPlayers: [departed],
    });

    expect(rosterImport.importRoster).toHaveBeenCalledWith({
      roster: ROSTER,
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      matchEmbeddedPlayers: [departed],
    });
  });

  it('reports no era when the roster import did not import the team', async () => {
    rosterFetch.fetchRoster.mockResolvedValue(ROSTER);
    eraResolution.resolveEra.mockResolvedValue('Fourth era');
    rosterImport.importRoster.mockResolvedValue({
      team: {
        success: false,
        imported: 0,
        errors: [{ item: 1, message: 'no coach' }],
      },
      players: { success: true, imported: 0, errors: [] },
      teamEras: [],
      importedPlayers: [],
      mercenaryPositionUsages: [],
    });

    const result = await service.importTeam({
      rosterId: 163386,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

    expect(result.era).toBeUndefined();
    expect(result.team.success).toBe(false);
  });
});
