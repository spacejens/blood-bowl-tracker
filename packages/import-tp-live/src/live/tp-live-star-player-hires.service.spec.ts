import type { TeamEra } from '@blood-bowl-tracker/api-contract';
import type { ExternalSystem, Player, Position } from '@blood-bowl-tracker/db';
import { NAME_EXTERNAL_SYSTEM } from '@blood-bowl-tracker/domain-enums';
import type { PositionCharacteristicsContext } from '@blood-bowl-tracker/game-data';
import {
  ExternalSystemsService,
  PlayersService,
  PositionRulesSetsService,
  PositionsService,
} from '@blood-bowl-tracker/game-data';
import type {
  TpInducedStarPlayer,
  TpMatchEvent,
} from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  AWAY_ROSTER_ID,
  HOME_ROSTER_ID,
  tpMatch,
} from '../match/tp-match.test-helpers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpNameExternalIdService } from '../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpLiveStarPlayerHiresService } from './tp-live-star-player-hires.service';

const EXTERNAL_SYSTEM_NAME = 'some-external-system';
const TP_SYSTEM_ID = 1;
const NAME_SYSTEM_ID = 2;
const HOME_TEAM_ERA: TeamEra = { id: 31, eraId: 40 };
const AWAY_TEAM_ERA: TeamEra = { id: 32, eraId: 41 };
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

describe('TpLiveStarPlayerHiresService', () => {
  let service: TpLiveStarPlayerHiresService;
  let externalSystems: MockProxy<ExternalSystemsService>;
  let positions: MockProxy<PositionsService>;
  let positionRulesSets: MockProxy<PositionRulesSetsService>;
  let players: MockProxy<PlayersService>;
  let nameExternalId: MockProxy<TpNameExternalIdService>;

  beforeEach(async () => {
    externalSystems = mock<ExternalSystemsService>();
    positions = mock<PositionsService>();
    positionRulesSets = mock<PositionRulesSetsService>();
    players = mock<PlayersService>();
    nameExternalId = mock<TpNameExternalIdService>();
    externalSystems.upsert
      .mockResolvedValueOnce({
        system: mock<ExternalSystem>({ id: TP_SYSTEM_ID }),
        created: false,
      })
      .mockResolvedValueOnce({
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
        TpLiveStarPlayerHiresService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: ExternalSystemsService, useValue: externalSystems },
        { provide: PositionsService, useValue: positions },
        { provide: PositionRulesSetsService, useValue: positionRulesSets },
        { provide: PlayersService, useValue: players },
        { provide: TpNameExternalIdService, useValue: nameExternalId },
      ],
    }).compile();
    service = moduleRef.get(TpLiveStarPlayerHiresService);
  });

  const importHires = (
    matchEvents: TpMatchEvent[],
    teamEras: {
      home: TeamEra | undefined;
      away: TeamEra | undefined;
    } = { home: HOME_TEAM_ERA, away: AWAY_TEAM_ERA },
  ) =>
    service.importHires({
      match: tpMatch({ matchEvents }),
      homeTeamEra: teamEras.home,
      awayTeamEra: teamEras.away,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

  it('imports and resolves nothing for a match with no star player hires', async () => {
    await expect(importHires([])).resolves.toEqual({
      success: true,
      imported: 0,
      errors: [],
    });
    expect(externalSystems.upsert).not.toHaveBeenCalled();
    expect(positions.upsert).not.toHaveBeenCalled();
    expect(players.upsert).not.toHaveBeenCalled();
  });

  it('ignores an inducements roll that hired no star players', async () => {
    await expect(
      importHires([inducements(HOME_ROSTER_ID, [])]),
    ).resolves.toEqual({ success: true, imported: 0, errors: [] });
    expect(externalSystems.upsert).not.toHaveBeenCalled();
    expect(positions.upsert).not.toHaveBeenCalled();
    expect(players.upsert).not.toHaveBeenCalled();
  });

  it('upserts the star position and the hired player into the home team era', async () => {
    await expect(
      importHires([inducements(HOME_ROSTER_ID, [GRIFF])]),
    ).resolves.toEqual({ success: true, imported: 1, errors: [] });

    expect(externalSystems.upsert).toHaveBeenCalledWith({
      name: EXTERNAL_SYSTEM_NAME,
      category: 'imported_data_source',
    });
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
      HOME_TEAM_ERA.eraId,
    );
    expect(players.upsert).toHaveBeenCalledWith({
      name: GRIFF.name,
      teamEraId: HOME_TEAM_ERA.id,
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
      AWAY_TEAM_ERA.eraId,
    );
    expect(players.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        teamEraId: AWAY_TEAM_ERA.id,
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

    expect(result).toEqual({
      success: false,
      imported: 1,
      errors: [
        {
          item: hireItem(HOME_ROSTER_ID, GRIFF),
          message: `Skipped hired star player "Griff Oberwald" (roster ${HOME_ROSTER_ID}): position ${GRIFF_POSITION_ID} has no catalog characteristics in era ${HOME_TEAM_ERA.eraId}; import the official team list first`,
        },
      ],
    });
    expect(players.upsert).toHaveBeenCalledTimes(1);
    expect(players.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ positionId: MORG_POSITION_ID }),
    );
  });

  it('treats an era with no rules sets as missing catalog characteristics', async () => {
    positionRulesSets.findCharacteristicsContext.mockResolvedValue(undefined);

    const result = await importHires([inducements(HOME_ROSTER_ID, [GRIFF])]);

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain(
      'has no catalog characteristics',
    );
    expect(players.upsert).not.toHaveBeenCalled();
  });

  it('imports a star listed twice for one roster only once', async () => {
    const result = await importHires([
      inducements(HOME_ROSTER_ID, [GRIFF], 1),
      inducements(HOME_ROSTER_ID, [GRIFF], 2),
    ]);

    expect(result.imported).toBe(1);
    expect(positions.upsert).toHaveBeenCalledTimes(1);
    expect(players.upsert).toHaveBeenCalledTimes(1);
  });

  it('imports the same star hired by both teams once per team', async () => {
    const result = await importHires([
      inducements(HOME_ROSTER_ID, [GRIFF], 1),
      inducements(AWAY_ROSTER_ID, [GRIFF], 2),
    ]);

    expect(result.imported).toBe(2);
    expect(players.upsert).toHaveBeenCalledTimes(2);
  });

  it('records an error when the hiring side has no team era', async () => {
    const result = await importHires([inducements(AWAY_ROSTER_ID, [GRIFF])], {
      home: HOME_TEAM_ERA,
      away: undefined,
    });

    expect(result).toEqual({
      success: false,
      imported: 0,
      errors: [
        {
          item: hireItem(AWAY_ROSTER_ID, GRIFF),
          message: `Skipped hired star player "Griff Oberwald" (roster ${AWAY_ROSTER_ID}): could not resolve the hiring team era`,
        },
      ],
    });
    expect(positions.upsert).not.toHaveBeenCalled();
  });

  it('records an error for a hire by a roster that is neither side of the match', async () => {
    const result = await importHires([inducements(999, [GRIFF])]);

    expect(result.errors).toEqual([
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

    expect(result).toEqual({
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
    expect(players.upsert).not.toHaveBeenCalled();
  });

  it('records a failed characteristics lookup and skips that hire', async () => {
    positionRulesSets.findCharacteristicsContext.mockRejectedValue(
      new Error('db down'),
    );

    const result = await importHires([inducements(HOME_ROSTER_ID, [GRIFF])]);

    expect(result.errors).toEqual([
      {
        item: hireItem(HOME_ROSTER_ID, GRIFF),
        message: `Failed to look up the characteristics of star player position "Griff Oberwald" (position ${GRIFF_POSITION_ID}, era ${HOME_TEAM_ERA.eraId}): db down`,
      },
    ]);
    expect(players.upsert).not.toHaveBeenCalled();
  });

  it('records a failed player upsert', async () => {
    players.upsert.mockRejectedValue(new Error('invalid characteristics'));

    const result = await importHires([inducements(HOME_ROSTER_ID, [GRIFF])]);

    expect(result).toEqual({
      success: false,
      imported: 0,
      errors: [
        {
          item: hireItem(HOME_ROSTER_ID, GRIFF),
          message: `Failed to upsert hired star player "Griff Oberwald" (roster ${HOME_ROSTER_ID}): invalid characteristics`,
        },
      ],
    });
  });

  it('records a failed external-system upsert and imports nothing', async () => {
    externalSystems.upsert.mockReset();
    externalSystems.upsert.mockRejectedValue(new Error('db down'));

    await expect(
      importHires([inducements(HOME_ROSTER_ID, [GRIFF])]),
    ).resolves.toEqual({
      success: false,
      imported: 0,
      errors: [
        {
          item: {
            externalSystems: [EXTERNAL_SYSTEM_NAME, NAME_EXTERNAL_SYSTEM.name],
          },
          message: 'db down',
        },
      ],
    });
    expect(positions.upsert).not.toHaveBeenCalled();
  });
});
