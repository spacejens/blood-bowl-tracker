import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpRosterPlayersImportService } from './players/tp-roster-players-import.service';
import { TpTeamUpsertService } from './team/tp-team-upsert.service';
import {
  ERA_ID,
  rosterContext,
  rosterPlayer,
  tpRoster,
} from './tp-roster.test-helpers';
import { TpRosterContextService } from './tp-roster-context.service';
import { TpRosterImportService } from './tp-roster-import.service';

const nothing = { success: true, imported: 0, errors: [] };

describe('TpRosterImportService', () => {
  let service: TpRosterImportService;
  let parser: MockProxy<RosterParserService>;
  let context: MockProxy<TpRosterContextService>;
  let teamUpsert: MockProxy<TpTeamUpsertService>;
  let playersImport: MockProxy<TpRosterPlayersImportService>;

  beforeEach(async () => {
    parser = mock<RosterParserService>();
    context = mock<TpRosterContextService>();
    teamUpsert = mock<TpTeamUpsertService>();
    playersImport = mock<TpRosterPlayersImportService>();
    context.resolve.mockResolvedValue(rosterContext());
    teamUpsert.upsertTeam.mockResolvedValue([
      { id: 30, eraId: 39 },
      { id: 31, eraId: ERA_ID },
    ]);
    playersImport.importPlayers.mockResolvedValue({
      imported: 1,
      importedPlayers: [{ lineUpId: 5001, playerId: 700, created: true }],
      mercenaryPositionUsages: [],
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterImportService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: RosterParserService, useValue: parser },
        { provide: TpRosterContextService, useValue: context },
        { provide: TpTeamUpsertService, useValue: teamUpsert },
        { provide: TpRosterPlayersImportService, useValue: playersImport },
      ],
    }).compile();
    service = moduleRef.get(TpRosterImportService);
  });

  const importRoster = () =>
    service.importRoster({
      roster: tpRoster(),
      era: 'Fourth era',
      externalSystemName: 'TP',
    });

  it('upserts the team, then its players into the team era for the era', async () => {
    await expect(importRoster()).resolves.toEqual({
      team: { success: true, imported: 1, errors: [] },
      players: { success: true, imported: 1, errors: [] },
      teamEras: [
        { id: 30, eraId: 39 },
        { id: 31, eraId: ERA_ID },
      ],
      importedPlayers: [{ lineUpId: 5001, playerId: 700, created: true }],
      mercenaryPositionUsages: [],
    });
    expect(context.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ era: 'Fourth era', externalSystemName: 'TP' }),
    );
    expect(playersImport.importPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ teamEraId: 31, matchEmbeddedPlayers: [] }),
    );
  });

  it('passes match-embedded players through to the players import', async () => {
    const departed = rosterPlayer({ id: 5009 });

    await service.importRoster({
      roster: tpRoster(),
      era: 'Fourth era',
      externalSystemName: 'TP',
      matchEmbeddedPlayers: [departed],
    });

    expect(playersImport.importPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ matchEmbeddedPlayers: [departed] }),
    );
  });

  it('imports nothing when the context cannot be resolved, reporting its errors on the team', async () => {
    context.resolve.mockImplementation(({ errors }) => {
      errors.push({ item: 'era', message: 'Unknown era' });
      return Promise.resolve(undefined);
    });

    await expect(importRoster()).resolves.toEqual({
      team: {
        success: false,
        imported: 0,
        errors: [{ item: 'era', message: 'Unknown era' }],
      },
      players: nothing,
      teamEras: [],
      importedPlayers: [],
      mercenaryPositionUsages: [],
    });
    expect(teamUpsert.upsertTeam).not.toHaveBeenCalled();
  });

  it('skips the players when the team itself was not imported', async () => {
    teamUpsert.upsertTeam.mockResolvedValue(undefined);

    const result = await importRoster();

    expect(result.team.imported).toBe(0);
    expect(result.players).toEqual(nothing);
    expect(playersImport.importPlayers).not.toHaveBeenCalled();
  });

  it('parses raw roster content before importing it', async () => {
    parser.parse.mockReturnValue(tpRoster());

    await service.importRawRoster({
      content: { raw: true },
      era: 'Fourth era',
      externalSystemName: 'TP',
    });

    expect(parser.parse).toHaveBeenCalledWith({ raw: true });
    expect(teamUpsert.upsertTeam).toHaveBeenCalled();
  });

  it('reports unparseable raw content as one team error and imports nothing', async () => {
    parser.parse.mockImplementation(() => {
      throw new Error('missing id');
    });

    const result = await service.importRawRoster({
      content: {},
      era: 'Fourth era',
      externalSystemName: 'TP',
    });

    expect(result.team).toEqual({
      success: false,
      imported: 0,
      errors: [
        {
          item: { era: 'Fourth era' },
          message: 'Could not parse TP roster: missing id',
        },
      ],
    });
    expect(context.resolve).not.toHaveBeenCalled();
  });

  it('skips the players when the returned team eras lack the context era', async () => {
    teamUpsert.upsertTeam.mockResolvedValue([{ id: 30, eraId: 39 }]);

    const result = await importRoster();

    expect(result.players).toEqual({
      success: false,
      imported: 0,
      errors: [
        {
          item: { rosterId: 163386, era: 'Fourth era' },
          message:
            'Skipped the players of roster 163386: could not resolve its team era for era "Fourth era"',
        },
      ],
    });
    expect(playersImport.importPlayers).not.toHaveBeenCalled();
  });
});
