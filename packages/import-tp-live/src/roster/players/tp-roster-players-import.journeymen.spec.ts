import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  rosterPlayer,
  TP_SYSTEM_ID,
  tpRoster,
} from '../tp-roster.test-helpers';
import type { TpRosterPlayersImportService } from './tp-roster-players-import.service';
import type {
  PlayersImportMocks,
  RunPlayersImportOptions,
} from './tp-roster-players-import.test-helpers';
import {
  buildPlayersImport,
  runPlayersImport,
} from './tp-roster-players-import.test-helpers';

const LONER_MASTER_IDS = new Set([11]);
const LINE_UP_LONER_MASTER_IDS = new Set([11, 154]);

describe('TpRosterPlayersImportService journeymen', () => {
  let mocks: PlayersImportMocks;
  let errors: ImportError[];

  beforeEach(() => {
    errors = [];
  });

  async function makeService(
    configure?: (m: PlayersImportMocks) => void,
  ): Promise<TpRosterPlayersImportService> {
    const built = await buildPlayersImport(configure);
    mocks = built.mocks;
    return built.service;
  }

  const run = (
    service: TpRosterPlayersImportService,
    options: Omit<RunPlayersImportOptions, 'errors'> = {},
  ) => runPlayersImport(service, { ...options, errors });

  /** The payload of the n-th upsert. */
  const payload = (n = 0) => mocks.players.upsert.mock.calls[n][0];

  it('decides a roster-file player as a roster entry and a match-snapshot-only one as not', async () => {
    const service = await makeService((m) => {
      m.journeymen.lineUpLonerMasterIds.mockResolvedValue(
        LINE_UP_LONER_MASTER_IDS,
      );
    });
    const listed = rosterPlayer({ id: 5001 });
    const departed = rosterPlayer({
      id: 5009,
      name: 'Journeyman',
      skillMasterIds: [154],
    });

    await run(service, {
      players: [listed],
      embedded: [departed],
      lonerMasterIds: LONER_MASTER_IDS,
    });

    const calls = mocks.journeymen.decide.mock.calls.map(
      ([options]) => options,
    );
    expect(calls).toHaveLength(2);
    const byId = new Map(calls.map((options) => [options.player.id, options]));
    expect(byId.get(5001)).toEqual({
      player: listed,
      position: { positionId: 11, mercenary: undefined },
      roster: tpRoster({ players: [listed] }),
      isRosterEntry: true,
      lonerMasterIds: LONER_MASTER_IDS,
    });
    expect(byId.get(5009)?.isRosterEntry).toBe(false);
    expect(byId.get(5009)?.lonerMasterIds).toBe(LINE_UP_LONER_MASTER_IDS);
  });

  it("names the line-up players' Loner ids in one call, from the match-snapshot-only players", async () => {
    const service = await makeService();
    const listed = rosterPlayer({ id: 5001, name: 'Journeyman' });
    const departed = rosterPlayer({
      id: 5009,
      name: 'Journeyman',
      skillMasterIds: [154],
    });
    const recruit = rosterPlayer({
      id: 5010,
      name: 'Journeyman',
      skillMasterIds: [103],
    });

    await run(service, {
      players: [listed],
      embedded: [departed, recruit, rosterPlayer({ id: 5001 })],
      lonerMasterIds: LONER_MASTER_IDS,
    });

    expect(mocks.journeymen.lineUpLonerMasterIds).toHaveBeenCalledTimes(1);
    expect(mocks.journeymen.lineUpLonerMasterIds).toHaveBeenCalledWith({
      players: [departed, recruit],
      rosterLonerMasterIds: LONER_MASTER_IDS,
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });
  });

  it('sends a decided journeyman marker and returns the player among the journeymen', async () => {
    const service = await makeService((m) => {
      m.journeymen.decide.mockReturnValue(true);
    });

    const outcome = await run(service);

    expect(payload()).toEqual(expect.objectContaining({ isJourneyman: true }));
    expect(outcome.journeymanPlayerIds).toEqual(new Set([700]));
  });

  it('sends a cleared marker without returning the player among the journeymen', async () => {
    const service = await makeService((m) => {
      m.journeymen.decide.mockReturnValue(false);
    });

    const outcome = await run(service);

    expect(payload()).toEqual(expect.objectContaining({ isJourneyman: false }));
    expect(outcome.journeymanPlayerIds).toEqual(new Set());
  });

  it('leaves the marker out when the sighting decides none', async () => {
    const service = await makeService();

    const outcome = await run(service);

    expect(payload()).not.toHaveProperty('isJourneyman');
    expect(outcome.journeymanPlayerIds).toEqual(new Set());
  });
});
