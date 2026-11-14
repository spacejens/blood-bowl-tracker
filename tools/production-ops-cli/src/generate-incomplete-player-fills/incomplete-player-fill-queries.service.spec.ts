import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import {
  CANDIDATES_SQL,
  CONSEQUENCE_COUNTS_SQL,
  ERA_RULES_SETS_SQL,
  FREE_SKILL_RISK_SQL,
  INCOMPLETE_PLAYER_CONDITIONS,
  ONGOING_COMPETITIONS_SQL,
  POSITION_RULES_SETS_SQL,
  POSITION_SKILLS_SQL,
  STORED_ADVANCEMENTS_SQL,
} from './incomplete-player-fill.sql';
import { IncompletePlayerFillQueriesService } from './incomplete-player-fill-queries.service';
import { ProductionJsonQueryService } from './production-json-query.service';

const CANDIDATE = {
  playerId: 1,
  tpId: '500',
  teamId: 20,
  positionId: 30,
  eraId: 4,
  sppTotal: 5,
  unspentSpp: null,
  status: null,
  isJourneyman: false,
  move: 0,
  strength: 0,
  agility: 0,
  passing: null,
  armour: 0,
};
const PRS = {
  positionRulesSetId: 40,
  positionId: 30,
  eraId: 4,
  rulesSetId: 7,
  line: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
  formats: {
    ma: 'bare',
    st: 'bare',
    ag: 'plus',
    pa: 'plus_zero_legal',
    av: 'plus',
  },
};
const SKILL = {
  positionRulesSetId: 40,
  skillId: 100,
  nameId: 'Block',
  attributeValue: null,
};

describe('IncompletePlayerFillQueriesService', () => {
  let service: IncompletePlayerFillQueriesService;
  let json: MockProxy<ProductionJsonQueryService>;
  let results: Map<string, unknown[]>;

  beforeEach(async () => {
    json = mock<ProductionJsonQueryService>();
    results = new Map<string, unknown[]>([
      [CANDIDATES_SQL, [CANDIDATE]],
      [
        CONSEQUENCE_COUNTS_SQL,
        [{ playerId: 1, consequenceType: 'death', count: 1 }],
      ],
      [STORED_ADVANCEMENTS_SQL, []],
      [FREE_SKILL_RISK_SQL, [{ playerId: 9 }]],
      [
        ONGOING_COMPETITIONS_SQL,
        [
          { competitionName: 'Major Season 31', teamId: 20 },
          { competitionName: 'Ogretoberfest 14', teamId: null },
        ],
      ],
      [POSITION_RULES_SETS_SQL, [PRS]],
      [POSITION_SKILLS_SQL, [SKILL]],
      [ERA_RULES_SETS_SQL, [{ eraId: 4, rulesSetId: 7, cheapestCost: 6 }]],
    ]);
    // Canned rows per statement; unknown SQL is a test bug, so fail loudly.
    json.rows.mockImplementation((sql) => {
      const rows = results.get(sql);
      if (rows === undefined) {
        throw new Error(`unexpected SQL: ${sql}`);
      }
      return Promise.resolve(rows);
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        IncompletePlayerFillQueriesService,
        { provide: ProductionJsonQueryService, useValue: json },
      ],
    }).compile();
    service = moduleRef.get(IncompletePlayerFillQueriesService);
  });

  it('loads every query into the planner input', async () => {
    await expect(service.load()).resolves.toEqual({
      candidates: [CANDIDATE],
      consequenceCounts: [{ playerId: 1, consequenceType: 'death', count: 1 }],
      storedAdvancements: [],
      freeSkillRiskPlayerIds: [9],
      ongoingTeamIds: [20],
      positionRulesSets: [PRS],
      positionSkills: [SKILL],
      eraRulesSets: [{ eraId: 4, rulesSetId: 7, cheapestCost: 6 }],
    });
  });

  it('selects only incomplete, non-star TP players', () => {
    expect(CANDIDATES_SQL).toContain("es.name = 'tourplay.net'");
    expect(CANDIDATES_SQL).toContain('pos.is_star_player = false');
    for (const condition of INCOMPLETE_PLAYER_CONDITIONS) {
      expect(CANDIDATES_SQL).toContain(`p.${condition}`);
    }
  });

  it('refuses to run when an ongoing competition is not found', async () => {
    results.set(ONGOING_COMPETITIONS_SQL, [
      { competitionName: 'Major Season 31', teamId: 20 },
    ]);

    await expect(service.load()).rejects.toThrow(
      'Ongoing competition "Ogretoberfest 14" not found',
    );
    expect(json.rows).toHaveBeenCalledTimes(1);
  });

  it('refuses a row of the wrong shape', async () => {
    results.set(CANDIDATES_SQL, [{ ...CANDIDATE, tpId: 500 }]);

    await expect(service.load()).rejects.toThrow();
  });

  it('refuses an unknown characteristic format', async () => {
    results.set(POSITION_RULES_SETS_SQL, [
      { ...PRS, formats: { ...PRS.formats, ag: 'minus' } },
    ]);

    await expect(service.load()).rejects.toThrow();
  });

  it('passes on a query failure', async () => {
    json.rows.mockRejectedValue(
      new Error('Production query failed (exit 3): boom'),
    );

    await expect(service.load()).rejects.toThrow('boom');
  });
});
