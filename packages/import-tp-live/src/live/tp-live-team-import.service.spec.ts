import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { mockImportResultService } from '../import-package.test-helpers';
import { TpPlayersImportService } from '../roster-import/players/tp-players-import.service';
import { TpTeamsImportService } from '../roster-import/teams/tp-teams-import.service';
import { TpEraResolutionService } from './tp-era-resolution.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';
import { TpRosterFetchService } from './tp-roster-fetch.service';

const ROSTER: TpRoster = {
  id: 163386,
  teamName: 'Da Boyz',
  teamRaceCode: 'Orc',
  raceName: 'Orc',
  coachTpId: 'guid-c',
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
const TEAM_ERAS = new Map([[163386, [{ id: 700, eraId: 11 }]]]);

/**
 * Canned values the mocked ImportResultService.result returns, in call order.
 * ImportResultService's own success derivation is covered by
 * packages/import/src/import-result.service.spec.ts; these specs assert what
 * the service passes to result() and that it returns result()'s values.
 */
const FIRST_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: 'first' }, message: 'canned first result' }],
};
const SECOND_RESULT: ImportResult = {
  success: true,
  imported: -2,
  errors: [],
};

describe('TpLiveTeamImportService', () => {
  let service: TpLiveTeamImportService;
  let rosterFetch: MockProxy<TpRosterFetchService>;
  let eraResolution: MockProxy<TpEraResolutionService>;
  let teamsImport: MockProxy<TpTeamsImportService>;
  let playersImport: MockProxy<TpPlayersImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    rosterFetch = mock<TpRosterFetchService>();
    eraResolution = mock<TpEraResolutionService>();
    teamsImport = mock<TpTeamsImportService>();
    playersImport = mock<TpPlayersImportService>();
    importResults = mockImportResultService();
    importResults.result
      .mockReturnValueOnce(FIRST_RESULT)
      .mockReturnValueOnce(SECOND_RESULT);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveTeamImportService,
        { provide: TpRosterFetchService, useValue: rosterFetch },
        { provide: TpEraResolutionService, useValue: eraResolution },
        { provide: TpTeamsImportService, useValue: teamsImport },
        { provide: TpPlayersImportService, useValue: playersImport },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(TpLiveTeamImportService);
  });

  function stubHappyPath(): void {
    rosterFetch.fetchRoster.mockResolvedValue(ROSTER);
    eraResolution.resolveEra.mockResolvedValue('Fifth era');
    teamsImport.importTeams.mockResolvedValue({
      result: TEAM_RESULT,
      teamErasByRosterId: TEAM_ERAS,
    });
    playersImport.importPlayers.mockResolvedValue({
      result: PLAYERS_RESULT,
      playerIdsByLineUpId: new Map(),
      starPlayerIdsByRosterAndMaster: new Map(),
      careerSppCountsByPlayerId: new Map(),
      mercenaryPositionUsages: [],
      insertedPlayerIds: [],
      skillsByPlayerId: new Map(),
    });
  }

  it('fetches the roster, resolves its era, then imports the team and its players', async () => {
    stubHappyPath();

    const result = await service.importTeam({ rosterId: 163386 });

    expect(result).toEqual({ team: TEAM_RESULT, players: PLAYERS_RESULT });
    expect(rosterFetch.fetchRoster).toHaveBeenCalledWith({
      rosterId: 163386,
      errors: [],
      session: undefined,
    });
    expect(eraResolution.resolveEra).toHaveBeenCalledWith({
      roster: ROSTER,
      era: undefined,
      errors: [],
    });
    expect(playersImport.importPlayers).toHaveBeenCalledWith({
      rosters: [{ roster: ROSTER, era: 'Fifth era' }],
      teamErasByRosterId: TEAM_ERAS,
    });
    expect(importResults.result).not.toHaveBeenCalled();
  });

  it('imports the team with no competition attached', async () => {
    stubHappyPath();

    await service.importTeam({ rosterId: 163386 });

    // Exactly { roster, era }: a live team import needs no competition.
    expect(teamsImport.importTeams).toHaveBeenCalledWith([
      { roster: ROSTER, era: 'Fifth era' },
    ]);
  });

  it('passes an explicit era and a caller-supplied session through', async () => {
    stubHappyPath();
    const session = mock<TpFetchSession>();

    await service.importTeam({ rosterId: 163386, era: 'Fourth era', session });

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

    const result = await service.importTeam({ rosterId: 163386 });

    expect(result).toEqual({ team: FIRST_RESULT, players: SECOND_RESULT });
    expect(importResults.result.mock.calls).toEqual([
      [{ imported: 0, errors: [fetchError] }],
      [{ imported: 0, errors: [] }],
    ]);
    expect(eraResolution.resolveEra).not.toHaveBeenCalled();
    expect(teamsImport.importTeams).not.toHaveBeenCalled();
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

    const result = await service.importTeam({ rosterId: 163386 });

    expect(result.team).toBe(FIRST_RESULT);
    expect(importResults.result.mock.calls[0]).toEqual([
      { imported: 0, errors: [eraError] },
    ]);
    expect(teamsImport.importTeams).not.toHaveBeenCalled();
  });

  it('skips the players when the team itself was not imported', async () => {
    stubHappyPath();
    teamsImport.importTeams.mockResolvedValue({
      result: TEAM_RESULT,
      teamErasByRosterId: new Map(),
    });

    const result = await service.importTeam({ rosterId: 163386 });

    // The one result() call on this path is the players slot's, so it gets
    // the first canned value.
    expect(result).toEqual({ team: TEAM_RESULT, players: FIRST_RESULT });
    expect(importResults.result.mock.calls).toEqual([
      [{ imported: 0, errors: [] }],
    ]);
    expect(playersImport.importPlayers).not.toHaveBeenCalled();
  });
});
