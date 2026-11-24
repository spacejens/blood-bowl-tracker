import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderedWhere } from './fill-query.test-helpers';
import { FillRowShapesService } from './fill-row-shapes.service';
import { LastingInjuryRepairQueriesService } from './lasting-injury-repair-queries.service';

const FORMATS = {
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'absent',
  armourFormat: 'plus',
} as const;
const PLAYER = {
  playerId: 5,
  tpId: '929761',
  positionId: 30,
  eraId: 4,
  move: 6,
  strength: 3,
  agility: 3,
  passing: null,
  armour: 8,
};

describe('LastingInjuryRepairQueriesService', () => {
  let service: LastingInjuryRepairQueriesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      // FillRowShapesService is pure and dependency-free: passed real.
      providers: [LastingInjuryRepairQueriesService, FillRowShapesService],
    }).compile();
    service = moduleRef.get(LastingInjuryRepairQueriesService);
  });

  it("resolves the rules set as PositionRulesSetsService.findCharacteristicsContext does: the last-listed with the position's row", async () => {
    const { db, chains } = mockDb(
      [PLAYER, { ...PLAYER, playerId: 6, tpId: '929762', eraId: 9 }],
      [
        { playerId: 5, characteristic: 'MA' },
        { playerId: 5, characteristic: 'AV' },
      ],
      [
        {
          eraRulesSetId: 12,
          eraId: 4,
          rulesSetId: 8,
          ...FORMATS,
          agilityFormat: 'bare',
        },
        { eraRulesSetId: 11, eraId: 4, rulesSetId: 7, ...FORMATS },
      ],
      [
        {
          positionId: 30,
          rulesSetId: 7,
          move: 6,
          strength: 3,
          agility: 3,
          passing: null,
          armour: 9,
        },
      ],
    );

    await expect(service.candidates(db)).resolves.toEqual([
      {
        player: { system: 'tourplay.net', id: '929761' },
        line: { ma: 6, st: 3, ag: 3, pa: null, av: 8 },
        increases: ['ma', 'av'],
        context: {
          formats: {
            ma: 'bare',
            st: 'bare',
            ag: 'plus',
            pa: 'absent',
            av: 'plus',
          },
          baseline: { ma: 6, st: 3, ag: 3, pa: null, av: 9 },
        },
      },
      {
        player: { system: 'tourplay.net', id: '929762' },
        line: { ma: 6, st: 3, ag: 3, pa: null, av: 8 },
        increases: [],
        context: null,
      },
    ]);

    const players = renderedWhere(chains[0]);
    expect(players.sql).toContain('not (');
    expect(players.sql).toContain('"players"."move_reduction_count" = $');
    expect(players.sql).toContain('"players"."armour_reduction_count" = $');
    expect(players.params).toEqual(
      expect.arrayContaining(['tourplay.net', false, 'stat_reduction_ma']),
    );
    const increases = renderedWhere(chains[1]);
    expect(increases.sql).toContain(
      '"player_advancements"."characteristic" is not null',
    );
    expect(increases.params).toEqual(
      expect.arrayContaining([5, 6, false, 'characteristic']),
    );
    expect(renderedWhere(chains[2]).params).toEqual([4, 9]);
  });

  it('falls back to the last-listed rules set with no start line when none has a row for the position', async () => {
    const { db } = mockDb(
      [PLAYER],
      [],
      [
        {
          eraRulesSetId: 12,
          eraId: 4,
          rulesSetId: 8,
          ...FORMATS,
          agilityFormat: 'bare',
        },
        { eraRulesSetId: 11, eraId: 4, rulesSetId: 7, ...FORMATS },
      ],
      [],
    );

    const [candidate] = await service.candidates(db);

    expect(candidate.context).toEqual({
      formats: { ma: 'bare', st: 'bare', ag: 'bare', pa: 'absent', av: 'plus' },
      baseline: null,
    });
  });
});
