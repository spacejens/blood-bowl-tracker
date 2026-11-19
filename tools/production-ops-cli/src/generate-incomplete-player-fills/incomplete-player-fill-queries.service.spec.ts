import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';
import { ZodError } from 'zod';

import {
  ADVANCEMENT_COSTS_SQL,
  BIG_GUY_POSITIONS_SQL,
  CANDIDATES_SQL,
  CONSEQUENCES_SQL,
  ERA_RULES_SETS_SQL,
  FREE_SKILL_RISK_SQL,
  INCOMPLETE_PLAYER_CONDITIONS,
  LASTING_INJURY_REPAIRS_SQL,
  ONGOING_COMPETITIONS_SQL,
  PAID_ADVANCEMENTS_SQL,
  POSITION_ACCESS_SQL,
  POSITION_RULES_SETS_SQL,
  POSITION_SKILLS_SQL,
  REDUCTION_COUNT_COLUMNS,
  SKILL_CATEGORIES_SQL,
  SKILL_NAMES_SQL,
  STAT_REDUCTION_EVENTS_SQL,
  STORED_ADVANCEMENTS_SQL,
  TEAM_COMPETITIONS_SQL,
  TEAM_PLAYERS_CTE,
  TEAM_PLAYERS_SQL,
  TEAM_ROSTERS_SQL,
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

const TEAM_PLAYER = {
  playerId: 1,
  teamId: 20,
  eraId: 4,
  positionId: 30,
  playerName: 'Flame',
  positionName: 'Gnoblar Lineman',
  sppTotal: 20,
  unspentSpp: null,
  isJourneyman: true,
  isIncomplete: true,
};
const PAID = [
  { playerId: 1, skillId: 200, attributeValue: '+1', characteristic: null },
  { playerId: 1, skillId: null, attributeValue: null, characteristic: 'ma' },
];
const COST = {
  eraId: 4,
  rulesSetId: 7,
  leagueId: null,
  advancementNumber: 1,
  advancementKind: 'chosen_primary_skill',
  skillId: null,
  sppCost: 6,
};
const REDUCTION = {
  playerId: 2,
  characteristic: 'ma',
  competitionId: 50,
  playedAt: '2024-03-01T19:00:00+00:00',
};
const TEAM_COMPETITION = {
  playerId: 2,
  competitionId: 50,
  lastPlayedAt: '2024-04-01T19:00:00+00:00',
};

const REPAIR = {
  player: { system: 'tourplay.net', id: '929761' },
  line: { ma: 6, st: 3, ag: 3, pa: null, av: 8 },
  increases: ['ma', 'av'],
  context: {
    formats: { ma: 'bare', st: 'bare', ag: 'plus', pa: 'absent', av: 'plus' },
    baseline: { ma: 6, st: 3, ag: 3, pa: null, av: 9 },
  },
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
        CONSEQUENCES_SQL,
        [
          { playerId: 1, hasStatReduction: false, hasDeath: true },
          { playerId: 2, hasStatReduction: true, hasDeath: false },
          { playerId: 3, hasStatReduction: true, hasDeath: true },
        ],
      ],
      [STORED_ADVANCEMENTS_SQL, []],
      [FREE_SKILL_RISK_SQL, [{ playerId: 9 }]],
      [
        ONGOING_COMPETITIONS_SQL,
        [
          { competitionName: 'Major Season 31', teamId: 20 },
          { competitionName: 'Ogretoberfest 14', teamId: 21 },
          { competitionName: 'Ogretoberfest 14', teamId: 20 },
        ],
      ],
      [POSITION_RULES_SETS_SQL, [PRS]],
      [POSITION_SKILLS_SQL, [SKILL]],
      [ERA_RULES_SETS_SQL, [{ eraId: 4, rulesSetId: 7, cheapestCost: 6 }]],
      [TEAM_PLAYERS_SQL, [TEAM_PLAYER]],
      [TEAM_ROSTERS_SQL, [{ teamId: 20, rosterId: '24801' }]],
      [PAID_ADVANCEMENTS_SQL, PAID],
      [
        SKILL_NAMES_SQL,
        [{ skillId: 200, skillName: 'Dodge', nameId: 'Dodge' }],
      ],
      [
        SKILL_CATEGORIES_SQL,
        [{ skillId: 200, rulesSetId: 7, category: 'agility' }],
      ],
      [
        POSITION_ACCESS_SQL,
        [
          {
            positionId: 30,
            rulesSetId: 7,
            category: 'agility',
            access: 'primary',
          },
        ],
      ],
      [ADVANCEMENT_COSTS_SQL, [COST]],
      [STAT_REDUCTION_EVENTS_SQL, [REDUCTION]],
      [TEAM_COMPETITIONS_SQL, [TEAM_COMPETITION]],
      [BIG_GUY_POSITIONS_SQL, [{ positionId: 30, eraId: 4 }]],
      [LASTING_INJURY_REPAIRS_SQL, [REPAIR]],
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
      statReductionPlayerIds: [2, 3],
      deathPlayerIds: [1, 3],
      storedAdvancements: [],
      freeSkillRiskPlayerIds: [9],
      ongoingTeamIds: [20, 21],
      positionRulesSets: [PRS],
      positionSkills: [SKILL],
      eraRulesSets: [{ eraId: 4, rulesSetId: 7, cheapestCost: 6 }],
      teamPlayers: [TEAM_PLAYER],
      teamRosters: [{ teamId: 20, rosterId: '24801' }],
      paidAdvancements: PAID,
      skillNames: [{ skillId: 200, skillName: 'Dodge', nameId: 'Dodge' }],
      skillCategories: [{ skillId: 200, rulesSetId: 7, category: 'agility' }],
      positionAccess: [
        {
          positionId: 30,
          rulesSetId: 7,
          category: 'agility',
          access: 'primary',
        },
      ],
      advancementCosts: [COST],
      statReductionEvents: [REDUCTION],
      teamCompetitions: [TEAM_COMPETITION],
      bigGuyPositions: [{ positionId: 30, eraId: 4 }],
    });
  });

  it('finds Big Guy positions by keyword name, per candidate era', () => {
    expect(BIG_GUY_POSITIONS_SQL).toContain("k.name = 'Big Guy'");
    expect(BIG_GUY_POSITIONS_SQL).toContain('position_rules_set_keywords');
    expect(BIG_GUY_POSITIONS_SQL).toContain(
      'SELECT position_id, era_id FROM candidates',
    );
  });

  it('finds team rosters by their tourplay.net external id', () => {
    expect(TEAM_ROSTERS_SQL).toContain("es.name = 'tourplay.net'");
    expect(TEAM_ROSTERS_SQL).toContain('teams_external_ids');
  });

  it("selects each rules set's own costs and the era league's", () => {
    expect(ADVANCEMENT_COSTS_SQL).toContain(
      'ac.league_id IS NULL OR ac.league_id = e.league_id',
    );
  });

  it('selects every stat-reduction consequence type', () => {
    for (const type of [
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_pa',
      'stat_reduction_av',
    ]) {
      expect(STAT_REDUCTION_EVENTS_SQL).toContain(`'${type}'`);
      expect(TEAM_COMPETITIONS_SQL).toContain(`'${type}'`);
      expect(CONSEQUENCES_SQL).toContain(`'${type}'`);
    }
  });

  it('skips removed position access rows', () => {
    expect(POSITION_ACCESS_SQL).toContain('prsc.removed = false');
  });

  it.each([
    [
      'an unknown characteristic',
      STAT_REDUCTION_EVENTS_SQL,
      { ...REDUCTION, characteristic: 'xx' },
    ],
    [
      'an unreadable match date',
      STAT_REDUCTION_EVENTS_SQL,
      { ...REDUCTION, playedAt: 'soon' },
    ],
    [
      'an unreadable last match date',
      TEAM_COMPETITIONS_SQL,
      { ...TEAM_COMPETITION, lastPlayedAt: 'soon' },
    ],
    [
      'an unknown advancement kind',
      ADVANCEMENT_COSTS_SQL,
      { ...COST, advancementKind: 'bribe' },
    ],
    [
      'an unknown skill access',
      POSITION_ACCESS_SQL,
      {
        positionId: 30,
        rulesSetId: 7,
        category: 'agility',
        access: 'tertiary',
      },
    ],
    [
      'an unknown paid characteristic',
      PAID_ADVANCEMENTS_SQL,
      { ...PAID[1], characteristic: 'xx' },
    ],
    [
      'a team player without a journeyman marker',
      TEAM_PLAYERS_SQL,
      { ...TEAM_PLAYER, isJourneyman: null },
    ],
    [
      'a team player without an incomplete flag',
      TEAM_PLAYERS_SQL,
      { ...TEAM_PLAYER, isIncomplete: null },
    ],
  ])('rejects %s', async (_name, sql, row) => {
    results.set(sql, [row]);

    await expect(service.load()).rejects.toBeInstanceOf(ZodError);
  });

  it("selects only non-star TP players of the candidates' teams as team players", () => {
    const teamPlayers = TEAM_PLAYERS_CTE.slice(
      TEAM_PLAYERS_CTE.indexOf('team_players AS ('),
    );

    expect(teamPlayers).toContain("es.name = 'tourplay.net'");
    expect(teamPlayers).toContain('pos.is_star_player = false');
    expect(teamPlayers).toContain(
      'te.team_id IN (SELECT team_id FROM candidates)',
    );
    expect(TEAM_PLAYERS_SQL).toContain('FROM team_players');
  });

  it('flags each team player incomplete by exactly the conditions that select candidates', () => {
    const teamPlayers = TEAM_PLAYERS_CTE.slice(
      TEAM_PLAYERS_CTE.indexOf('team_players AS ('),
    );

    expect(teamPlayers).toContain(
      `(${INCOMPLETE_PLAYER_CONDITIONS.map(
        (condition) => `p.${condition}`,
      ).join(' OR ')}) AS is_incomplete`,
    );
    expect(TEAM_PLAYERS_SQL).toContain('is_incomplete AS "isIncomplete"');
  });

  it('selects only paid advancements that are still held', () => {
    expect(PAID_ADVANCEMENTS_SQL).toContain('pa.removed = false');
    expect(PAID_ADVANCEMENTS_SQL).toContain("pa.source <> 'starting'");
    expect(PAID_ADVANCEMENTS_SQL).toContain('pa.is_free_extra = false');
    expect(PAID_ADVANCEMENTS_SQL).toContain(
      'JOIN team_players tp ON tp.player_id = pa.player_id',
    );
  });

  it("prices the team players' eras and positions, not only the candidates'", () => {
    for (const sql of [
      ERA_RULES_SETS_SQL,
      SKILL_CATEGORIES_SQL,
      POSITION_ACCESS_SQL,
      ADVANCEMENT_COSTS_SQL,
    ]) {
      const filter = sql.slice(TEAM_PLAYERS_CTE.length);

      expect(filter).toContain('FROM team_players');
      expect(filter).not.toContain('FROM candidates)');
    }
  });

  it('selects only incomplete, non-star TP players', () => {
    expect(CANDIDATES_SQL).toContain("es.name = 'tourplay.net'");
    expect(CANDIDATES_SQL).toContain('pos.is_star_player = false');
    for (const condition of INCOMPLETE_PLAYER_CONDITIONS) {
      expect(CANDIDATES_SQL).toContain(`p.${condition}`);
    }
  });

  it('refuses to run when an ongoing competition has no team', async () => {
    results.set(ONGOING_COMPETITIONS_SQL, [
      { competitionName: 'Major Season 31', teamId: 20 },
    ]);

    await expect(service.load()).rejects.toThrow(
      'Ongoing competition "Ogretoberfest 14" has no enrolled or playing team',
    );
    expect(json.rows).toHaveBeenCalledTimes(1);
  });

  it('refuses an ongoing-competition row with no team', async () => {
    results.set(ONGOING_COMPETITIONS_SQL, [
      { competitionName: 'Major Season 31', teamId: 20 },
      { competitionName: 'Ogretoberfest 14', teamId: null },
    ]);

    await expect(service.load()).rejects.toBeInstanceOf(ZodError);
    expect(json.rows).toHaveBeenCalledTimes(1);
  });

  it('counts both enrolled teams and teams in matches as ongoing', () => {
    expect(ONGOING_COMPETITIONS_SQL).toContain('game_data.competition_teams');
    expect(ONGOING_COMPETITIONS_SQL).toContain('game_data.match_teams');
  });

  it('treats an award of a skill-granting trophy, or one that records a skill, as a free-skill risk', () => {
    expect(FREE_SKILL_RISK_SQL).toContain(
      'JOIN game_data.trophies t ON t.id = ta.trophy_id',
    );
    expect(FREE_SKILL_RISK_SQL).toContain(
      'JOIN candidates c ON c.player_id = ta.player_id',
    );
    expect(FREE_SKILL_RISK_SQL).toContain(
      'WHERE t.grants_skill = true OR ta.granted_skill_id IS NOT NULL',
    );
  });

  it("scopes position skills to the candidates' positions in their eras", () => {
    expect(POSITION_SKILLS_SQL).toContain(
      'WHERE (prs.position_id, ers.era_id) IN',
    );
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

  describe('loadLastingInjuryRepairCandidates', () => {
    it('loads the repair candidates', async () => {
      await expect(
        service.loadLastingInjuryRepairCandidates(),
      ).resolves.toEqual([REPAIR]);
    });

    it('loads a candidate whose era has no start line or no rules set', async () => {
      const noBaseline = {
        ...REPAIR,
        context: { ...REPAIR.context, baseline: null },
      };
      const noRulesSet = { ...REPAIR, context: null };
      results.set(LASTING_INJURY_REPAIRS_SQL, [noBaseline, noRulesSet]);

      await expect(
        service.loadLastingInjuryRepairCandidates(),
      ).resolves.toEqual([noBaseline, noRulesSet]);
    });

    it('refuses an entry of another system', async () => {
      results.set(LASTING_INJURY_REPAIRS_SQL, [
        { ...REPAIR, player: { system: 'tloeg.bbleague.se', id: '47' } },
      ]);

      await expect(
        service.loadLastingInjuryRepairCandidates(),
      ).rejects.toBeInstanceOf(ZodError);
    });

    it('refuses an unknown increase', async () => {
      results.set(LASTING_INJURY_REPAIRS_SQL, [
        { ...REPAIR, increases: ['MA'] },
      ]);

      await expect(
        service.loadLastingInjuryRepairCandidates(),
      ).rejects.toBeInstanceOf(ZodError);
    });

    it("reads the player's active characteristic increases", () => {
      expect(LASTING_INJURY_REPAIRS_SQL).toContain('adv.removed = false');
      expect(LASTING_INJURY_REPAIRS_SQL).toContain(
        "adv.source = 'characteristic'",
      );
      expect(LASTING_INJURY_REPAIRS_SQL).toContain(
        'lower(adv.characteristic::text)',
      );
    });

    it('resolves the rules set as PositionRulesSetsService.findCharacteristicsContext does', () => {
      expect(LASTING_INJURY_REPAIRS_SQL).toContain(
        'WHERE ers.era_id = te.era_id',
      );
      expect(LASTING_INJURY_REPAIRS_SQL).toContain(
        'AND prs.position_id = p.position_id',
      );
      expect(LASTING_INJURY_REPAIRS_SQL).toContain(
        'ORDER BY (prs.id IS NULL) ASC, ers.id DESC',
      );
      expect(LASTING_INJURY_REPAIRS_SQL).toContain('LIMIT 1');
    });

    it('selects complete, non-star TP players', () => {
      expect(LASTING_INJURY_REPAIRS_SQL).toContain("es.name = 'tourplay.net'");
      expect(LASTING_INJURY_REPAIRS_SQL).toContain(
        'pos.is_star_player = false',
      );
      expect(LASTING_INJURY_REPAIRS_SQL).toContain(
        `AND NOT (${INCOMPLETE_PLAYER_CONDITIONS.map(
          (condition) => `p.${condition}`,
        ).join(' OR ')})`,
      );
    });

    it('selects players with no reduction stored', () => {
      expect(REDUCTION_COUNT_COLUMNS).toEqual([
        'move_reduction_count',
        'strength_reduction_count',
        'agility_reduction_count',
        'passing_reduction_count',
        'armour_reduction_count',
      ]);
      for (const column of REDUCTION_COUNT_COLUMNS) {
        expect(LASTING_INJURY_REPAIRS_SQL).toContain(`p.${column} = 0`);
      }
    });

    it('selects players with a recorded stat reduction', () => {
      for (const type of [
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_pa',
        'stat_reduction_av',
      ]) {
        expect(LASTING_INJURY_REPAIRS_SQL).toContain(`'${type}'`);
      }
      expect(LASTING_INJURY_REPAIRS_SQL).toContain(
        'me.consequence_player_id = p.id',
      );
    });
  });
});
