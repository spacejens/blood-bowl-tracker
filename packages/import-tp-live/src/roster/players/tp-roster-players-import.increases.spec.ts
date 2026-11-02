import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { PlayerCharacteristicCounts } from '@blood-bowl-tracker/domain-enums';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  rosterContext,
  rosterPlayer,
  RULES_SET,
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

const characteristics = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};

const COUNTS: PlayerCharacteristicCounts = {
  MA: 1,
  ST: 0,
  AG: 1,
  PA: 0,
  AV: 0,
};

describe('TpRosterPlayersImportService characteristic increases', () => {
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

  it('sends no increase counts in the upsert payload', async () => {
    const service = await makeService((m) => {
      m.increases.forPlayer.mockResolvedValue(COUNTS);
    });

    await run(service, { players: [rosterPlayer({ characteristics })] });

    const payload = mocks.players.upsert.mock.calls[0][0];
    expect(
      Object.keys(payload).filter((key) => key.endsWith('IncreaseCount')),
    ).toEqual([]);
  });

  it("returns the derived counts under the player's database id", async () => {
    const service = await makeService((m) => {
      m.increases.forPlayer.mockResolvedValue(COUNTS);
    });

    const outcome = await run(service, {
      players: [rosterPlayer({ characteristics })],
    });

    expect(outcome.increasesByPlayerId).toEqual(new Map([[700, COUNTS]]));
  });

  it('returns no entry for a player whose counts could not be derived', async () => {
    const service = await makeService((m) => {
      m.increases.forPlayer.mockResolvedValue(undefined);
    });

    const outcome = await run(service, {
      players: [rosterPlayer({ characteristics })],
    });

    expect(outcome.increasesByPlayerId.size).toBe(0);
  });

  it('returns no entry for a player whose upsert failed', async () => {
    const service = await makeService((m) => {
      m.increases.forPlayer.mockResolvedValue(COUNTS);
      m.players.upsert.mockRejectedValue(new Error('boom'));
    });

    const outcome = await run(service, {
      players: [rosterPlayer({ characteristics })],
    });

    expect(outcome.increasesByPlayerId.size).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it("measures against the player's own resolved rules set", async () => {
    const service = await makeService();

    await run(service, { players: [rosterPlayer({ characteristics })] });

    expect(mocks.increases.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ rulesSet: RULES_SET }),
    );
  });

  it('passes the derived reduction counts through', async () => {
    const reductions = {
      missNextGame: false,
      nigglingInjuryCount: 0,
      moveReductionCount: 0,
      strengthReductionCount: 0,
      agilityReductionCount: 0,
      passingReductionCount: 0,
      armourReductionCount: 1,
    };
    const service = await makeService((m) => {
      m.lastingInjuries.forRosterPlayer.mockReturnValue(reductions);
    });

    await run(service, { players: [rosterPlayer({ characteristics })] });

    expect(mocks.increases.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ reductions }),
    );
  });

  it('derives no counts for a player with no characteristics', async () => {
    const service = await makeService();

    const outcome = await run(service);

    expect(mocks.increases.forPlayer).not.toHaveBeenCalled();
    expect(outcome.increasesByPlayerId.size).toBe(0);
  });

  it('derives no counts when there is no single rules set', async () => {
    const service = await makeService();

    await run(service, {
      players: [rosterPlayer({ characteristics })],
      context: rosterContext({ rulesSet: undefined }),
    });

    expect(mocks.increases.forPlayer).not.toHaveBeenCalled();
  });

  it('passes the embedded position template as the baseline', async () => {
    const positionTemplate = {
      move: 5,
      strength: 4,
      agility: 3,
      passing: 6,
      armour: 8,
    };
    const service = await makeService();

    await run(service, {
      players: [rosterPlayer({ characteristics, positionTemplate })],
    });

    expect(mocks.increases.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ baseline: positionTemplate }),
    );
  });

  it('falls back to no baseline override when there is no template', async () => {
    const service = await makeService();

    await run(service, { players: [rosterPlayer({ characteristics })] });

    expect(mocks.increases.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ baseline: undefined }),
    );
  });

  it('converts the literal-0 passing to null when the rules set declares no Passing', async () => {
    const positionTemplate = {
      move: 5,
      strength: 4,
      agility: 3,
      passing: 0,
      armour: 8,
    };
    const service = await makeService();

    await run(service, {
      players: [rosterPlayer({ characteristics, positionTemplate })],
      context: rosterContext({
        rulesSet: { ...RULES_SET, passingFormat: 'absent' },
      }),
    });

    expect(mocks.increases.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        baseline: { ...positionTemplate, passing: null },
      }),
    );
  });
});
