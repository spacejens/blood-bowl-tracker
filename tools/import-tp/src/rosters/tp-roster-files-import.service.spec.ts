import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { TpRosterImportResult } from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  ImportRunnerService,
} from '@blood-bowl-tracker/import';
import type { TpRoster, TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { mockImportResultService } from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { TpRosterFilesImportService } from './tp-roster-files-import.service';

/** A minimal roster entry: a distinguishable id, era and competition. */
function entry(
  rosterId: number,
  era: string,
  competition = 'comp',
): RosterEntry {
  const roster: TpRoster = {
    id: rosterId,
    teamName: `Team ${rosterId}`,
    teamRaceCode: 'Orc',
    raceName: 'Orc',
    coachTpId: 'coach-1',
    coachName: 'Coach 1',
    positions: [],
    starPositions: [],
    players: [],
  };
  return { roster, era, competition, content: { raw: rosterId } };
}

/** A minimal roster player, distinguishable by id/rosterId. */
function rosterPlayer(overrides: Partial<TpRosterPlayer> = {}): TpRosterPlayer {
  return {
    id: 5001,
    name: 'Grim',
    number: 1,
    lineUpMasterId: 77,
    rosterId: 163386,
    fallbackPositionName: 'Lineman',
    isBigGuy: false,
    totalStarPlayerPoints: 12,
    ...overrides,
  };
}

/** A canned `tpRosters.import` result, overridable per case. */
function outcome(
  overrides: Partial<TpRosterImportResult> = {},
): TpRosterImportResult {
  return {
    team: { success: true, imported: 1, errors: [] },
    players: { success: true, imported: 0, errors: [] },
    teamEras: [],
    importedPlayers: [],
    mercenaryPositionUsages: [],
    ...overrides,
  };
}

describe('TpRosterFilesImportService', () => {
  let service: TpRosterFilesImportService;
  let client: DeepMockProxy<ApiClient>;
  let importRunner: MockProxy<ImportRunnerService>;
  let importResults: ReturnType<typeof mockImportResultService>;
  let externalSystemName: MockProxy<ExternalSystemNameConfigService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    importRunner = mock<ImportRunnerService>();
    importResults = mockImportResultService();
    externalSystemName = mock<ExternalSystemNameConfigService>();
    externalSystemName.getTpSystemName.mockReturnValue('TP');

    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterFilesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: importRunner },
        { provide: ImportResultService, useValue: importResults },
        {
          provide: ExternalSystemNameConfigService,
          useValue: externalSystemName,
        },
      ],
    }).compile();
    service = moduleRef.get(TpRosterFilesImportService);
  });

  it('sends each roster file raw, with its era, configured system name and match-embedded players', async () => {
    const departed = rosterPlayer({ id: 5009, rosterId: 1 });
    importRunner.recordUpsertResult.mockResolvedValue(outcome());

    await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era', 'league-a')],
      matchEmbeddedPlayersByRosterId: new Map([[1, [departed]]]),
    });

    const [options] = importRunner.recordUpsertResult.mock.calls[0];
    client.tpRosters.import.mockResolvedValue(outcome());
    await options.upsert();
    expect(client.tpRosters.import).toHaveBeenCalledWith({
      roster: { raw: 1 },
      era: 'Fourth era',
      externalSystemName: 'TP',
      matchEmbeddedPlayers: [
        {
          id: 5009,
          name: departed.name,
          number: departed.number,
          lineUpMasterId: departed.lineUpMasterId,
          rosterId: 1,
          fallbackPositionName: departed.fallbackPositionName,
          isBigGuy: departed.isBigGuy,
          totalStarPlayerPoints: departed.totalStarPlayerPoints,
        },
      ],
    });
    expect(options.item).toEqual({ rosterId: 1, era: 'Fourth era' });
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import roster 1 (era "Fourth era"): boom',
    );
  });

  it('sends a roster found in several competitions of one era once', async () => {
    importRunner.recordUpsertResult.mockResolvedValue(outcome());

    await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era', 'a'), entry(1, 'Fourth era', 'b')],
      matchEmbeddedPlayersByRosterId: new Map(),
    });

    expect(importRunner.recordUpsertResult).toHaveBeenCalledTimes(1);
  });

  it('sends the same roster once per era', async () => {
    importRunner.recordUpsertResult.mockResolvedValue(outcome());

    await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era'), entry(1, 'Third era')],
      matchEmbeddedPlayersByRosterId: new Map(),
    });

    expect(importRunner.recordUpsertResult).toHaveBeenCalledTimes(2);
  });

  it('merges each call’s team eras by roster id, without duplicates', async () => {
    importRunner.recordUpsertResult
      .mockResolvedValueOnce(outcome({ teamEras: [{ id: 30, eraId: 39 }] }))
      .mockResolvedValueOnce(
        outcome({
          teamEras: [
            { id: 30, eraId: 39 },
            { id: 31, eraId: 40 },
          ],
        }),
      );

    const result = await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era'), entry(1, 'Third era')],
      matchEmbeddedPlayersByRosterId: new Map(),
    });

    expect(result.teamErasByRosterId.get(1)).toEqual([
      { id: 30, eraId: 39 },
      { id: 31, eraId: 40 },
    ]);
  });

  it('records no team eras for a team that was not imported', async () => {
    importRunner.recordUpsertResult.mockResolvedValue(
      outcome({ teamEras: [] }),
    );

    const result = await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era')],
      matchEmbeddedPlayersByRosterId: new Map(),
    });

    expect(result.teamErasByRosterId.has(1)).toBe(false);
  });

  it("maps every imported player's lineUpId to its DB id and collects inserted ids", async () => {
    importRunner.recordUpsertResult.mockResolvedValue(
      outcome({
        importedPlayers: [
          { lineUpId: 5001, playerId: 700, created: true },
          { lineUpId: 5002, playerId: 701, created: false },
        ],
      }),
    );

    const result = await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era')],
      matchEmbeddedPlayersByRosterId: new Map(),
    });

    expect([...result.playerIdsByLineUpId]).toEqual([
      [5001, 700],
      [5002, 701],
    ]);
    expect(result.insertedPlayerIds).toEqual([700]);
  });

  it('collects mercenary position usages', async () => {
    const usage = { positionId: 5, teamRaceCode: 'Orc', era: 'Fourth era' };
    importRunner.recordUpsertResult.mockResolvedValue(
      outcome({ mercenaryPositionUsages: [usage] }),
    );

    const result = await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era')],
      matchEmbeddedPlayersByRosterId: new Map(),
    });

    expect(result.mercenaryPositionUsages).toEqual([usage]);
  });

  it('sums imported counts and gathers errors into separate team and player results', async () => {
    const teamError = { item: { canned: 'team' }, message: 'team boom' };
    const playerError = { item: { canned: 'player' }, message: 'player boom' };
    importRunner.recordUpsertResult.mockResolvedValue(
      outcome({
        team: { success: false, imported: 2, errors: [teamError] },
        players: { success: false, imported: 3, errors: [playerError] },
      }),
    );
    const cannedTeamResult = {
      success: false,
      imported: 2,
      errors: [teamError],
    };
    const cannedPlayerResult = {
      success: false,
      imported: 3,
      errors: [playerError],
    };
    importResults.result
      .mockReturnValueOnce(cannedTeamResult)
      .mockReturnValueOnce(cannedPlayerResult);

    const result = await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era')],
      matchEmbeddedPlayersByRosterId: new Map(),
    });

    expect(importResults.result).toHaveBeenNthCalledWith(1, {
      imported: 2,
      errors: [teamError],
    });
    expect(importResults.result).toHaveBeenNthCalledWith(2, {
      imported: 3,
      errors: [playerError],
    });
    expect(result.teamResult).toBe(cannedTeamResult);
    expect(result.playerResult).toBe(cannedPlayerResult);
  });

  it('deduplicates identical team and player errors across calls', async () => {
    const teamError = {
      item: { era: 'Fourth era', rulesSets: [] },
      message: 'Era "Fourth era" declares 0 rules sets; skipped.',
    };
    const playerError = {
      item: { position: 'Ogre' },
      message: 'No curated characteristics for "Ogre"; skipped.',
    };
    importRunner.recordUpsertResult.mockResolvedValue(
      outcome({
        team: { success: false, imported: 1, errors: [teamError] },
        players: { success: false, imported: 0, errors: [playerError] },
      }),
    );
    importResults.result.mockImplementation((options) => ({
      success: options.errors.length === 0,
      ...options,
    }));

    const result = await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era'), entry(2, 'Fourth era')],
      matchEmbeddedPlayersByRosterId: new Map(),
    });

    expect(result.teamResult.errors).toEqual([teamError]);
    expect(result.playerResult.errors).toEqual([playerError]);
    expect(result.teamResult.imported).toBe(2);
  });

  it('keeps distinct team and player errors across calls', async () => {
    // Same message, different item: proves the dedup key is [item, message]
    // together, not message alone -- a message-only key would wrongly
    // collapse these two into one.
    const teamErrorA = { item: { rosterId: 1 }, message: 'boom' };
    const teamErrorB = { item: { rosterId: 2 }, message: 'boom' };
    importRunner.recordUpsertResult
      .mockResolvedValueOnce(
        outcome({
          team: { success: false, imported: 0, errors: [teamErrorA] },
        }),
      )
      .mockResolvedValueOnce(
        outcome({
          team: { success: false, imported: 0, errors: [teamErrorB] },
        }),
      );
    importResults.result.mockImplementation((options) => ({
      success: options.errors.length === 0,
      ...options,
    }));

    const result = await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era'), entry(2, 'Fourth era')],
      matchEmbeddedPlayersByRosterId: new Map(),
    });

    expect(result.teamResult.errors).toEqual([teamErrorA, teamErrorB]);
  });

  it('records a failed call on the team result and carries on', async () => {
    importRunner.recordUpsertResult
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(
        outcome({ team: { success: true, imported: 1, errors: [] } }),
      );

    const result = await service.importRosterFiles({
      rosters: [entry(1, 'Fourth era'), entry(2, 'Fourth era')],
      matchEmbeddedPlayersByRosterId: new Map(),
    });

    expect(importResults.result).toHaveBeenNthCalledWith(1, {
      imported: 1,
      errors: [],
    });
    expect(result).toBeDefined();
  });
});
