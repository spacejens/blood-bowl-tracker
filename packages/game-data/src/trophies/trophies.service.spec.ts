import type { Db } from '@blood-bowl-tracker/db';
import { DB, trophies } from '@blood-bowl-tracker/db';
import type {
  QueryChain,
  QueryOutcome,
} from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { TrophiesService, TrophyUpsertConflictError } from './trophies.service';

const fakeTrophy = {
  id: 1,
  name: 'Chaos Cup',
  recipientKind: 'team' as const,
  description: 'The team that wins after four matches.',
  createdAt: new Date('2026-01-01'),
};

describe('TrophiesService', () => {
  let service: TrophiesService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: QueryOutcome[]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophiesService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TrophiesService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  const baseData = {
    name: 'Chaos Cup',
    recipientKind: 'team' as const,
    description: 'The team that wins after four matches.',
    awardRuleKind: 'direct_source' as const,
    awardProcedure: 'Recorded from the season standings.',
    externalIds: [{ externalSystemId: 1, externalId: 'Chaos Cup' }],
  };

  it('creates a new trophy when no external IDs match', async () => {
    // query 0: external-id lookup finds nothing; query 1: the insert
    // returns the row; query 2: the one external ID is new and gets inserted.
    const { db, chains } = await build([], [fakeTrophy]);

    const result = await service.upsert(baseData);

    expect(result).toEqual({ trophy: fakeTrophy, created: true });
    // Three for the trophy row itself, then three clearing deletes: the kind
    // is `direct_source`, which computes nothing, so the two event-type
    // tables and the eligible-position table must hold no rows for it.
    expect(chains).toHaveLength(6);
    expect(db.insert).toHaveBeenCalledWith(trophies);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates the matching trophy when exactly one external ID matches', async () => {
    const { db } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Chaos Cup' }],
      [fakeTrophy],
    );

    const result = await service.upsert(baseData);

    expect(result).toEqual({ trophy: fakeTrophy, created: false });
    expect(db.update).toHaveBeenCalledWith(trophies);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws TrophyUpsertConflictError when external IDs match two trophies', async () => {
    await build([
      { ownerId: 1, externalSystemId: 1, externalId: 'Chaos Cup' },
      { ownerId: 2, externalSystemId: 2, externalId: 'other' },
    ]);

    await expect(
      service.upsert({
        ...baseData,
        externalIds: [
          { externalSystemId: 1, externalId: 'Chaos Cup' },
          { externalSystemId: 2, externalId: 'other' },
        ],
      }),
    ).rejects.toBeInstanceOf(TrophyUpsertConflictError);
  });

  it('writes the league id on the external-id upsert path', async () => {
    const { chains } = await build([], [{ ...fakeTrophy, leagueId: 7 }]);

    await service.upsert({
      ...baseData,
      competitionGroupId: null,
      leagueId: 7,
    });

    expect(firstCallArg(chains[1].values)).toMatchObject({
      competitionGroupId: null,
      leagueId: 7,
    });
  });

  it('replaces the curated rule event types when they are supplied, atomically with the trophy row', async () => {
    const { db, chains } = await build([], [fakeTrophy]);

    await service.upsert({
      name: 'Top Fouler',
      recipientKind: 'player',
      awardRuleKind: 'max_count',
      awardRuleRole: 'acting',
      awardRuleTieCutoff: 4,
      awardRuleMatchEventTypes: [
        { actionType: 'foul' },
        { consequenceType: 'casualty' },
      ],
      awardRuleExcludedMatchEventTypes: [],
      externalIds: [
        { externalSystemId: 1, externalId: 'Top Fouler-Major Season' },
      ],
    });

    // Query order: 0 external-id lookup, 1 entity insert, 2 new-external-id
    // insert, then the junction sync's own queries — 3 the included-types
    // delete, 4 the included-types insert, 5 the excluded-types delete (the
    // supplied excluded array is empty, so no matching insert follows).
    expect(chains).toHaveLength(6);
    expect(extractFilterValues(firstCallArg(chains[3].where))).toBe(
      fakeTrophy.id,
    );
    expect(firstCallArg(chains[4].values)).toEqual([
      { trophyId: 1, actionType: 'foul', consequenceType: null },
      { trophyId: 1, actionType: null, consequenceType: 'casualty' },
    ]);
    expect(extractFilterValues(firstCallArg(chains[5].where))).toBe(
      fakeTrophy.id,
    );
    // All of it inside the single transaction the trophy-row upsert opens, so
    // the scalar rule columns and the event types commit or roll back together.
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('replaces the curated eligible positions when they are supplied', async () => {
    const { db, chains } = await build([], [fakeTrophy]);

    await service.upsert({
      name: 'Bierhallenführer',
      recipientKind: 'player',
      awardRuleKind: 'max_spp_sum',
      awardRuleRole: 'acting',
      awardRuleTieCutoff: 4,
      awardRuleEligiblePositions: [
        'Ogre: Ogre Blocker',
        'Ogre: Ogre Runt Punter',
      ],
      externalIds: [{ externalSystemId: 1, externalId: 'Bierhallenführer' }],
    });

    // Query order: 0 external-id lookup, 1 entity insert, 2 new-external-id
    // insert, then the eligible-position sync's own two — 3 the delete, 4 the
    // insert. Both event-type arrays are omitted, so that sync issues nothing.
    expect(chains).toHaveLength(5);
    expect(extractFilterValues(firstCallArg(chains[3].where))).toBe(
      fakeTrophy.id,
    );
    expect(firstCallArg(chains[4].values)).toEqual([
      { trophyId: 1, positionNameExternalId: 'Ogre: Ogre Blocker' },
      { trophyId: 1, positionNameExternalId: 'Ogre: Ogre Runt Punter' },
    ]);
    // Same one transaction as the trophy row: a restriction must never commit
    // apart from the rule kind it restricts.
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('clears the curated eligible positions when an empty array is supplied', async () => {
    const { db, chains } = await build([], [fakeTrophy]);

    await service.upsert({
      name: 'Bierhallenführer',
      recipientKind: 'player',
      awardRuleKind: 'max_spp_sum',
      awardRuleEligiblePositions: [],
      externalIds: [{ externalSystemId: 1, externalId: 'Bierhallenführer' }],
    });

    // The delete runs, but no insert follows it — which is how a rule that
    // stops restricting positions drops its stale rows.
    expect(chains).toHaveLength(4);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it('leaves the curated rule event types alone when they are omitted, still inside the one transaction', async () => {
    const { db, chains } = await build([], [fakeTrophy]);

    await service.upsert({
      name: 'Top Fouler',
      recipientKind: 'player',
      awardRuleKind: 'max_count',
      externalIds: [
        { externalSystemId: 1, externalId: 'Top Fouler-Major Season' },
      ],
    });

    // Only the three queries of the trophy-row upsert itself — external-id
    // lookup, entity insert, new-external-id insert. Omitting both rule arrays
    // means the junction sync issues no delete and no insert of its own, so
    // the curated rows already in those tables are left untouched. The same
    // goes for the omitted eligible-positions array.
    expect(chains).toHaveLength(3);
    expect(db.delete).not.toHaveBeenCalled();
    // Still exactly one transaction: the arrays being omitted changes what the
    // sync writes, not whether the write path is transactional.
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('clears every computed rule part when a trophy is reclassified to a non-computed kind', async () => {
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Gudarnas Förkämpe' }],
      [fakeTrophy],
    );

    await service.upsert({
      name: 'Gudarnas Förkämpe',
      recipientKind: 'player',
      awardRuleKind: 'manual',
      awardProcedure: 'The Chaos Cup winner rolls a D3 among three players.',
      externalIds: [{ externalSystemId: 1, externalId: 'Gudarnas Förkämpe' }],
    });

    // 0 external-id lookup, 1 the entity update, then one delete per rule
    // table: included types, excluded types, eligible positions. A `manual`
    // trophy computes nothing, so an omitted array means "none" rather than
    // "leave alone" — otherwise the rows of the computed rule this trophy
    // used to be classified under would outlive the reclassification.
    expect(chains).toHaveLength(5);
    expect(db.delete).toHaveBeenCalledTimes(3);
    // Cleared, not re-stated: nothing is inserted back into any of the three.
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('clears each rule table once when a non-computed kind also states its empty arrays', async () => {
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Chaos Cup' }],
      [fakeTrophy],
    );

    await service.upsert({
      ...baseData,
      awardRuleMatchEventTypes: [],
      awardRuleExcludedMatchEventTypes: [],
      awardRuleEligiblePositions: [],
    });

    // Explicitly empty and omitted resolve to the same thing here, so stating
    // them changes nothing about what is written.
    expect(chains).toHaveLength(5);
    expect(db.delete).toHaveBeenCalledTimes(3);
  });

  it('discards the curated rule rows a non-computed upsert supplies anyway', async () => {
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Chaos Cup' }],
      [fakeTrophy],
    );

    await service.upsert({
      ...baseData,
      awardRuleMatchEventTypes: [{ actionType: 'touchdown' }],
      awardRuleEligiblePositions: ['Blitzer'],
    });

    // 0 lookup, 1 update, then one delete per rule table and no insert: a
    // `direct_source` trophy computes nothing, so curation it cannot use is
    // dropped whether it was omitted or stated outright.
    expect(chains).toHaveLength(5);
    expect(db.delete).toHaveBeenCalledTimes(3);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('leaves every rule table alone when the upsert states no award rule kind', async () => {
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Chaos Cup' }],
      [fakeTrophy],
    );

    await service.upsert({
      name: 'Chaos Cup',
      externalIds: [{ externalSystemId: 1, externalId: 'Chaos Cup' }],
    });

    // An upsert that does not touch the classification cannot know what the
    // stored kind is, so it falls back to the plain overlay semantics: the
    // trophy's curated rule rows are neither read nor written.
    expect(chains).toHaveLength(2);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('propagates the event-type sync failure from inside the same transaction as the trophy row write', async () => {
    const failure = new Error('junction insert failed');
    // Query order for a create-path upsert with an included rule array:
    // 0 external-id lookup (no match), 1 entity insert (`.returning()`),
    // 2 new-external-id insert, 3 event-type delete, 4 event-type insert —
    // made to reject here, to exercise the sync-failure path.
    const { db, chains } = await build([], [fakeTrophy], [], [], failure);

    await expect(
      service.upsert({
        name: 'Top Fouler',
        recipientKind: 'player',
        awardRuleKind: 'max_count',
        awardRuleMatchEventTypes: [{ actionType: 'foul' }],
        externalIds: [
          { externalSystemId: 1, externalId: 'Top Fouler-Major Season' },
        ],
      }),
    ).rejects.toThrow(failure);

    // The failure happened inside the one transaction the whole call runs
    // in (mockDb's `transaction` really invokes its callback, so a rejection
    // from inside it propagates out of `db.transaction` itself, matching
    // real Postgres rolling the whole transaction back) — there was never a
    // second, already-committed transaction holding just the trophy row.
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(chains).toHaveLength(5);
  });

  describe('resolveByName', () => {
    it('answers the id of the one trophy carrying the name', async () => {
      const { chains } = await build([{ id: 31 }]);

      await expect(service.resolveByName('Season MVP')).resolves.toEqual({
        found: true,
        id: 31,
      });
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(
        'Season MVP',
      );
      // Confirms the match is a real `eq()`, not merely a value check: a
      // value-only assertion cannot distinguish `eq()` from `ilike()`, so an
      // accidental case-insensitive swap (searchByNamePrefix two methods up
      // already uses ilike) would silently break the "exact and
      // case-sensitive" guarantee this method's doc comment promises.
      const sql = sqlText(firstCallArg(chains[0].where));
      expect(sql).toContain('=');
      expect(sql.toLowerCase()).not.toContain('ilike');
      expect(sql.toLowerCase()).not.toContain('lower');
    });

    it('reports not found rather than throwing for an unknown name', async () => {
      await build([]);

      await expect(service.resolveByName('Nonesuch')).resolves.toEqual({
        found: false,
      });
    });

    it('reports not found for an ambiguous name rather than picking one', async () => {
      await build([{ id: 31 }, { id: 32 }]);

      await expect(service.resolveByName('Top Scorer')).resolves.toEqual({
        found: false,
      });
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns trophies with their competition group name, ordered by name and limited', async () => {
      const rows = [
        {
          id: 7,
          name: 'Chaos Cup',
          competitionGroupId: 4,
          competitionGroupName: 'Major',
          leagueName: null,
        },
        {
          id: 9,
          name: 'Chaos Shield',
          competitionGroupId: 5,
          competitionGroupName: 'Minor',
          leagueName: null,
        },
      ];
      likePattern.escape.mockReturnValue('cha');
      const { chains } = await build(rows);

      await expect(service.searchByNamePrefix('cha', 25)).resolves.toEqual(
        rows,
      );

      expect(chains[0].limit).toHaveBeenCalledWith(25);
      expect(chains[0].orderBy).toHaveBeenCalledWith(trophies.name);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
    });

    it('escapes LIKE metacharacters in the prefix before matching', async () => {
      likePattern.escape.mockReturnValue('50\\%\\_\\\\off');
      const { chains } = await build([]);

      await service.searchByNamePrefix('50%_\\off', 25);

      expect(likePattern.escape).toHaveBeenCalledWith('50%_\\off');
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      // The escaped pattern value is passed as a raw SQL parameter chunk.
      const condition = firstCallArg(chains[0].where) as {
        queryChunks: unknown[];
      };
      expect(condition.queryChunks).toContain('50\\%\\_\\\\off%');
    });

    it('returns both scope names from the prefix search', async () => {
      await build([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueName: 'tLoEG',
        },
      ]);

      expect(await service.searchByNamePrefix('Leg', 25)).toEqual([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueName: 'tLoEG',
        },
      ]);
    });
  });

  describe('findById', () => {
    it('returns the trophy header joined to its competition group', async () => {
      const header = {
        id: 7,
        name: 'Chaos Cup',
        description: 'The team that wins after four matches.',
        competitionGroupId: 4,
        competitionGroupName: 'Major',
        leagueId: null,
        leagueName: null,
      };
      const { chains } = await build([header]);

      await expect(service.findById(7)).resolves.toEqual(header);

      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
    });

    it('carries the award rule columns in the deepdive header', async () => {
      const header = {
        id: 1,
        name: 'Top Scorer',
        description: 'Most touchdowns during the season.',
        competitionGroupId: 4,
        competitionGroupName: 'Major Season',
        leagueId: null,
        leagueName: null,
        awardRuleKind: 'max_count' as const,
        awardProcedure: null,
        awardRuleTieCutoff: 4,
        awardRuleThreshold: null,
        awardRuleMeasure: null,
      };
      await build([header]);

      const result = await service.findById(1);

      expect(result?.awardRuleKind).toBe('max_count');
      expect(result?.awardRuleTieCutoff).toBe(4);
    });

    it('returns undefined when no trophy has that id', async () => {
      await build([]);

      await expect(service.findById(999)).resolves.toBeUndefined();
    });

    it('selects the competition group id so the deepdive can link to the group', async () => {
      const { db } = await build([]);

      await service.findById(1);
      expect(Object.keys(firstCallArg(db.select) as object)).toEqual([
        'id',
        'name',
        'description',
        'competitionGroupId',
        'competitionGroupName',
        'leagueId',
        'leagueName',
        'awardRuleKind',
        'awardProcedure',
        'awardRuleTieCutoff',
        'awardRuleThreshold',
        'awardRuleMeasure',
      ]);
    });

    it('resolves a league-scoped trophy header through the league join', async () => {
      const { chains } = await build([
        {
          id: 3,
          name: 'Legendary Player',
          description: null,
          competitionGroupId: null,
          competitionGroupName: null,
          leagueId: 7,
          leagueName: 'tLoEG',
        },
      ]);

      const header = await service.findById(3);

      expect(header).toMatchObject({ leagueId: 7, leagueName: 'tLoEG' });
      // Both scope joins are outer, so a row with either scope survives.
      expect(chains[0].leftJoin).toHaveBeenCalledTimes(2);
      expect(chains[0].innerJoin).not.toHaveBeenCalled();
    });
  });

  describe('listByCompetitionGroup', () => {
    it('returns the id and name of every trophy the group awards, ordered by name', async () => {
      const rows = [
        { id: 3, name: '1st place' },
        { id: 4, name: 'Most casualties' },
      ];
      const { db, chains } = await build(rows);

      await expect(service.listByCompetitionGroup(4)).resolves.toEqual(rows);
      expect(Object.keys(firstCallArg(db.select) as object)).toEqual([
        'id',
        'name',
      ]);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(4);
      expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when the group awards no trophies', async () => {
      await build([]);

      await expect(service.listByCompetitionGroup(4)).resolves.toEqual([]);
    });
  });

  describe('listAllWithLeague', () => {
    const rows = [
      {
        id: 1,
        name: 'Chaos Cup',
        competitionGroupId: 3,
        competitionGroupName: 'Chaos Cup',
        leagueId: null,
        leagueName: null,
      },
      {
        id: 2,
        name: '1st',
        competitionGroupId: 4,
        competitionGroupName: 'Major Season',
        leagueId: null,
        leagueName: null,
      },
    ];

    it('returns the rows the query resolves to and outer-joins trophies to competition groups and leagues', async () => {
      const { db, chains } = await build(rows);
      await expect(service.listAllWithLeague({})).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
      expect(chains[0].innerJoin).not.toHaveBeenCalled();
    });

    it("filters by either the competition group's league id or the trophy's own when the scope carries a leagueId", async () => {
      const { chains } = await build(rows);
      await service.listAllWithLeague({ leagueId: 42 });
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        42, 42,
      ]);
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'competition_groups.league_id',
        'trophies.league_id',
      ]);
    });

    it('applies no league filter when the scope has no leagueId', async () => {
      const { chains } = await build(rows);
      await service.listAllWithLeague({});
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(firstCallArg(chains[0].where)).toBeUndefined();
    });

    it('resolves to an empty list when the catalog is empty', async () => {
      await build([]);
      await expect(service.listAllWithLeague({})).resolves.toEqual([]);
    });

    it('includes league-scoped trophies when scoping the catalog to a league', async () => {
      const { chains } = await build([]);

      await service.listAllWithLeague({ leagueId: 7 });

      // The filter is an OR over the group's league and the trophy's own,
      // so the league id appears on both sides.
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        7, 7,
      ]);
    });

    it('applies no filter to the catalog when the scope is all-time', async () => {
      const { chains } = await build([]);

      await service.listAllWithLeague({});

      expect(firstCallArg(chains[0].where)).toBeUndefined();
    });

    it('returns the trophy catalog with both scope names', async () => {
      await build([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueId: 7,
          leagueName: 'tLoEG',
        },
      ]);

      expect(await service.listAllWithLeague({})).toEqual([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueId: 7,
          leagueName: 'tLoEG',
        },
      ]);
    });
  });

  describe('findAwardRuleCuration', () => {
    it("reads a trophy's curated rule event types, flattened for display", async () => {
      await build(
        [{ actionType: 'foul', consequenceType: null }],
        [{ actionType: 'mvp_award', consequenceType: null }],
        [],
      );

      await expect(service.findAwardRuleCuration(1)).resolves.toEqual({
        includedActionTypes: ['foul'],
        includedConsequenceTypes: [],
        excludedActionTypes: ['mvp award'],
        excludedConsequenceTypes: [],
        eligiblePositions: [],
      });
    });

    it("reduces the curated position ids to the positions' own names", async () => {
      // Bierhallenfuehrer's real restriction. The rows store the
      // `Name`-system id, `"<race>: <position>"`, but a sentence about the
      // rule has to read as prose, so only the position half is displayed.
      await build(
        [],
        [],
        [
          { positionNameExternalId: 'Ogre: Ogre Blocker' },
          { positionNameExternalId: 'Ogre: Ogre Runt Punter' },
        ],
      );

      await expect(service.findAwardRuleCuration(1)).resolves.toEqual({
        includedActionTypes: [],
        includedConsequenceTypes: [],
        excludedActionTypes: [],
        excludedConsequenceTypes: [],
        eligiblePositions: ['Ogre Blocker', 'Ogre Runt Punter'],
      });
    });

    it('keeps action types and consequence types separate for a compound rule', async () => {
      // Top Fouler's real curated rule: a `foul` action that ALSO caused one
      // of these consequences. Flattening both columns into one list would
      // lose exactly the distinction that makes this an AND, not an OR list.
      await build(
        [
          { actionType: 'foul', consequenceType: null },
          { actionType: null, consequenceType: 'casualty' },
          { actionType: null, consequenceType: 'badly_hurt' },
        ],
        [],
        [],
      );

      await expect(service.findAwardRuleCuration(1)).resolves.toEqual({
        includedActionTypes: ['foul'],
        includedConsequenceTypes: ['casualty', 'badly hurt'],
        excludedActionTypes: [],
        excludedConsequenceTypes: [],
        eligiblePositions: [],
      });
    });
  });

  describe('listByLeague', () => {
    it('lists trophies scoped directly to one league, ordered by name', async () => {
      const { chains } = await build([
        { id: 3, name: 'Legendary Player' },
        { id: 4, name: 'Trogen Tjänst' },
      ]);

      const rows = await service.listByLeague(7);

      expect(rows).toEqual([
        { id: 3, name: 'Legendary Player' },
        { id: 4, name: 'Trogen Tjänst' },
      ]);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
      expect(chains[0].orderBy).toHaveBeenCalled();
    });
  });
});
