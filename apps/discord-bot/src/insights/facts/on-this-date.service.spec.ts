import type {
  OnThisDateKilledPlayer,
  OnThisDateVictim,
  PlayerDeepdiveCategoryCounts,
} from '@blood-bowl-tracker/game-data';
import { OnThisDateService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import type { InteractionReplyOptions } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { PlayerKillerInfoFormatterService } from '../../deepdive/facts/player-killer-info-formatter.service';
import { PlayerRowButtonService } from '../../deepdive/player-row-button.service';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import { nullEntityComponents } from '../../entity-components-mock.test-helpers';
import {
  ON_THIS_DATE_NO_EVENTS_MESSAGE,
  ON_THIS_DATE_NO_MATCHES_MESSAGE,
  ON_THIS_DATE_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { EventCountLinesService } from '../../shared/event-count-lines.service';
import type { MonthDay } from '../../shared/month-day.service';
import { MonthDayService } from '../../shared/month-day.service';
import { TOPLIST_FETCH_LIMIT } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';
import { OnThisDateFactsService } from './on-this-date.service';

const ZERO_COUNTS: PlayerDeepdiveCategoryCounts = {
  simple: [],
  casualties: { total: 0, seriousInjuries: 0, killed: 0 },
  fouls: { total: 0, seriousInjuries: 0, killed: 0 },
};

const MONTH_DAY: MonthDay = { month: 2, day: 29 };

function victim(
  overrides: Partial<OnThisDateKilledPlayer> = {},
): OnThisDateKilledPlayer {
  return {
    playerId: 1,
    name: 'Griff Oberwald',
    sppTotal: 120,
    positionId: 10,
    positionName: 'Blitzer',
    isStarPlayer: false,
    teamId: 20,
    teamName: 'Reikland Reavers',
    raceId: 30,
    raceName: 'Human',
    coachId: 40,
    coachName: 'Bob',
    killer: {
      kind: 'team',
      teamId: 99,
      teamName: 'Gouged Eye',
      raceId: 98,
      raceName: 'Orc',
      coachId: 97,
      coachName: 'Grimly',
      viaFoul: false,
    },
    ...overrides,
  };
}

/**
 * The victim-only shape `OnThisDateService.getTopKilledPlayers` now returns,
 * with the killer carried on the object anyway (an extra runtime property
 * beyond `OnThisDateVictim`) so the default `getKillersForVictims` stub below
 * can echo it straight back — mirroring the real split without each test
 * having to wire up a separate killer for its own victim.
 */
function victimWithoutKiller(
  overrides: Partial<OnThisDateKilledPlayer> = {},
): OnThisDateVictim {
  return victim(overrides);
}

let onThisDate: MockProxy<OnThisDateService>;
let databaseTimeout: MockProxy<DatabaseTimeoutService>;
let entityComponents: MockProxy<EntityComponentsService>;
let leaderboard: MockProxy<LeaderboardService>;
let eventCountLines: MockProxy<EventCountLinesService>;
let monthDay: MockProxy<MonthDayService>;
let killerInfo: MockProxy<PlayerKillerInfoFormatterService>;
let playerRowButton: MockProxy<PlayerRowButtonService>;
let service: OnThisDateFactsService;

beforeEach(async () => {
  onThisDate = mock<OnThisDateService>();
  databaseTimeout = mockDatabaseTimeout();
  entityComponents = nullEntityComponents();
  leaderboard = mock<LeaderboardService>();
  eventCountLines = mock<EventCountLinesService>();
  monthDay = mock<MonthDayService>();
  killerInfo = mock<PlayerKillerInfoFormatterService>();
  playerRowButton = mock<PlayerRowButtonService>();

  onThisDate.countMatchesPlayed.mockResolvedValue(3);
  onThisDate.getEventCounts.mockResolvedValue(ZERO_COUNTS);
  onThisDate.getTopKilledPlayers.mockResolvedValue([]);
  // A canned response echoing back whatever killer the test's own victim
  // fixture already carries (or null when it carries none) — NOT a
  // reimplementation of the real killer-resolution algorithm, which is
  // covered by on-this-date.service.spec.ts in packages/game-data.
  onThisDate.getKillersForVictims.mockImplementation((victims) =>
    Promise.resolve(
      victims.map((candidate) => ({
        ...candidate,
        killer: (candidate as OnThisDateKilledPlayer).killer ?? null,
      })),
    ),
  );
  monthDay.format.mockReturnValue('February 29');
  monthDay.today.mockReturnValue(MONTH_DAY);
  eventCountLines.build.mockReturnValue(['Touchdowns scored: 4']);
  killerInfo.describe.mockReturnValue(
    'An unidentified player from Gouged Eye (Orc, Grimly)',
  );
  killerInfo.buildEntries.mockReturnValue([]);
  playerRowButton.buildPlayerRowButton.mockReturnValue({
    customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
    entityId: '1',
    label: 'Griff Oberwald',
  });
  // A canned response mirroring topRanksWithTies' shape for a "no ties, no
  // truncation" input, NOT a reimplementation of the real ranking/tie
  // algorithm — that is covered by leaderboard.service.spec.ts.
  leaderboard.topRanksWithTies.mockImplementation((rows) => ({
    rows: rows.map((row, index) => ({ ...row, rank: index + 1 })),
    truncatedCount: 0,
    tieGroupOpenEnded: false,
  }));

  const moduleRef = await Test.createTestingModule({
    providers: [
      OnThisDateFactsService,
      { provide: OnThisDateService, useValue: onThisDate },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: LeaderboardService, useValue: leaderboard },
      { provide: EventCountLinesService, useValue: eventCountLines },
      { provide: MonthDayService, useValue: monthDay },
      {
        provide: PlayerKillerInfoFormatterService,
        useValue: killerInfo,
      },
      { provide: PlayerRowButtonService, useValue: playerRowButton },
    ],
  }).compile();
  service = moduleRef.get(OnThisDateFactsService);
});

function embed(result: string | InteractionReplyOptions): {
  title: string;
  description: string;
} {
  return (result as InteractionReplyOptions).embeds?.[0] as {
    title: string;
    description: string;
  };
}

describe('OnThisDateFactsService.resolve', () => {
  it('titles the embed with the named date', async () => {
    const result = await service.resolve({
      monthDay: MONTH_DAY,
      scope: {},
    });
    expect(embed(result).title).toContain('On this date: February 29');
    expect(monthDay.format).toHaveBeenCalledWith(MONTH_DAY);
  });

  it('passes the same date and scope to all three queries', async () => {
    const scope = { eraId: 7 };
    await service.resolve({ monthDay: MONTH_DAY, scope });
    expect(onThisDate.countMatchesPlayed).toHaveBeenCalledWith({
      month: 2,
      day: 29,
      scope,
    });
    expect(onThisDate.getEventCounts).toHaveBeenCalledWith({
      month: 2,
      day: 29,
      scope,
    });
    expect(onThisDate.getTopKilledPlayers).toHaveBeenCalledWith({
      month: 2,
      day: 29,
      scope,
      limit: 21,
    });
  });

  it('reports the match count and the counter block', async () => {
    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(embed(result).description).toBe(
      ['Matches played: 3', '', 'Touchdowns scored: 4'].join('\n'),
    );
    expect(eventCountLines.build).toHaveBeenCalledWith(
      ZERO_COUNTS,
      ON_THIS_DATE_NO_EVENTS_MESSAGE,
    );
  });

  it('says nothing was ever played when the match count is zero', async () => {
    onThisDate.countMatchesPlayed.mockResolvedValue(0);
    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(result).toEqual({
      embeds: [
        {
          title: expect.stringContaining('On this date: February 29') as string,
          description: ON_THIS_DATE_NO_MATCHES_MESSAGE,
        },
      ],
    });
  });

  it('lists each victim with their killer', async () => {
    onThisDate.getTopKilledPlayers.mockResolvedValue([victim()]);
    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(embed(result).description).toContain('Famous deaths:');
    expect(embed(result).description).toContain(
      '1. Griff Oberwald (Blitzer, Reikland Reavers, Human, Bob) — 120 SPP, killed by an unidentified player from Gouged Eye (Orc, Grimly)',
    );
  });

  it('notes a kill inflicted by a foul', async () => {
    killerInfo.describe.mockReturnValue(
      'An opponent, in mysterious circumstances',
    );
    onThisDate.getTopKilledPlayers.mockResolvedValue([
      victim({ killer: { kind: 'unknown', viaFoul: true } }),
    ]);
    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(embed(result).description).toContain(
      'killed by an opponent, in mysterious circumstances (via a foul)',
    );
  });

  it('falls back to mysterious circumstances when the killer never resolved', async () => {
    killerInfo.describe.mockReturnValue(
      'An opponent, in mysterious circumstances',
    );
    onThisDate.getTopKilledPlayers.mockResolvedValue([
      victim({ killer: null }),
    ]);
    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(embed(result).description).toContain(
      'killed by an opponent, in mysterious circumstances',
    );
    // Routed through the shared formatter (treating a null killer as
    // `{ kind: 'unknown' }`) rather than a hardcoded duplicate string, so a
    // future wording change to the formatter reaches this row too.
    expect(killerInfo.describe).toHaveBeenCalledWith({
      kind: 'unknown',
      viaFoul: false,
    });
  });

  it('keeps a named killer capitalised, unlike the lower-cased fallback clauses', async () => {
    killerInfo.describe.mockReturnValue(
      'Morg n Thorg (Blitzer, Gouged Eye, Orc, Grimly)',
    );
    onThisDate.getTopKilledPlayers.mockResolvedValue([
      victim({
        killer: {
          kind: 'player',
          playerId: 99,
          playerName: 'Morg n Thorg',
          positionId: 5,
          positionName: 'Blitzer',
          isStarPlayer: true,
          teamId: 99,
          teamName: 'Gouged Eye',
          raceId: 98,
          raceName: 'Orc',
          coachId: 97,
          coachName: 'Grimly',
          viaFoul: false,
        },
      }),
    ]);
    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(embed(result).description).toContain(
      'killed by Morg n Thorg (Blitzer, Gouged Eye, Orc, Grimly)',
    );
  });

  it('offers a button for the victim and for the killer', async () => {
    const killerEntry: EntityComponentEntry = {
      customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      entityId: '99',
      label: 'Some Killer',
    };
    killerInfo.buildEntries.mockReturnValue([killerEntry]);
    onThisDate.getTopKilledPlayers.mockResolvedValue([victim()]);
    await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'Griff Oberwald',
      },
      killerEntry,
    ]);
  });

  it('appends the button-overflow note when the drill-down buttons exceed the cap', async () => {
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more without a link.',
    });
    onThisDate.getTopKilledPlayers.mockResolvedValue([victim()]);
    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(embed(result).description).toContain('…and 3 more without a link.');
  });

  it('reports an exact tie remainder', async () => {
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: [{ ...victim(), rank: 1, count: 120 }],
      truncatedCount: 3,
      tieGroupOpenEnded: false,
    });
    onThisDate.getTopKilledPlayers.mockResolvedValue([victim()]);
    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(embed(result).description).toContain('…and 3 more tied.');
  });

  it('reports an approximate remainder when the fetch window saturated on an open tie', async () => {
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: [{ ...victim(), rank: 1, count: 120 }],
      truncatedCount: 0,
      tieGroupOpenEnded: true,
    });
    onThisDate.getTopKilledPlayers.mockResolvedValue(
      Array.from({ length: TOPLIST_FETCH_LIMIT }, () => victim()),
    );
    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(embed(result).description).toContain('…and lots more tied.');
  });

  it('ranks over the SPP total, dropping the saturation sentinel row', async () => {
    onThisDate.getTopKilledPlayers.mockResolvedValue(
      Array.from({ length: TOPLIST_FETCH_LIMIT }, (_unused, index) =>
        victim({ playerId: index, sppTotal: 100 + index }),
      ),
    );
    await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(leaderboard.topRanksWithTies).toHaveBeenCalledTimes(1);
    const [consideredRows, topEntries] =
      leaderboard.topRanksWithTies.mock.calls[0];
    expect(consideredRows).toHaveLength(20);
    for (const row of consideredRows as { count: number; sppTotal: number }[]) {
      expect(row.count).toBe(row.sppTotal);
    }
    expect(topEntries).toBe(5);
  });

  it('resolves killers only for the shown rows, not the whole fetch window', async () => {
    onThisDate.getTopKilledPlayers.mockResolvedValue(
      Array.from({ length: TOPLIST_FETCH_LIMIT }, (_unused, index) =>
        victimWithoutKiller({ playerId: index, sppTotal: 100 + index }),
      ),
    );
    await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(onThisDate.getKillersForVictims).toHaveBeenCalledTimes(1);
    const [resolvedVictims] = onThisDate.getKillersForVictims.mock.calls[0];
    expect(resolvedVictims.length).toBeLessThan(TOPLIST_FETCH_LIMIT);
  });

  it('trims victim rows to fit the description length budget, counting the drop exactly', async () => {
    const longVictims = Array.from({ length: 30 }, (_unused, index) =>
      victim({
        playerId: index,
        name: `Longnamed Player Number ${index} With Extra Padding`,
        sppTotal: 200 - index,
        teamName: 'A Very Long Reikland Reavers Team Name Indeed',
        raceName: 'Human',
        coachName: 'A Coach With An Unusually Long Name',
        killer: {
          kind: 'ambiguousTeams',
          teams: [
            {
              teamId: 1,
              teamName: 'Gouged Eye Extended Long Team Name',
              raceId: 1,
              raceName: 'Orc',
              coachId: 1,
              coachName: 'Grimly The Long-Named',
            },
            {
              teamId: 2,
              teamName: 'Champions of Death With A Very Long Name',
              raceId: 2,
              raceName: 'Undead',
              coachId: 2,
              coachName: 'Mortis The Verbose',
            },
          ],
          viaFoul: false,
        },
      }),
    );
    onThisDate.getTopKilledPlayers.mockResolvedValue(longVictims);
    killerInfo.describe.mockReturnValue(
      'An unidentified player from Gouged Eye Extended Long Team Name (Orc, Grimly The Long-Named) or Champions of Death With A Very Long Name (Undead, Mortis The Verbose)',
    );

    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    const description = embed(result).description;

    expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    const shownRowCount = (description.match(/SPP, killed by/g) ?? []).length;
    const truncationMatch = /…and (\d+) more not shown\./.exec(description);
    expect(truncationMatch).not.toBeNull();
    const truncatedCount = Number(truncationMatch?.[1]);
    expect(shownRowCount).toBeGreaterThan(0);
    expect(shownRowCount + truncatedCount).toBe(30);
  });

  it('replies with the timeout message when the queries do not settle', async () => {
    stubDatabaseTimeoutOnce(databaseTimeout);
    const result = await service.resolve({ monthDay: MONTH_DAY, scope: {} });
    expect(result).toBe(ON_THIS_DATE_TIMEOUT_MESSAGE);
  });
});

describe('OnThisDateFactsService.resolveToday', () => {
  it('uses the clock-backed date', async () => {
    const scope = {};
    await service.resolveToday(scope);
    expect(monthDay.today).toHaveBeenCalledWith();
    expect(onThisDate.countMatchesPlayed).toHaveBeenCalledWith({
      month: 2,
      day: 29,
      scope,
    });
    expect(onThisDate.getEventCounts).toHaveBeenCalledWith({
      month: 2,
      day: 29,
      scope,
    });
    expect(onThisDate.getTopKilledPlayers).toHaveBeenCalledWith({
      month: 2,
      day: 29,
      scope,
      limit: 21,
    });
  });
});

/**
 * `EventCountLinesService` and `PlayerKillerInfoFormatterService` (whose only
 * collaborator, `PlayerRowButtonService`, is itself a pure decision service)
 * are pure and dependency-free, so this suite passes all three real per the
 * documented `CLAUDE.md` carve-out — the same one
 * `player-deepdive.test-helpers.ts` already uses for the equivalent deepdive
 * services. Every other collaborator stays mocked. This locks down the
 * actual rendered wording a reader would see, including Fix 1's
 * lower-cased, formatter-routed killer clause for the unknown/null and team
 * cases — the kind of duplication bug a fully-mocked spec cannot catch.
 */
describe('OnThisDateFactsService with real formatting collaborators', () => {
  it('renders the real killer wording for an unresolved and a team-only kill', async () => {
    const realOnThisDate = mock<OnThisDateService>();
    const realDatabaseTimeout = mockDatabaseTimeout();
    const realEntityComponents = nullEntityComponents();
    const realLeaderboard = mock<LeaderboardService>();
    const realMonthDay = mock<MonthDayService>();

    realOnThisDate.countMatchesPlayed.mockResolvedValue(2);
    realOnThisDate.getEventCounts.mockResolvedValue(ZERO_COUNTS);
    const unresolvedVictim = victim({
      playerId: 1,
      name: 'Griff Oberwald',
      sppTotal: 120,
      killer: null,
    });
    const teamKilledVictim = victim({
      playerId: 2,
      name: 'Morg n Thorg',
      sppTotal: 80,
      killer: {
        kind: 'team',
        teamId: 99,
        teamName: 'Gouged Eye',
        raceId: 98,
        raceName: 'Orc',
        coachId: 97,
        coachName: 'Grimly',
        viaFoul: false,
      },
    });
    realOnThisDate.getTopKilledPlayers.mockResolvedValue([
      unresolvedVictim,
      teamKilledVictim,
    ]);
    realOnThisDate.getKillersForVictims.mockImplementation((victims) =>
      Promise.resolve(
        victims.map((candidate) => ({
          ...candidate,
          killer: (candidate as OnThisDateKilledPlayer).killer ?? null,
        })),
      ),
    );
    realMonthDay.format.mockReturnValue('February 29');
    realLeaderboard.topRanksWithTies.mockImplementation((rows) => ({
      rows: rows.map((row, index) => ({ ...row, rank: index + 1 })),
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        OnThisDateFactsService,
        EventCountLinesService,
        PlayerKillerInfoFormatterService,
        PlayerRowButtonService,
        { provide: OnThisDateService, useValue: realOnThisDate },
        { provide: DatabaseTimeoutService, useValue: realDatabaseTimeout },
        { provide: EntityComponentsService, useValue: realEntityComponents },
        { provide: LeaderboardService, useValue: realLeaderboard },
        { provide: MonthDayService, useValue: realMonthDay },
      ],
    }).compile();
    const realService = moduleRef.get(OnThisDateFactsService);

    const result = await realService.resolve({
      monthDay: MONTH_DAY,
      scope: {},
    });
    expect(embed(result).description).toContain(
      '1. Griff Oberwald (Blitzer, Reikland Reavers, Human, Bob) — 120 SPP, killed by an opponent, in mysterious circumstances',
    );
    expect(embed(result).description).toContain(
      '2. Morg n Thorg (Blitzer, Reikland Reavers, Human, Bob) — 80 SPP, killed by an unidentified player from Gouged Eye (Orc, Grimly)',
    );
  });
});
