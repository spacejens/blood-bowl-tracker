import type {
  PositionCharacteristics,
  PositionHeader,
  PositionKeyword,
  PositionStartingSkill,
  PositionTopPlayer,
} from '@blood-bowl-tracker/game-data';
import {
  PositionRulesSetKeywordsService,
  PositionRulesSetSkillsService,
  PositionRulesSetsService,
  PositionsService,
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
  passthroughEntityComponents,
  stubEntityEmoji,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_POSITION_CHARACTERISTICS_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_KEYWORDS_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_NO_CHARACTERISTICS_MESSAGE,
  DEEPDIVE_POSITION_NO_PLAYERS_MESSAGE,
  DEEPDIVE_POSITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_POSITION_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_PLAYER_COUNT_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_SKILLS_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_TOP_PLAYERS_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { passthroughLeaderboard } from '../../insights/leaderboard-mock.test-helpers';
import { PlayerContextService } from '../../insights/player-context.service';
import { passthroughPlayerContext } from '../../insights/player-context-mock.test-helpers';
import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  POSITION_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { PositionDeepdiveService } from './position-deepdive.service';
import { PositionKeywordsSectionService } from './position-keywords-section.service';
import { PositionStatLineService } from './position-stat-line.service';

const bb2016: PositionCharacteristics = {
  rulesSetId: 1,
  rulesSetName: 'BB2016',
  moveFormat: 'bare',
  move: 7,
  strengthFormat: 'bare',
  strength: 3,
  agilityFormat: 'bare',
  agility: 3,
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
  strength: 3,
  agilityFormat: 'plus',
  agility: 3,
  passingFormat: 'plus',
  passing: 4,
  armourFormat: 'plus',
  armour: 9,
};

/**
 * Canned composer output. `PositionStatLineService` has a dependency of its
 * own, and this spec asserts composition rather than rendered text, so it is
 * mocked here; the exact strings it produces are asserted in
 * position-stat-line.service.spec.ts.
 */
const STUB_STAT_LINE = 'BB2020: MA 7 ST 3 AG 3+ PA 4+ AV 9+ Block, Dodge';

function mockStatLine(): MockProxy<PositionStatLineService> {
  const statLine = mock<PositionStatLineService>();
  statLine.formatLines.mockReturnValue([STUB_STAT_LINE]);
  return statLine;
}

interface MakeServiceOptions {
  positions: PositionsService;
  positionRulesSets: PositionRulesSetsService;
  positionRulesSetSkills?: MockProxy<PositionRulesSetSkillsService>;
  positionRulesSetKeywords?: MockProxy<PositionRulesSetKeywordsService>;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  leaderboard?: MockProxy<LeaderboardService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  playerContext?: MockProxy<PlayerContextService>;
  statLine?: MockProxy<PositionStatLineService>;
}

async function makeService({
  positions,
  positionRulesSets,
  positionRulesSetSkills = makeRulesSetSkills([]),
  positionRulesSetKeywords = makeRulesSetKeywords([]),
  databaseTimeout = mockDatabaseTimeout(),
  leaderboard = passthroughLeaderboard(),
  entityComponents = passthroughEntityComponents(),
  playerContext = passthroughPlayerContext(),
  statLine = mockStatLine(),
}: MakeServiceOptions): Promise<{
  service: PositionDeepdiveService;
  leaderboard: MockProxy<LeaderboardService>;
  entityComponents: MockProxy<EntityComponentsService>;
  playerContext: MockProxy<PlayerContextService>;
  statLine: MockProxy<PositionStatLineService>;
  positionRulesSetSkills: MockProxy<PositionRulesSetSkillsService>;
  positionRulesSetKeywords: MockProxy<PositionRulesSetKeywordsService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionDeepdiveService,
      PositionKeywordsSectionService,
      { provide: PositionStatLineService, useValue: statLine },
      {
        provide: PositionRulesSetSkillsService,
        useValue: positionRulesSetSkills,
      },
      {
        provide: PositionRulesSetKeywordsService,
        useValue: positionRulesSetKeywords,
      },
      { provide: PositionsService, useValue: positions },
      { provide: PositionRulesSetsService, useValue: positionRulesSets },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: leaderboard },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: PlayerContextService, useValue: playerContext },
    ],
  }).compile();
  return {
    service: moduleRef.get(PositionDeepdiveService),
    leaderboard,
    entityComponents,
    playerContext,
    statLine,
    positionRulesSetSkills,
    positionRulesSetKeywords,
  };
}

function makePositions(options: {
  position?: PositionHeader;
  playerCount?: number;
  topPlayers?: PositionTopPlayer[];
}): MockProxy<PositionsService> {
  const positions = mock<PositionsService>();
  positions.findById.mockResolvedValue(options.position);
  positions.countPlayers.mockResolvedValue(options.playerCount ?? 0);
  positions.listTopPlayersBySpp.mockResolvedValue(options.topPlayers ?? []);
  return positions;
}

function makeRulesSets(
  rows: PositionCharacteristics[],
): MockProxy<PositionRulesSetsService> {
  const positionRulesSets = mock<PositionRulesSetsService>();
  positionRulesSets.listByPosition.mockResolvedValue(rows);
  return positionRulesSets;
}

function makeRulesSetSkills(
  rows: PositionStartingSkill[],
): MockProxy<PositionRulesSetSkillsService> {
  const positionRulesSetSkills = mock<PositionRulesSetSkillsService>();
  positionRulesSetSkills.listByPosition.mockResolvedValue(rows);
  return positionRulesSetSkills;
}

function makeRulesSetKeywords(
  rows: PositionKeyword[],
): MockProxy<PositionRulesSetKeywordsService> {
  const positionRulesSetKeywords = mock<PositionRulesSetKeywordsService>();
  positionRulesSetKeywords.listByPosition.mockResolvedValue(rows);
  return positionRulesSetKeywords;
}

/**
 * A `DatabaseTimeoutService` mock that passes the first `skip` calls through
 * and times the next one out, so a test can pin which of the seven queries a
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

describe('PositionDeepdiveService', () => {
  it('returns the not-found message when the position does not exist', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: undefined }),
      positionRulesSets: makeRulesSets([]),
    });

    await expect(service.resolve(999)).resolves.toBe(
      DEEPDIVE_POSITION_NOT_FOUND_MESSAGE,
    );
  });

  it('returns the timeout message when the position lookup times out', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([]),
      databaseTimeout: timeoutOnCall(0),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_TIMEOUT_MESSAGE,
    );
  });

  it('returns the characteristics timeout message when that query times out', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(1),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_CHARACTERISTICS_TIMEOUT_MESSAGE,
    );
  });

  it('returns the skills timeout message when the starting-skills query times out', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(2),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_SKILLS_TIMEOUT_MESSAGE,
    );
  });

  it('returns the keywords timeout message when that query times out', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(3),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_KEYWORDS_TIMEOUT_MESSAGE,
    );
  });

  it('returns the player-count timeout message when that query times out', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(4),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_PLAYER_COUNT_TIMEOUT_MESSAGE,
    );
  });

  it('returns the top-players timeout message when that query times out', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(5),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_TOP_PLAYERS_TIMEOUT_MESSAGE,
    );
  });

  it('returns the player-context timeout message when that query times out', async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        topPlayers: [{ id: 9, name: 'Griff', sppTotal: 130 }],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(6),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
    );
  });

  it('skips the player-context lookup entirely when there are no top players', async () => {
    // attachSuffixes does its own DB round trip; with no ranked players to
    // decorate there is nothing for it to look up, so it must not run at
    // all — running it anyway would risk a spurious
    // DEEPDIVE_POSITION_PLAYER_CONTEXT_TIMEOUT_MESSAGE in place of the
    // correct "no players" view if that unnecessary call happened to time
    // out. Pin this by timing out the 7th call: if attachSuffixes were
    // still invoked, this would return the timeout message instead of
    // rendering normally.
    const { service, playerContext } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        playerCount: 0,
        topPlayers: [],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(6),
    });

    const rendered = JSON.stringify(await service.resolve(1));

    expect(rendered).toContain(DEEPDIVE_POSITION_NO_PLAYERS_MESSAGE);
    expect(playerContext.attachSuffixes).not.toHaveBeenCalled();
  });

  it('renders races, one stat line per rules set, the player count and the top players', async () => {
    const statLine = mockStatLine();
    statLine.formatLines.mockReturnValue([
      'BB2016: MA 7 ST 3 AG 3 AV 8',
      'BB2020: MA 7 ST 3 AG 3+ PA 4+ AV 9+',
    ]);
    const { service } = await makeService({
      positions: makePositions({
        position: {
          name: 'Blitzer',
          races: [
            { id: 2, name: 'Human' },
            { id: 5, name: 'Orc' },
          ],
        },
        playerCount: 42,
        topPlayers: [
          { id: 9, name: 'Griff', sppTotal: 130 },
          { id: 10, name: 'Varag', sppTotal: 88 },
        ],
      }),
      positionRulesSets: makeRulesSets([bb2016, bb2020]),
      statLine,
    });

    const result = await service.resolve(1);

    // `passthroughLeaderboard()` stamps rank 1 on every row rather than
    // re-deriving ranks — the real ranking is covered by
    // leaderboard.service.spec.ts — so both rows read as "1." here.
    expect(result).toMatchObject({
      embeds: [
        {
          title: `${stubEntityEmoji(POSITION_BUTTON_CUSTOM_ID_PREFIX)} Blitzer`,
          description: [
            'Race(s): Human, Orc',
            '',
            'BB2016: MA 7 ST 3 AG 3 AV 8',
            'BB2020: MA 7 ST 3 AG 3+ PA 4+ AV 9+',
            '',
            'Held by 42 players',
            '',
            'Top players by SPP:',
            '1. Griff — 130',
            '1. Varag — 88',
          ].join('\n'),
        },
      ],
    });
  });

  it('builds its stat lines from the characteristics rows and the starting skills together', async () => {
    const skills: PositionStartingSkill[] = [
      {
        rulesSetId: 2,
        rulesSetName: 'BB2020',
        skillId: 1,
        skillName: 'Block',
        attributeValue: null,
        category: 'general',
      },
    ];
    const { service, statLine, positionRulesSetSkills } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2016, bb2020]),
      positionRulesSetSkills: makeRulesSetSkills(skills),
    });

    const result = await service.resolve(10);

    expect(positionRulesSetSkills.listByPosition).toHaveBeenCalledWith(10);
    expect(statLine.formatLines).toHaveBeenCalledWith([bb2016, bb2020], skills);
    expect(
      (result as { embeds: { description: string }[] }).embeds[0].description,
    ).toContain(STUB_STAT_LINE);
  });

  it('reports the empty cases rather than rendering blank sections', async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        playerCount: 0,
        topPlayers: [],
      }),
      positionRulesSets: makeRulesSets([]),
    });

    const rendered = JSON.stringify(await service.resolve(1));

    expect(rendered).toContain('Race(s): None recorded');
    expect(rendered).toContain(DEEPDIVE_POSITION_NO_CHARACTERISTICS_MESSAGE);
    expect(rendered).toContain('Held by 0 players');
    expect(rendered).toContain(DEEPDIVE_POSITION_NO_PLAYERS_MESSAGE);
  });

  it('skips the starting-skills lookup entirely when there are no characteristics rows', async () => {
    // With no characteristics rows recorded, there are no rules-set stat
    // lines for skill rows to attach to, so the query must not run at all —
    // running it anyway would risk a spurious
    // DEEPDIVE_POSITION_SKILLS_TIMEOUT_MESSAGE in place of the correct
    // "no characteristics" view if that unnecessary call happened to time
    // out.
    const { service, positionRulesSetSkills } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([]),
    });

    const rendered = JSON.stringify(await service.resolve(1));

    expect(rendered).toContain(DEEPDIVE_POSITION_NO_CHARACTERISTICS_MESSAGE);
    expect(positionRulesSetSkills.listByPosition).not.toHaveBeenCalled();
  });

  it('shows the position keywords after the stat lines', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2020]),
      positionRulesSetKeywords: makeRulesSetKeywords([
        {
          rulesSetId: 25,
          rulesSetName: 'BB2025',
          keywordId: 1,
          keywordName: 'Goblin',
          kind: 'species',
        },
      ]),
    });

    const description = (
      (await service.resolve(1)) as { embeds: { description: string }[] }
    ).embeds[0].description;

    expect(description).toContain('BB2025 keywords: Goblin');
    expect(description.indexOf(STUB_STAT_LINE)).toBeLessThan(
      description.indexOf('BB2025 keywords: Goblin'),
    );
  });

  it('shows no keyword line for a position with none', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2020]),
      positionRulesSetKeywords: makeRulesSetKeywords([]),
    });

    const rendered = JSON.stringify(await service.resolve(1));

    expect(rendered).not.toContain('keywords:');
  });

  it('runs no keyword query for a position with no characteristics', async () => {
    const { service, positionRulesSetKeywords } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([]),
    });

    await service.resolve(1);

    expect(positionRulesSetKeywords.listByPosition).not.toHaveBeenCalled();
  });

  it('uses the singular for a position held by exactly one player', async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        playerCount: 1,
      }),
      positionRulesSets: makeRulesSets([bb2020]),
    });

    expect(JSON.stringify(await service.resolve(1))).toContain(
      'Held by 1 player\\n',
    );
  });

  it('ranks top players by SPP total, not by player id or fetch order', async () => {
    const { service, leaderboard } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        topPlayers: [
          { id: 9, name: 'Griff', sppTotal: 130 },
          { id: 10, name: 'Varag', sppTotal: 88 },
        ],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
    });

    await service.resolve(1);

    // Asserted on the mocked call rather than a real LeaderboardService: it
    // injects DatabaseTimeoutService and EntityComponentsService, so it is
    // not the dependency-free kind of collaborator CLAUDE.md's real-provider
    // carve-out covers, and topRanksWithTies's own ranking/tie behavior
    // already has dedicated coverage in leaderboard.service.spec.ts. This
    // still catches a plausible mapping mistake like `count: player.id`.
    expect(leaderboard.topRanksWithTies).toHaveBeenCalledWith(
      [
        { id: 9, name: 'Griff', sppTotal: 130, count: 130 },
        { id: 10, name: 'Varag', sppTotal: 88, count: 88 },
      ],
      5, // TOP_PLAYERS_TOP_ENTRIES, not exported from the service
    );
  });

  it("appends each top player's team, era and coach context to their name", async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        topPlayers: [{ id: 9, name: 'Griff', sppTotal: 130 }],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
      playerContext: passthroughPlayerContext(
        ' (Reikland Reavers, Second Era, Bob)',
      ),
    });

    expect(JSON.stringify(await service.resolve(1))).toContain(
      '1. Griff (Reikland Reavers, Second Era, Bob) — 130',
    );
  });

  it('decorates top players with their team, era and coach, but not position or race', async () => {
    const { service, playerContext } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        topPlayers: [{ id: 9, name: 'Griff', sppTotal: 130 }],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
    });

    await service.resolve(1);

    // Every player already holds this same position, so repeating it on each
    // row would say nothing new, and a position is not scoped to one race.
    // Era is different: one position's roster slot spans many eras, so two
    // top players for it can come from very different points in history, and
    // the era is what tells them apart.
    expect(playerContext.attachSuffixes).toHaveBeenCalledWith(
      [{ id: 9, name: 'Griff', sppTotal: 130, count: 130, rank: 1 }],
      expect.any(Function) as (row: unknown) => number,
      {
        includePosition: false,
        includeTeam: true,
        includeRace: false,
        includeEra: true,
        includeCoach: true,
      },
    );
  });

  it('appends the overflow note when the entity components overflow', async () => {
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more not shown.',
    });
    entityComponents.getEmojiForPrefix.mockReturnValue('🏃');
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [{ id: 2, name: 'Human' }] },
      }),
      positionRulesSets: makeRulesSets([bb2020]),
      entityComponents,
    });

    expect(JSON.stringify(await service.resolve(1))).toContain(
      '…and 3 more not shown.',
    );
  });

  it('truncates the description to the Discord embed cap when a position has an unbounded number of races', async () => {
    // findById carries no cap on how many races a position resolves to, so a
    // position linked to many races (or races with long names) can produce a
    // description longer than Discord's MAX_DESCRIPTION_LENGTH. One name here
    // is ~9 chars plus a separator; 600 of them comfortably exceeds 4096.
    const manyRaces = Array.from({ length: 600 }, (_unused, index) => ({
      id: index,
      name: `Race ${index}`,
    }));
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: manyRaces },
      }),
      positionRulesSets: makeRulesSets([bb2020]),
    });

    const result = await service.resolve(1);

    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
  });

  it('offers race buttons ahead of top-player buttons', async () => {
    const { service, entityComponents } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [{ id: 2, name: 'Human' }] },
        topPlayers: [{ id: 9, name: 'Griff', sppTotal: 130 }],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
    });

    await service.resolve(1);

    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '2',
        label: 'Human',
      },
      {
        customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '9',
        label: 'Griff',
      },
    ]);
  });
});
