import type { ExternalSystem, Player, Position } from '@blood-bowl-tracker/db';
import { NAME_EXTERNAL_SYSTEM } from '@blood-bowl-tracker/domain-enums';
import type { PositionCharacteristicsContext } from '@blood-bowl-tracker/game-data';
import {
  ExternalSystemsService,
  PlayersService,
  PositionRulesSetsService,
  PositionsService,
} from '@blood-bowl-tracker/game-data';
import {
  ImportResultService,
  NameExternalIdService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import type {
  TpInducedStarPlayer,
  TpMatchEvent,
} from '@blood-bowl-tracker/parse-tp';
import { TpStarHireKeyService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  AWAY_ROSTER_ID,
  AWAY_TEAM_ERA_ID,
  ERA_ID,
  HOME_ROSTER_ID,
  HOME_TEAM_ERA_ID,
  matchContext,
  TP_SYSTEM_ID,
  tpMatch,
} from './tp-match.test-helpers';
import { TpStarPlayerHiresService } from './tp-star-player-hires.service';

const NAME_SYSTEM_ID = 2;
const GRIFF: TpInducedStarPlayer = {
  name: 'Griff Oberwald',
  lineUpMasterId: 4001,
  number: 90,
};
const MORG: TpInducedStarPlayer = {
  name: "Morg 'n' Thorg",
  lineUpMasterId: 4002,
  number: 91,
};
const GRIFF_POSITION_ID = 77;
const MORG_POSITION_ID = 78;
const RULES_SET_ID = 7;
const BASELINE = { move: 7, strength: 4, agility: 2, passing: 3, armour: 9 };

function inducements(
  rosterId: number,
  starPlayers: TpInducedStarPlayer[],
  tpEventId = 1,
): TpMatchEvent {
  return {
    type: 'inducements_roll',
    tpEventId,
    instant: '2026-06-13T14:00:00Z',
    rosterId,
    totalCost: 280000,
    starPlayers,
  };
}

function characteristicsContext(
  baseline: PositionCharacteristicsContext['baseline'],
): PositionCharacteristicsContext {
  return {
    rulesSetId: RULES_SET_ID,
    moveFormat: 'bare',
    strengthFormat: 'bare',
    agilityFormat: 'plus',
    passingFormat: 'plus',
    armourFormat: 'plus',
    baseline,
  };
}

function hireItem(rosterId: number, star: TpInducedStarPlayer) {
  return {
    rosterId,
    lineUpMasterId: star.lineUpMasterId,
    starPlayer: star.name,
  };
}

describe('TpStarPlayerHiresService', () => {
  let service: TpStarPlayerHiresService;
  let externalSystems: MockProxy<ExternalSystemsService>;
  let positions: MockProxy<PositionsService>;
  let positionRulesSets: MockProxy<PositionRulesSetsService>;
  let players: MockProxy<PlayersService>;
  let nameExternalId: MockProxy<NameExternalIdService>;

  beforeEach(async () => {
    externalSystems = mock<ExternalSystemsService>();
    positions = mock<PositionsService>();
    positionRulesSets = mock<PositionRulesSetsService>();
    players = mock<PlayersService>();
    nameExternalId = mock<NameExternalIdService>();
    externalSystems.upsert.mockResolvedValue({
      system: mock<ExternalSystem>({ id: NAME_SYSTEM_ID }),
      created: false,
    });
    const positionIds = new Map<string, number>([
      [GRIFF.name, GRIFF_POSITION_ID],
      [MORG.name, MORG_POSITION_ID],
    ]);
    positions.upsert.mockImplementation((data) => {
      const name = data.name!;
      return Promise.resolve({
        position: mock<Position>({ id: positionIds.get(name) ?? 0 }),
        created: true,
      });
    });
    nameExternalId.forStarPosition.mockImplementation(
      (name) => `name-id:${name}`,
    );
    positionRulesSets.findCharacteristicsContext.mockResolvedValue(
      characteristicsContext(BASELINE),
    );
    players.upsert.mockResolvedValue({
      player: mock<Player>({ id: 900 }),
      created: true,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpStarPlayerHiresService,
        ImportResultService,
        UpsertRecorderService,
        // Constructor-free key formatting, passed real so the tests assert
        // on the actual hired-star external id.
        TpStarHireKeyService,
        { provide: ExternalSystemsService, useValue: externalSystems },
        { provide: PositionsService, useValue: positions },
        { provide: PositionRulesSetsService, useValue: positionRulesSets },
        { provide: PlayersService, useValue: players },
        { provide: NameExternalIdService, useValue: nameExternalId },
      ],
    }).compile();
    service = moduleRef.get(TpStarPlayerHiresService);
  });

  const importHires = (matchEvents: TpMatchEvent[]) =>
    service.importHires({
      match: tpMatch({ matchEvents }),
      context: matchContext(),
    });

  it('imports and resolves nothing for a match with no star player hires', async () => {
    await expect(importHires([])).resolves.toEqual({
      result: { success: true, imported: 0, errors: [] },
      hiredStarPlayers: [],
    });
    expect(externalSystems.upsert).not.toHaveBeenCalled();
    expect(positions.upsert).not.toHaveBeenCalled();
    expect(players.upsert).not.toHaveBeenCalled();
  });

  it('ignores an inducements roll that hired no star players', async () => {
    await expect(
      importHires([inducements(HOME_ROSTER_ID, [])]),
    ).resolves.toEqual({
      result: { success: true, imported: 0, errors: [] },
      hiredStarPlayers: [],
    });
    expect(externalSystems.upsert).not.toHaveBeenCalled();
    expect(positions.upsert).not.toHaveBeenCalled();
    expect(players.upsert).not.toHaveBeenCalled();
  });

  it('upserts the star position and the hired player into the home team era, returning its id', async () => {
    await expect(
      importHires([inducements(HOME_ROSTER_ID, [GRIFF])]),
    ).resolves.toEqual({
      result: { success: true, imported: 1, errors: [] },
      hiredStarPlayers: [{ playerId: 900, created: true }],
    });

    expect(externalSystems.upsert).toHaveBeenCalledTimes(1);
    expect(externalSystems.upsert).toHaveBeenCalledWith(NAME_EXTERNAL_SYSTEM);
    expect(nameExternalId.forStarPosition).toHaveBeenCalledWith(GRIFF.name);
    expect(positions.upsert).toHaveBeenCalledWith({
      name: GRIFF.name,
      isStarPlayer: true,
      externalIds: [
        { externalSystemId: TP_SYSTEM_ID, externalId: GRIFF.name },
        {
          externalSystemId: NAME_SYSTEM_ID,
          externalId: `name-id:${GRIFF.name}`,
        },
      ],
    });
    expect(positionRulesSets.findCharacteristicsContext).toHaveBeenCalledWith(
      GRIFF_POSITION_ID,
      ERA_ID,
    );
    expect(players.upsert).toHaveBeenCalledWith({
      name: GRIFF.name,
      teamEraId: HOME_TEAM_ERA_ID,
      positionId: GRIFF_POSITION_ID,
      ...BASELINE,
      rulesSetId: RULES_SET_ID,
      externalIds: [
        {
          externalSystemId: TP_SYSTEM_ID,
          externalId: `star-${HOME_ROSTER_ID}-${GRIFF.lineUpMasterId}`,
        },
      ],
    });
  });

  it('attaches an away-team hire to the away team era', async () => {
    await importHires([inducements(AWAY_ROSTER_ID, [GRIFF])]);

    expect(positionRulesSets.findCharacteristicsContext).toHaveBeenCalledWith(
      GRIFF_POSITION_ID,
      ERA_ID,
    );
    expect(players.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        teamEraId: AWAY_TEAM_ERA_ID,
        externalIds: [
          {
            externalSystemId: TP_SYSTEM_ID,
            externalId: `star-${AWAY_ROSTER_ID}-${GRIFF.lineUpMasterId}`,
          },
        ],
      }),
    );
  });

  it('records an error for a hire with no catalog characteristics and still imports the others', async () => {
    positionRulesSets.findCharacteristicsContext
      .mockResolvedValueOnce(characteristicsContext(undefined))
      .mockResolvedValueOnce(characteristicsContext(BASELINE));

    const result = await importHires([
      inducements(HOME_ROSTER_ID, [GRIFF, MORG]),
    ]);

    expect(result.result).toEqual({
      success: false,
      imported: 1,
      errors: [
        {
          item: hireItem(HOME_ROSTER_ID, GRIFF),
          message: `Skipped hired star player "Griff Oberwald" (roster ${HOME_ROSTER_ID}): position ${GRIFF_POSITION_ID} has no catalog characteristics in era ${ERA_ID}; import the official team list first`,
        },
      ],
    });
    expect(result.hiredStarPlayers).toHaveLength(1);
    expect(players.upsert).toHaveBeenCalledTimes(1);
    expect(players.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ positionId: MORG_POSITION_ID }),
    );
  });

  it('treats an era with no rules sets as missing catalog characteristics', async () => {
    positionRulesSets.findCharacteristicsContext.mockResolvedValue(undefined);

    const result = await importHires([inducements(HOME_ROSTER_ID, [GRIFF])]);

    expect(result.result.imported).toBe(0);
    expect(result.result.errors).toHaveLength(1);
    expect(result.result.errors[0].message).toContain(
      'has no catalog characteristics',
    );
    expect(players.upsert).not.toHaveBeenCalled();
  });

  it('imports a star listed twice for one roster only once', async () => {
    const result = await importHires([
      inducements(HOME_ROSTER_ID, [GRIFF], 1),
      inducements(HOME_ROSTER_ID, [GRIFF], 2),
    ]);

    expect(result.result.imported).toBe(1);
    expect(result.hiredStarPlayers).toHaveLength(1);
    expect(positions.upsert).toHaveBeenCalledTimes(1);
    expect(players.upsert).toHaveBeenCalledTimes(1);
  });

  it('imports the same star hired by both teams once per team', async () => {
    const result = await importHires([
      inducements(HOME_ROSTER_ID, [GRIFF], 1),
      inducements(AWAY_ROSTER_ID, [GRIFF], 2),
    ]);

    expect(result.result.imported).toBe(2);
    expect(result.hiredStarPlayers).toHaveLength(2);
    expect(players.upsert).toHaveBeenCalledTimes(2);
  });

  it('records an error for a hire by a roster that is neither side of the match', async () => {
    const result = await importHires([inducements(999, [GRIFF])]);

    expect(result.result.errors).toEqual([
      {
        item: hireItem(999, GRIFF),
        message:
          'Skipped hired star player "Griff Oberwald" (roster 999): could not resolve the hiring team era',
      },
    ]);
    expect(positions.upsert).not.toHaveBeenCalled();
  });

  it('records a failed position upsert and skips that hire', async () => {
    positions.upsert.mockRejectedValueOnce(new Error('db down'));

    const result = await importHires([inducements(HOME_ROSTER_ID, [GRIFF])]);

    expect(result.result).toEqual({
      success: false,
      imported: 0,
      errors: [
        {
          item: hireItem(HOME_ROSTER_ID, GRIFF),
          message:
            'Failed to upsert star player position "Griff Oberwald": db down',
        },
      ],
    });
    expect(result.hiredStarPlayers).toEqual([]);
    expect(players.upsert).not.toHaveBeenCalled();
  });

  it('records a failed characteristics lookup and skips that hire', async () => {
    positionRulesSets.findCharacteristicsContext.mockRejectedValue(
      new Error('db down'),
    );

    const result = await importHires([inducements(HOME_ROSTER_ID, [GRIFF])]);

    expect(result.result.errors).toEqual([
      {
        item: hireItem(HOME_ROSTER_ID, GRIFF),
        message: `Failed to look up the characteristics of star player position "Griff Oberwald" (position ${GRIFF_POSITION_ID}, era ${ERA_ID}): db down`,
      },
    ]);
    expect(players.upsert).not.toHaveBeenCalled();
  });

  it('records a failed player upsert', async () => {
    players.upsert.mockRejectedValue(new Error('invalid characteristics'));

    const result = await importHires([inducements(HOME_ROSTER_ID, [GRIFF])]);

    expect(result.result).toEqual({
      success: false,
      imported: 0,
      errors: [
        {
          item: hireItem(HOME_ROSTER_ID, GRIFF),
          message: `Failed to upsert hired star player "Griff Oberwald" (roster ${HOME_ROSTER_ID}): invalid characteristics`,
        },
      ],
    });
    expect(result.hiredStarPlayers).toEqual([]);
  });

  it('reports a re-imported hire as not created', async () => {
    players.upsert.mockResolvedValue({
      player: mock<Player>({ id: 901 }),
      created: false,
    });

    const { hiredStarPlayers } = await importHires([
      inducements(HOME_ROSTER_ID, [GRIFF]),
    ]);

    expect(hiredStarPlayers).toEqual([{ playerId: 901, created: false }]);
  });

  it('records a failed external-system upsert and imports nothing', async () => {
    externalSystems.upsert.mockReset();
    externalSystems.upsert.mockRejectedValue(new Error('db down'));

    await expect(
      importHires([inducements(HOME_ROSTER_ID, [GRIFF])]),
    ).resolves.toEqual({
      result: {
        success: false,
        imported: 0,
        errors: [
          {
            item: { externalSystems: [NAME_EXTERNAL_SYSTEM.name] },
            message: 'db down',
          },
        ],
      },
      hiredStarPlayers: [],
    });
    expect(positions.upsert).not.toHaveBeenCalled();
  });
});
