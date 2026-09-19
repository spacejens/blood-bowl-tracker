import type {
  FactScope,
  SkillPlayerCount,
} from '@blood-bowl-tracker/game-data';
import {
  FACT_SCOPE_ALL_TIME,
  SkillsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  SKILL_TOPLIST_NO_DATA_MESSAGE,
  SKILL_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';
import { SkillToplistService } from './skill-toplist.service';

const rows: SkillPlayerCount[] = [
  { skillId: 1, name: 'Block', count: 120 },
  { skillId: 2, name: 'Dodge', count: 95 },
];

describe('SkillToplistService', () => {
  // LeaderboardService.resolveToplist itself (ranking, ties, embed rendering,
  // the timeout fallback) is covered by leaderboard.service.spec.ts. Here it is
  // a mock returning canned values, so these tests assert only what
  // SkillToplistService owns: the titles, the messages, the absence of a
  // deepdive link and row format, and which query each resolver runs.
  let service: SkillToplistService;
  let skills: MockProxy<SkillsService>;
  let leaderboard: MockProxy<LeaderboardService>;

  beforeEach(async () => {
    skills = mock<SkillsService>();
    leaderboard = mock<LeaderboardService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SkillToplistService,
        { provide: SkillsService, useValue: skills },
        { provide: LeaderboardService, useValue: leaderboard },
      ],
    }).compile();
    service = moduleRef.get(SkillToplistService);
  });

  function capturedOptions(): ResolveToplistOptions<SkillPlayerCount> {
    return leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<SkillPlayerCount>;
  }

  it.each([
    ['resolveAny', 'Skills by players who have them'],
    [
      'resolveAdvancementAny',
      'Skills by players who gained them as an advancement',
    ],
    [
      'resolveAdvancementChosen',
      'Skills by players who chose them as an advancement',
    ],
    [
      'resolveAdvancementRandom',
      'Skills by players who had them randomly rolled as an advancement',
    ],
  ] as const)('%s titles the embed "%s"', async (method, title) => {
    const canned = { embeds: [{ title: 'canned', description: 'canned' }] };
    leaderboard.resolveToplist.mockResolvedValueOnce(canned);

    const result = await service[method](FACT_SCOPE_ALL_TIME);

    expect(result).toBe(canned);
    expect(capturedOptions().title).toBe(title);
  });

  it.each([
    ['resolveAny', 'countPlayersBySkillAny'],
    ['resolveAdvancementAny', 'countPlayersBySkillAdvancement'],
    ['resolveAdvancementChosen', 'countPlayersBySkillChosen'],
    ['resolveAdvancementRandom', 'countPlayersBySkillRandom'],
  ] as const)(
    '%s passes the scope and the leaderboard-requested limit to SkillsService.%s',
    async (method, query) => {
      const sentinelLimit = 3;
      skills[query].mockResolvedValue(rows);
      leaderboard.resolveToplist.mockImplementation(async (options) => {
        await options.fetchRows(sentinelLimit);
        return 'canned';
      });

      const scope: FactScope = { eraId: 20 };
      await service[method](scope);

      expect(skills[query]).toHaveBeenCalledWith({ eraId: 20 }, sentinelLimit);
    },
  );

  it('leaves row formatting and drill-down linking to the leaderboard default, because skills have no deepdive', async () => {
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');

    await service.resolveAny(FACT_SCOPE_ALL_TIME);

    const options = capturedOptions();
    expect(options.formatRow).toBeUndefined();
    expect(options.entityLink).toBeUndefined();
  });

  it('configures the shared skill toplist messages and returns the timeout one verbatim', async () => {
    leaderboard.resolveToplist.mockResolvedValueOnce(
      SKILL_TOPLIST_TIMEOUT_MESSAGE,
    );

    const result = await service.resolveAdvancementChosen(FACT_SCOPE_ALL_TIME);

    expect(result).toBe(SKILL_TOPLIST_TIMEOUT_MESSAGE);
    expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMessage: SKILL_TOPLIST_TIMEOUT_MESSAGE,
        noDataMessage: SKILL_TOPLIST_NO_DATA_MESSAGE,
      }),
    );
  });
});
