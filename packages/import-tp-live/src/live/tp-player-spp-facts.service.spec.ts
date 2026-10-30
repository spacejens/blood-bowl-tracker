import type { TpImportedPlayer } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { rosterPlayer, tpRoster } from '../roster/tp-roster.test-helpers';
import { TpPlayerSppFactsService } from './tp-player-spp-facts.service';

const CAREER = {
  touchdowns: 3,
  completions: 4,
  interceptions: 1,
  mvpAwards: 2,
  casualties: 5,
};

function importedPlayer(
  overrides: Partial<TpImportedPlayer> = {},
): TpImportedPlayer {
  return {
    lineUpId: 5001,
    playerId: 9,
    created: false,
    reportedSppTotal: 12,
    ...overrides,
  };
}

describe('TpPlayerSppFactsService', () => {
  let service: TpPlayerSppFactsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpPlayerSppFactsService],
    }).compile();
    service = moduleRef.get(TpPlayerSppFactsService);
  });

  it('gives each imported player its reported total and its roster career counts', () => {
    const roster = tpRoster({
      players: [rosterPlayer({ id: 5001, careerCounts: CAREER })],
    });

    expect(
      service.collect({ roster, importedPlayers: [importedPlayer()] }),
    ).toEqual([
      {
        playerId: 9,
        reportedSppTotal: 12,
        careerCounts: {
          touchdown: 3,
          completion: 4,
          interception: 1,
          mvp_award: 2,
          casualty: 5,
        },
      },
    ]);
  });

  it('gives no career counts to a roster player TP reported none for', () => {
    const roster = tpRoster({ players: [rosterPlayer({ id: 5001 })] });

    expect(
      service.collect({ roster, importedPlayers: [importedPlayer()] }),
    ).toEqual([{ playerId: 9, reportedSppTotal: 12 }]);
  });

  it('gives no career counts to a player seen only in a match snapshot', () => {
    const roster = tpRoster({
      players: [rosterPlayer({ id: 5001, careerCounts: CAREER })],
    });

    expect(
      service.collect({
        roster,
        importedPlayers: [
          importedPlayer({
            lineUpId: 7777,
            playerId: 10,
            reportedSppTotal: 30,
          }),
        ],
      }),
    ).toEqual([{ playerId: 10, reportedSppTotal: 30 }]);
  });

  it('passes each imported player its unspent snapshot when it has one', () => {
    const snapshot = { unspentSpp: 4, snapshotSppTotal: 12 };
    expect(
      service.collect({
        roster: tpRoster({ players: [] }),
        importedPlayers: [
          {
            lineUpId: 1,
            playerId: 10,
            created: false,
            reportedSppTotal: 12,
            unspentSppSnapshot: snapshot,
          },
          { lineUpId: 2, playerId: 11, created: false, reportedSppTotal: 5 },
        ],
      }),
    ).toEqual([
      { playerId: 10, reportedSppTotal: 12, unspentSppSnapshot: snapshot },
      { playerId: 11, reportedSppTotal: 5 },
    ]);
  });

  it('returns nothing when no player was imported', () => {
    expect(
      service.collect({ roster: tpRoster(), importedPlayers: [] }),
    ).toEqual([]);
  });
});
