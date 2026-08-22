import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  CASUALTY_CAUSED_TYPES,
  CATCH_TYPES,
  COMPLETION_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  MVP_AWARD_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
  THROW_TEAM_MATE_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';
import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { PlayerDeepdiveCountsService } from './player-deepdive-counts.service';

describe('PlayerDeepdiveCountsService', () => {
  let service: PlayerDeepdiveCountsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerDeepdiveCountsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(PlayerDeepdiveCountsService);
    return { db, chains };
  }

  describe('getDeepdiveCategoryCounts', () => {
    const simpleLabels = [
      'MVP awards',
      'Touchdowns scored',
      'Completions',
      'Interceptions',
      'Deflections',
      'Team-mates thrown',
      'Successful catches',
    ];
    /** Query order: 7 simple, casualty total/serious/killed, foul total/serious/killed. */
    const ALL_COUNTS = 13;

    it('groups the simple categories, the casualty breakdown and the foul breakdown', async () => {
      const counts = [2, 5, 3, 1, 4, 8, 9, 6, 2, 1, 7, 3, 2];
      const { db } = await build(...counts.map((n) => [{ count: n }]));

      await expect(service.getDeepdiveCategoryCounts(1)).resolves.toEqual({
        simple: simpleLabels.map((label, i) => ({ label, count: counts[i] })),
        casualties: { total: 6, seriousInjuries: 2, killed: 1 },
        fouls: { total: 7, seriousInjuries: 3, killed: 2 },
      });
      expect(db.select).toHaveBeenCalledTimes(ALL_COUNTS);
    });

    it('returns zeroes throughout for a player with no events', async () => {
      await build(...Array.from({ length: ALL_COUNTS }, () => [{ count: 0 }]));

      await expect(service.getDeepdiveCategoryCounts(1)).resolves.toEqual({
        simple: simpleLabels.map((label) => ({ label, count: 0 })),
        casualties: { total: 0, seriousInjuries: 0, killed: 0 },
        fouls: { total: 0, seriousInjuries: 0, killed: 0 },
      });
    });

    it('binds each simple category to its own type-set selector, in order', async () => {
      // A transposition of two entries would leave the tests above green (they
      // only check counts), so this test inspects the actual filter values each
      // call built.
      const expectedTypeSets: readonly (readonly string[])[] = [
        MVP_AWARD_TYPES,
        TOUCHDOWN_TYPES,
        COMPLETION_TYPES,
        INTERCEPTION_TYPES,
        DEFLECTION_TYPES,
        THROW_TEAM_MATE_TYPES,
        CATCH_TYPES,
      ];
      const { chains } = await build(
        ...Array.from({ length: ALL_COUNTS }, () => [{ count: 0 }]),
      );

      await service.getDeepdiveCategoryCounts(1);

      expectedTypeSets.forEach((types, index) => {
        const values = extractAllFilterValues(
          firstCallArg(chains[index].where),
        );
        // `and(inArray(actionType, types), eq(players.id, playerId))` — the
        // trailing value is the playerId param.
        expect(values.slice(0, -1)).toEqual([...types]);
      });
    });

    it('counts casualty total/serious-injuries and fouls.total as direct acting-type filters, unjoined', async () => {
      // These three go through `countActingEvents`: a direct `match_events`
      // filter with playerId first, then the type list — no join, unlike the
      // simple-category queries above. `casualties.killed` (chains[9]) no
      // longer goes through this path — see the `countDeathOutcome` test
      // below.
      const { chains } = await build(
        ...Array.from({ length: ALL_COUNTS }, () => [{ count: 0 }]),
      );

      await service.getDeepdiveCategoryCounts(1);

      expect(extractAllFilterValues(firstCallArg(chains[7].where))).toEqual([
        1,
        ...CASUALTY_CAUSED_TYPES,
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[8].where))).toEqual([
        1,
        ...SERIOUS_INJURY_CAUSED_TYPES,
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[10].where))).toEqual([
        1,
        ...FOUL_TYPES,
      ]);
      expect(chains[7].innerJoin).not.toHaveBeenCalled();
      expect(chains[8].innerJoin).not.toHaveBeenCalled();
      expect(chains[10].innerJoin).not.toHaveBeenCalled();
    });

    it('counts casualties.killed via countDeathOutcome: a confirmed death, a prevented death, or an unpaired death action, unjoined', async () => {
      // Mirrors killFilter's own death branch exactly, so this count and the
      // Kills list's death-side rows agree by construction (see
      // PlayerDeepdiveCategoryCounts's doc comment).
      const { chains } = await build(
        ...Array.from({ length: ALL_COUNTS }, () => [{ count: 0 }]),
      );

      await service.getDeepdiveCategoryCounts(1);

      expect(extractAllFilterValues(firstCallArg(chains[9].where))).toEqual([
        1,
        'death',
        'death',
        'casualty_avoided',
        'death',
      ]);
      expect(chains[9].innerJoin).not.toHaveBeenCalled();
    });

    it('counts fouls.seriousInjuries and fouls.killed via countFoulOutcome, matching a confirmed or prevented outcome, unjoined', async () => {
      const { chains } = await build(
        ...Array.from({ length: ALL_COUNTS }, () => [{ count: 0 }]),
      );

      await service.getDeepdiveCategoryCounts(1);

      // fouls.seriousInjuries: actingPlayerId, actionType = 'foul', then the
      // OR of (consequenceType IN severities) and (consequenceType =
      // 'casualty_avoided' AND consequenceAvoidedSeverity IN severities). This
      // is also the regression proof for the pre-existing bug where
      // fouls.seriousInjuries filtered on the literal consequenceType
      // 'serious_injury', which the imported data never actually uses for a
      // foul-caused injury — real foul-caused serious injuries are recorded
      // via niggling_injury, miss_next_game, or a stat_reduction_*
      // consequence, so the count was always 0. Asserting on
      // SERIOUS_INJURY_SUFFERED_TYPES here (rather than the literal value)
      // is what proves the bug is fixed.
      expect(extractAllFilterValues(firstCallArg(chains[11].where))).toEqual([
        1,
        'foul',
        ...SERIOUS_INJURY_SUFFERED_TYPES,
        'casualty_avoided',
        ...SERIOUS_INJURY_SUFFERED_TYPES,
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[12].where))).toEqual([
        1,
        'foul',
        'death',
        'casualty_avoided',
        'death',
      ]);
      expect(chains[11].innerJoin).not.toHaveBeenCalled();
      expect(chains[12].innerJoin).not.toHaveBeenCalled();
    });
  });
});
