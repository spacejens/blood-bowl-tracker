import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import type { TpFeedHistoryReports } from '../read-tp-feed-history/tp-feed-history-index.service';
import type { FeedMatchInput } from './feed-player-matcher.service';
import { FeedPlayerMatcherService } from './feed-player-matcher.service';
import { FeedSplitSearchService } from './feed-split-search.service';
import { report, teamPlayer } from './fill-plan.test-helpers';
import type {
  FeedOwner,
  FeedPricingRows,
  TeamPlayerRow,
  TeamRosterRow,
} from './fill-plan.types';
import { PricingRulesSetsService } from './pricing-rules-sets.service';

const ROSTERS: TeamRosterRow[] = [{ teamId: 20, rosterId: '24801' }];
const FLAME: TeamPlayerRow = teamPlayer();
const TWIN: TeamPlayerRow = teamPlayer({ playerId: 2 });
const KEY = '#13 Flame (Gnoblar Lineman)';
const PRICING: FeedPricingRows = {
  paidAdvancements: [],
  skillNames: [],
  eraRulesSets: [],
  advancementCosts: [],
  skillCategories: [],
  positionAccess: [],
};

function matchInput(overrides: Partial<FeedMatchInput> = {}): FeedMatchInput {
  return {
    reports: { Firestarters: { [KEY]: [report()] } },
    rosters: ROSTERS,
    players: [FLAME],
    pricing: PRICING,
    ...overrides,
  };
}

/** The owner the matcher builds for a team player under PRICING. */
function bareOwner(row: TeamPlayerRow): FeedOwner {
  return {
    playerId: row.playerId,
    sppTotal: row.sppTotal,
    unspentSpp: row.unspentSpp,
    rulesSets: [],
    paid: [],
    isIncomplete: row.isIncomplete,
  };
}

describe('FeedPlayerMatcherService', () => {
  let service: FeedPlayerMatcherService;
  let search: MockProxy<FeedSplitSearchService>;

  beforeEach(async () => {
    search = mock<FeedSplitSearchService>();
    search.search.mockReturnValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeedPlayerMatcherService,
        { provide: FeedSplitSearchService, useValue: search },
        // Pure and dependency-free, so passed real: the owners asserted
        // below carry the rules sets it builds.
        PricingRulesSetsService,
      ],
    }).compile();
    service = moduleRef.get(FeedPlayerMatcherService);
  });

  describe('one key naming one player', () => {
    it('gives him the reports without a split search', () => {
      const reports = [report(), report({ messageId: '1057968552151359500' })];

      const result = service.match(
        matchInput({ reports: { Firestarters: { [KEY]: reports } } }),
      );

      expect(result.byPlayer).toEqual(
        new Map([[1, { kind: 'reports', reports }]]),
      );
      expect(result.summary).toEqual({
        reportKeys: 1,
        matchedKeys: 1,
        ambiguousKeys: 0,
        unmatchedKeys: 0,
      });
      expect(search.search).not.toHaveBeenCalled();
    });

    it('orders his reports by message id, oldest first', () => {
      const older = report({ messageId: '999' });
      const middle = report({ messageId: '1057968552151359499' });
      const newest = report({ messageId: '1057968552151359500' });

      const result = service.match(
        matchInput({
          reports: { Firestarters: { [KEY]: [newest, older, middle] } },
        }),
      );

      expect(result.byPlayer).toEqual(
        new Map([[1, { kind: 'reports', reports: [older, middle, newest] }]]),
      );
    });

    it('keeps him ambiguous when a message id is not a number', () => {
      const result = service.match(
        matchInput({
          reports: {
            Firestarters: { [KEY]: [report(), report({ messageId: 'abc' })] },
          },
        }),
      );

      expect(result.byPlayer).toEqual(new Map([[1, { kind: 'ambiguous' }]]));
      expect(result.summary).toMatchObject({
        matchedKeys: 0,
        ambiguousKeys: 1,
      });
    });

    it('finds his team under any of its roster ids', () => {
      const result = service.match(
        matchInput({
          rosters: [
            { teamId: 20, rosterId: '1' },
            { teamId: 20, rosterId: '24801' },
          ],
        }),
      );

      expect(result.byPlayer.get(1)?.kind).toBe('reports');
    });
  });

  describe('keys that name nobody stored', () => {
    it('leaves a key whose roster is no stored team unmatched', () => {
      const result = service.match(
        matchInput({ rosters: [{ teamId: 20, rosterId: '99' }] }),
      );

      expect(result.byPlayer.size).toBe(0);
      expect(result.summary.unmatchedKeys).toBe(1);
    });

    it('leaves a key that names no stored player of the team unmatched', () => {
      const result = service.match(
        matchInput({
          reports: {
            Firestarters: { [KEY]: [report({ playerName: 'Spark' })] },
          },
        }),
      );

      expect(result.byPlayer.size).toBe(0);
      expect(result.summary.unmatchedKeys).toBe(1);
    });

    it('does not match a player of another team with the same name and position', () => {
      const result = service.match(
        matchInput({ players: [teamPlayer({ teamId: 21 })] }),
      );

      expect(result.byPlayer.size).toBe(0);
    });

    it.each(['flame', ' Flame ', 'FLAME'])(
      'does not match the name %j, which differs only by case or whitespace',
      (playerName) => {
        const result = service.match(
          matchInput({
            reports: { Firestarters: { [KEY]: [report({ playerName })] } },
          }),
        );

        expect(result.byPlayer.size).toBe(0);
        expect(result.summary.unmatchedKeys).toBe(1);
      },
    );

    it('leaves a key without a readable roster link, or without reports, unmatched', () => {
      const result = service.match(
        matchInput({
          reports: {
            Firestarters: {
              [KEY]: [report({ rosterLink: 'https://tourplay.net/en' })],
              '#2 Empty (Gnoblar Lineman)': [],
            },
          },
        }),
      );

      expect(result.byPlayer.size).toBe(0);
      expect(result.summary).toEqual({
        reportKeys: 2,
        matchedKeys: 0,
        ambiguousKeys: 0,
        unmatchedKeys: 2,
      });
    });

    it('leaves a key unmatched when no stored player can afford any of its reports', () => {
      // Identical Wood Elf journeymen with 0 or 2 SPP: Tackle at 3, Wrestle at 10.
      const journeymen = [
        teamPlayer({ playerId: 3, isJourneyman: true, sppTotal: 2 }),
        teamPlayer({ playerId: 4, isJourneyman: true, sppTotal: 0 }),
      ];

      const result = service.match(
        matchInput({
          reports: {
            Firestarters: {
              [KEY]: [
                report({ sppCost: 3 }),
                report({ messageId: '1', sppCost: 10 }),
              ],
            },
          },
          players: journeymen,
        }),
      );

      expect(result.byPlayer.size).toBe(0);
      expect(result.summary.unmatchedKeys).toBe(1);
      expect(search.search).not.toHaveBeenCalled();
    });
  });

  describe('affordability', () => {
    it('drops a twin who cannot afford the report and gives it to the one who can', () => {
      // Tepes von Drak, Stubbert, Armtwista: the twin has 0 SPP.
      const result = service.match(
        matchInput({
          players: [FLAME, teamPlayer({ playerId: 2, sppTotal: 0 })],
        }),
      );

      expect(result.byPlayer).toEqual(
        new Map([[1, { kind: 'reports', reports: [report()] }]]),
      );
      expect(search.search).not.toHaveBeenCalled();
    });

    it('gives the reports to the complete player who can afford them, freeing the journeymen who cannot', () => {
      // Two Lineman journeymen and the complete player whose reports these are.
      const result = service.match(
        matchInput({
          players: [
            teamPlayer({ playerId: 3, isJourneyman: true, sppTotal: 0 }),
            teamPlayer({ playerId: 4, isJourneyman: true, sppTotal: 0 }),
            teamPlayer({ playerId: 9, sppTotal: 40 }),
          ],
        }),
      );

      expect(result.byPlayer).toEqual(
        new Map([[9, { kind: 'reports', reports: [report()] }]]),
      );
    });

    it('keeps a player whose total is not stored as a possible owner', () => {
      const result = service.match(
        matchInput({
          players: [FLAME, teamPlayer({ playerId: 2, sppTotal: null })],
        }),
      );

      expect(search.search).toHaveBeenCalledTimes(1);
      expect(result.byPlayer).toEqual(
        new Map([
          [1, { kind: 'ambiguous' }],
          [2, { kind: 'ambiguous' }],
        ]),
      );
    });

    it('keeps a key ambiguous when some reports have a possible owner and others none', () => {
      const result = service.match(
        matchInput({
          reports: {
            Firestarters: {
              [KEY]: [
                report(),
                report({ messageId: '1057968552151359500', sppCost: 30 }),
              ],
            },
          },
        }),
      );

      expect(result.byPlayer).toEqual(new Map([[1, { kind: 'ambiguous' }]]));
      expect(result.summary).toMatchObject({
        matchedKeys: 0,
        ambiguousKeys: 1,
      });
    });
  });

  describe('a key with a report nobody can afford', () => {
    it('keeps twins ambiguous without a split search', () => {
      const result = service.match(
        matchInput({
          reports: {
            Firestarters: {
              [KEY]: [
                report(),
                report({ messageId: '1057968552151359500', sppCost: 30 }),
              ],
            },
          },
          players: [FLAME, TWIN],
        }),
      );

      expect(search.search).not.toHaveBeenCalled();
      expect(result.byPlayer).toEqual(
        new Map([
          [1, { kind: 'ambiguous' }],
          [2, { kind: 'ambiguous' }],
        ]),
      );
      expect(result.summary).toMatchObject({
        matchedKeys: 0,
        ambiguousKeys: 1,
      });
    });
  });

  describe('marked journeymen', () => {
    it('keeps a key ambiguous when a marked journeyman can afford a report', () => {
      const result = service.match(
        matchInput({ players: [teamPlayer({ isJourneyman: true })] }),
      );

      expect(result.byPlayer).toEqual(new Map([[1, { kind: 'ambiguous' }]]));
      expect(search.search).not.toHaveBeenCalled();
    });

    it('keeps every possible owner ambiguous beside such a journeyman', () => {
      const result = service.match(
        matchInput({
          players: [FLAME, teamPlayer({ playerId: 2, isJourneyman: true })],
        }),
      );

      expect(result.byPlayer).toEqual(
        new Map([
          [1, { kind: 'ambiguous' }],
          [2, { kind: 'ambiguous' }],
        ]),
      );
      expect(search.search).not.toHaveBeenCalled();
    });
  });

  describe('split search', () => {
    it('hands twins sharing a key to the search, each report with its possible owners, oldest first, and each owner with whether he is incomplete', () => {
      // Vlad von Drak: two stored players, five reports over two rosters of one team.
      const vlad = (messageId: string, rosterId: string, sppCost: number) =>
        report({
          messageId,
          playerNumber: '3',
          playerName: 'Vlad von Drak',
          position: 'Vampire',
          rosterLink: `https://tourplay.net/en/blood-bowl/roster/${rosterId}`,
          sppCost,
        });
      const reports = [
        vlad('1', '36047', 6),
        vlad('2', '36047', 8),
        vlad('3', '36047', 12),
        vlad('4', '58917', 6),
        vlad('5', '58917', 8),
      ];
      const first = teamPlayer({
        playerId: 520683,
        playerName: 'Vlad von Drak',
        positionName: 'Vampire',
        sppTotal: 30,
        unspentSpp: 4,
        isIncomplete: true,
      });
      const second = teamPlayer({
        playerId: 881779,
        playerName: 'Vlad von Drak',
        positionName: 'Vampire',
        sppTotal: 16,
        unspentSpp: 2,
        isIncomplete: false,
      });
      search.search.mockReturnValue(
        new Map([
          [520683, reports.slice(0, 3)],
          [881779, reports.slice(3)],
        ]),
      );

      const result = service.match(
        matchInput({
          reports: {
            Drakwald: { '#3 Vlad von Drak (Vampire)': [...reports].reverse() },
          },
          rosters: [
            { teamId: 20, rosterId: '36047' },
            { teamId: 20, rosterId: '58917' },
          ],
          players: [first, second],
        }),
      );

      expect(search.search).toHaveBeenCalledWith({
        reports: reports.map((row) => ({
          report: row,
          owners: [520683, 881779],
        })),
        owners: new Map([
          [520683, bareOwner(first)],
          [881779, bareOwner(second)],
        ]),
        skillNames: [],
      });
      expect(result.byPlayer).toEqual(
        new Map([
          [520683, { kind: 'reports', reports: reports.slice(0, 3) }],
          [881779, { kind: 'reports', reports: reports.slice(3) }],
        ]),
      );
      expect(result.summary).toMatchObject({
        matchedKeys: 1,
        ambiguousKeys: 0,
      });
    });

    it('marks every possible owner ambiguous when the search proves nothing', () => {
      const result = service.match(matchInput({ players: [FLAME, TWIN] }));

      expect(result.byPlayer).toEqual(
        new Map([
          [1, { kind: 'ambiguous' }],
          [2, { kind: 'ambiguous' }],
        ]),
      );
      expect(result.summary.ambiguousKeys).toBe(1);
    });

    it('leaves an owner the proven split gives no report out of the result', () => {
      search.search.mockReturnValue(new Map([[1, [report()]]]));

      const result = service.match(matchInput({ players: [FLAME, TWIN] }));

      expect(result.byPlayer).toEqual(
        new Map([[1, { kind: 'reports', reports: [report()] }]]),
      );
    });

    it('merges two keys naming one player and hands their reports to the search in posting order', () => {
      // M Dapperfoot: his shirt number changed from 13 to 11.
      const early = report({ messageId: '10' });
      const middle = report({ messageId: '20', playerNumber: '11' });
      const late = report({ messageId: '30', playerNumber: '11' });
      search.search.mockReturnValue(new Map([[1, [early, middle, late]]]));
      const reports: TpFeedHistoryReports = {
        Firestarters: {
          [KEY]: [early],
          '#11 Flame (Gnoblar Lineman)': [late, middle],
        },
      };

      const result = service.match(matchInput({ reports }));

      expect(search.search).toHaveBeenCalledWith({
        reports: [early, middle, late].map((row) => ({
          report: row,
          owners: [1],
        })),
        owners: new Map([[1, bareOwner(FLAME)]]),
        skillNames: [],
      });
      expect(result.byPlayer).toEqual(
        new Map([[1, { kind: 'reports', reports: [early, middle, late] }]]),
      );
      expect(result.summary).toMatchObject({
        matchedKeys: 2,
        ambiguousKeys: 0,
      });
    });

    it('keeps a player ambiguous whom two keys name when the search proves nothing', () => {
      const result = service.match(
        matchInput({
          reports: {
            Firestarters: {
              [KEY]: [report()],
              '#7 Flame (Gnoblar Lineman)': [report({ playerNumber: '7' })],
            },
          },
        }),
      );

      expect(result.byPlayer).toEqual(new Map([[1, { kind: 'ambiguous' }]]));
      expect(result.summary).toMatchObject({
        matchedKeys: 0,
        ambiguousKeys: 2,
      });
    });

    it('gives each report of a key over two rosters the players of its own roster', () => {
      const other = report({
        messageId: '1057968552151359500',
        rosterLink: 'https://tourplay.net/en/blood-bowl/roster/1',
      });
      const elsewhere = teamPlayer({ playerId: 2, teamId: 21 });

      service.match(
        matchInput({
          reports: { Firestarters: { [KEY]: [report(), other] } },
          rosters: [
            { teamId: 20, rosterId: '24801' },
            { teamId: 21, rosterId: '1' },
          ],
          players: [FLAME, elsewhere],
        }),
      );

      expect(search.search).toHaveBeenCalledWith(
        expect.objectContaining({
          reports: [
            { report: report(), owners: [1] },
            { report: other, owners: [2] },
          ],
        }),
      );
    });

    it('searches one component when a key bridges the owners of two other keys', () => {
      // Roster 1 names team 20, roster 2 names team 21, roster 3 names both.
      const rosterReport = (messageId: string, rosterId: string) =>
        report({
          messageId,
          rosterLink: `https://tourplay.net/en/blood-bowl/roster/${rosterId}`,
        });
      const a = rosterReport('1', '1');
      const b = rosterReport('2', '2');
      const c = rosterReport('3', '3');
      const elsewhere = teamPlayer({ playerId: 2, teamId: 21 });

      service.match(
        matchInput({
          reports: {
            Firestarters: {
              '#1 Flame (Gnoblar Lineman)': [a],
              '#2 Flame (Gnoblar Lineman)': [b],
              '#3 Flame (Gnoblar Lineman)': [c],
            },
          },
          rosters: [
            { teamId: 20, rosterId: '1' },
            { teamId: 21, rosterId: '2' },
            { teamId: 20, rosterId: '3' },
            { teamId: 21, rosterId: '3' },
          ],
          players: [FLAME, elsewhere],
        }),
      );

      expect(search.search).toHaveBeenCalledTimes(1);
      expect(search.search).toHaveBeenCalledWith({
        reports: [
          { report: a, owners: [1] },
          { report: b, owners: [2] },
          { report: c, owners: [1, 2] },
        ],
        owners: new Map([
          [1, bareOwner(FLAME)],
          [2, bareOwner(elsewhere)],
        ]),
        skillNames: [],
      });
    });

    it('keeps a player ambiguous whom another key names alone, when a key he shares proves nothing', () => {
      // Roster 24801 links teams 20 and 21; roster 777 links team 20 alone.
      const result = service.match(
        matchInput({
          reports: {
            Firestarters: {
              [KEY]: [report()],
              '#13 Flame (Gnoblar Lineman) again': [
                report({
                  messageId: '1',
                  rosterLink: 'https://tourplay.net/en/blood-bowl/roster/777',
                }),
              ],
            },
          },
          rosters: [
            { teamId: 20, rosterId: '24801' },
            { teamId: 21, rosterId: '24801' },
            { teamId: 20, rosterId: '777' },
          ],
          players: [FLAME, teamPlayer({ playerId: 2, teamId: 21 })],
        }),
      );

      expect(result.byPlayer).toEqual(
        new Map([
          [1, { kind: 'ambiguous' }],
          [2, { kind: 'ambiguous' }],
        ]),
      );
      expect(result.summary).toMatchObject({
        matchedKeys: 0,
        ambiguousKeys: 2,
      });
    });

    it("builds each owner from his era's rules sets and costs, his position's access and his paid advancements", () => {
      const cost = {
        eraId: 4,
        rulesSetId: 7,
        leagueId: null,
        advancementNumber: 1,
        advancementKind: 'chosen_primary_skill' as const,
        skillId: null,
        sppCost: 6,
      };
      const access = {
        positionId: 30,
        rulesSetId: 7,
        category: 'agility' as const,
        access: 'primary' as const,
      };
      const paid = {
        playerId: 1,
        skillId: 200,
        attributeValue: null,
        characteristic: null,
      };
      const names = [{ skillId: 200, skillName: 'Dodge', nameId: 'Dodge' }];

      service.match(
        matchInput({
          players: [FLAME, TWIN],
          pricing: {
            paidAdvancements: [paid, { ...paid, playerId: 3 }],
            skillNames: names,
            eraRulesSets: [
              { eraId: 4, rulesSetId: 7, cheapestCost: 6 },
              { eraId: 9, rulesSetId: 8, cheapestCost: 6 },
            ],
            advancementCosts: [cost, { ...cost, eraId: 9, rulesSetId: 8 }],
            skillCategories: [
              { skillId: 200, rulesSetId: 7, category: 'agility' },
            ],
            positionAccess: [access, { ...access, positionId: 31 }],
          },
        }),
      );

      const rulesSets = [
        {
          rulesSetId: 7,
          costs: [cost],
          skillCategories: new Map([[200, 'agility']]),
          positionAccess: new Map([['agility', 'primary']]),
        },
      ];
      expect(search.search).toHaveBeenCalledWith(
        expect.objectContaining({
          owners: new Map([
            [1, { ...bareOwner(FLAME), rulesSets, paid: [paid] }],
            [2, { ...bareOwner(TWIN), rulesSets, paid: [] }],
          ]),
          skillNames: names,
        }),
      );
    });
  });
});
