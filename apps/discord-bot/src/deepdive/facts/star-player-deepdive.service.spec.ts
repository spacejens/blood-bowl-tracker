import type {
  PositionCharacteristics,
  StarPlayerHire,
} from '@blood-bowl-tracker/game-data';
import {
  PositionRulesSetsService,
  StarPlayersService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { EntityComponentsService } from '../../entity-components.service';
import {
  entityComponentsMock,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
  stubEntityEmoji,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_STAR_PLAYER_CHARACTERISTICS_TIMEOUT_MESSAGE,
  DEEPDIVE_STAR_PLAYER_HIRES_TIMEOUT_MESSAGE,
  DEEPDIVE_STAR_PLAYER_NO_CHARACTERISTICS_MESSAGE,
  DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_STAR_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { PositionCharacteristicsLineFormatterService } from './position-characteristics-line-formatter.service';
import { StarPlayerDeepdiveService } from './star-player-deepdive.service';

interface MakeServiceOptions {
  stars: StarPlayersService;
  positionRulesSets?: MockProxy<PositionRulesSetsService>;
  lineFormatter?: MockProxy<PositionCharacteristicsLineFormatterService>;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  entityComponents?: MockProxy<EntityComponentsService>;
}

async function makeService({
  stars,
  positionRulesSets = makeRulesSets([bb2020]),
  lineFormatter = mockLineFormatter(),
  databaseTimeout = mockDatabaseTimeout(),
  entityComponents = passthroughEntityComponents(),
}: MakeServiceOptions): Promise<{
  service: StarPlayerDeepdiveService;
  positionRulesSets: MockProxy<PositionRulesSetsService>;
  lineFormatter: MockProxy<PositionCharacteristicsLineFormatterService>;
  databaseTimeout: MockProxy<DatabaseTimeoutService>;
  entityComponents: MockProxy<EntityComponentsService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerDeepdiveService,
      { provide: StarPlayersService, useValue: stars },
      { provide: PositionRulesSetsService, useValue: positionRulesSets },
      {
        provide: PositionCharacteristicsLineFormatterService,
        useValue: lineFormatter,
      },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();
  return {
    service: moduleRef.get(StarPlayerDeepdiveService),
    positionRulesSets,
    lineFormatter,
    databaseTimeout,
    entityComponents,
  };
}

function makeStars(options: {
  star?: { positionId: number; name: string };
  hires?: StarPlayerHire[];
}): MockProxy<StarPlayersService> {
  const stars = mock<StarPlayersService>();
  stars.findById.mockResolvedValue(options.star);
  stars.listHiresByTeam.mockResolvedValue(options.hires ?? []);
  return stars;
}

const griff = { positionId: 20, name: 'Griff Oberwald' };

const hires: StarPlayerHire[] = [
  {
    teamId: 1,
    teamName: 'Reikland Reavers',
    raceName: 'Human',
    coachName: 'Rita',
    hireCount: 3,
  },
  {
    teamId: 2,
    teamName: 'Gouged Eye',
    raceName: 'Orc',
    coachName: 'Bob',
    hireCount: 1,
  },
];

const bb2016: PositionCharacteristics = {
  rulesSetId: 1,
  rulesSetName: 'BB2016',
  moveFormat: 'bare',
  move: 7,
  strengthFormat: 'bare',
  strength: 4,
  agilityFormat: 'bare',
  agility: 4,
  passingFormat: 'absent',
  passing: null,
  armourFormat: 'bare',
  armour: 8,
};

const bb2020: PositionCharacteristics = {
  rulesSetId: 2,
  rulesSetName: 'BB2020',
  moveFormat: 'bare',
  move: 7,
  strengthFormat: 'bare',
  strength: 4,
  agilityFormat: 'plus',
  agility: 2,
  passingFormat: 'plus',
  passing: 3,
  armourFormat: 'plus',
  armour: 9,
};

function makeRulesSets(
  rows: PositionCharacteristics[],
): MockProxy<PositionRulesSetsService> {
  const positionRulesSets = mock<PositionRulesSetsService>();
  positionRulesSets.listByPosition.mockResolvedValue(rows);
  return positionRulesSets;
}

/**
 * Canned formatter output. The formatter has a dependency of its own, so it
 * is mocked here rather than passed real; the text it actually produces is
 * asserted in position-characteristics-line-formatter.service.spec.ts.
 */
const STUB_STAT_LINE = 'BB2020: MA 7 ST 4 AG 2+ PA 3+ AV 9+';

function mockLineFormatter(): MockProxy<PositionCharacteristicsLineFormatterService> {
  const lineFormatter = mock<PositionCharacteristicsLineFormatterService>();
  lineFormatter.formatLine.mockReturnValue(STUB_STAT_LINE);
  return lineFormatter;
}

/**
 * A `DatabaseTimeoutService` mock that passes the first `skip` calls through
 * and times the next one out, so a test can pin which of the three queries a
 * timeout message belongs to.
 */
function timeoutOnCall(skip: number): MockProxy<DatabaseTimeoutService> {
  const databaseTimeout = mockDatabaseTimeout();
  for (let index = 0; index < skip; index += 1) {
    databaseTimeout.run.mockImplementationOnce(async (work) => work);
  }
  stubDatabaseTimeoutOnce(databaseTimeout);
  return databaseTimeout;
}

describe('StarPlayerDeepdiveService', () => {
  it('returns the not-found message when the position is not a star', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: undefined }),
    });
    expect(await service.resolve(999)).toBe(
      DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
    );
  });

  it('returns the timeout message when the identity lookup times out', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      databaseTimeout: timeoutOnCall(0),
    });
    expect(await service.resolve(20)).toBe(
      DEEPDIVE_STAR_PLAYER_TIMEOUT_MESSAGE,
    );
  });

  it('returns the characteristics timeout message when that query times out', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      databaseTimeout: timeoutOnCall(1),
    });
    expect(await service.resolve(20)).toBe(
      DEEPDIVE_STAR_PLAYER_CHARACTERISTICS_TIMEOUT_MESSAGE,
    );
  });

  it('returns the hires timeout message when the hire query times out', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      databaseTimeout: timeoutOnCall(2),
    });
    expect(await service.resolve(20)).toBe(
      DEEPDIVE_STAR_PLAYER_HIRES_TIMEOUT_MESSAGE,
    );
  });

  it('returns the not-found message when a star has no recorded hires', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires: [] }),
    });
    expect(await service.resolve(20)).toBe(
      DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
    );
  });

  it('renders one line per hiring team with a team button each', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
    });

    const result = await service.resolve(20);

    expect(result).toEqual({
      embeds: [
        {
          title: `${stubEntityEmoji(STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX)} Griff Oberwald`,
          description: [
            STUB_STAT_LINE,
            '',
            'Reikland Reavers (Human, Rita) — 3 hires',
            'Gouged Eye (Orc, Bob) — 1 hire',
          ].join('\n'),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'Reikland Reavers',
              custom_id: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}1`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'Gouged Eye',
              custom_id: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}2`,
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
  });

  it('keeps the game-data ordering rather than re-sorting', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
    });

    const result = await service.resolve(20);

    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    const hireLines = description.split('\n\n')[1].split('\n');
    expect(hireLines[0]).toContain('Reikland Reavers');
  });

  it('appends the overflow note when not every team got a component', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more without a link.',
    });
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      entityComponents,
    });

    const result = await service.resolve(20);

    expect(
      (result as { embeds: { description: string }[] }).embeds[0].description,
    ).toBe(
      [
        STUB_STAT_LINE,
        '',
        'Reikland Reavers (Human, Rita) — 3 hires',
        'Gouged Eye (Orc, Bob) — 1 hire',
        '…and 3 more without a link.',
      ].join('\n'),
    );
  });

  it('truncates the description to the Discord embed cap when a star has been hired by an unbounded number of teams', async () => {
    // listHiresByTeam carries no row limit, so a heavily-hired star (exactly
    // the case this feature's select-menu overflow exists for — see
    // `EntityComponentsService`) can produce a description longer than
    // Discord's MAX_DESCRIPTION_LENGTH. One line here is ~32 chars; 200 rows
    // (~6.4k chars plus newlines) comfortably exceeds the 4096-char cap.
    const manyHires: StarPlayerHire[] = Array.from(
      { length: 200 },
      (_unused, index) => ({
        teamId: index,
        teamName: `Team ${index}`,
        raceName: 'Human',
        coachName: 'Coach',
        hireCount: 1,
      }),
    );
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires: manyHires }),
    });

    const result = await service.resolve(20);

    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
  });

  it('omits the components key when nothing got a component', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      entityComponents,
    });

    expect(await service.resolve(20)).not.toHaveProperty('components');
  });

  it('reports the missing characteristics rather than rendering a blank stat section', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      positionRulesSets: makeRulesSets([]),
    });

    const result = await service.resolve(20);

    expect(
      (result as { embeds: { description: string }[] }).embeds[0].description,
    ).toBe(
      [
        DEEPDIVE_STAR_PLAYER_NO_CHARACTERISTICS_MESSAGE,
        '',
        'Reikland Reavers (Human, Rita) — 3 hires',
        'Gouged Eye (Orc, Bob) — 1 hire',
      ].join('\n'),
    );
  });

  it('puts one stat line per rules set above the hire list', async () => {
    const lineFormatter = mockLineFormatter();
    lineFormatter.formatLine
      .mockReturnValueOnce('BB2016: MA 7 ST 4 AG 4 AV 8')
      .mockReturnValueOnce('BB2020: MA 7 ST 4 AG 2+ PA 3+ AV 9+');
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      positionRulesSets: makeRulesSets([bb2016, bb2020]),
      lineFormatter,
    });

    const result = await service.resolve(20);

    expect(lineFormatter.formatLine).toHaveBeenNthCalledWith(1, bb2016);
    expect(lineFormatter.formatLine).toHaveBeenNthCalledWith(2, bb2020);
    expect(
      (result as { embeds: { description: string }[] }).embeds[0].description,
    ).toBe(
      [
        'BB2016: MA 7 ST 4 AG 4 AV 8',
        'BB2020: MA 7 ST 4 AG 2+ PA 3+ AV 9+',
        '',
        'Reikland Reavers (Human, Rita) — 3 hires',
        'Gouged Eye (Orc, Bob) — 1 hire',
      ].join('\n'),
    );
  });
});
