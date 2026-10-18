import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import {
  trophyAwardRuleEligiblePositions,
  trophyAwardRuleExcludedMatchEventTypes,
  trophyAwardRuleMatchEventTypes,
} from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { TrophyRuleCurationSyncService } from './trophy-rule-curation-sync.service';

const computed: UpsertTrophy = {
  name: 'Top Fouler',
  recipientKind: 'player',
  awardRuleKind: 'max_count',
  externalIds: [{ externalSystemId: 1, externalId: 'Top Fouler' }],
};

describe('TrophyRuleCurationSyncService', () => {
  let service: TrophyRuleCurationSyncService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TrophyRuleCurationSyncService],
    }).compile();
    service = moduleRef.get(TrophyRuleCurationSyncService);
  });

  it('inserts every curated event type when none is stored yet', async () => {
    const { db, chains } = mockDb([]);

    await service.sync(db, 1, {
      ...computed,
      awardRuleMatchEventTypes: [
        { actionType: 'foul' },
        { consequenceType: 'casualty' },
      ],
    });

    // 0 the stored-row read, 1 the insert.
    expect(chains).toHaveLength(2);
    expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(1);
    expect(db.insert).toHaveBeenCalledWith(trophyAwardRuleMatchEventTypes);
    expect(firstCallArg(chains[1].values)).toEqual([
      { trophyId: 1, actionType: 'foul', consequenceType: null },
      { trophyId: 1, actionType: null, consequenceType: 'casualty' },
    ]);
  });

  it('writes nothing beyond the read when the stored curation already matches', async () => {
    const { db, chains } = mockDb([
      { id: 5, actionType: 'foul', consequenceType: null, removed: false },
    ]);

    await service.sync(db, 1, {
      ...computed,
      awardRuleMatchEventTypes: [{ actionType: 'foul' }],
    });

    expect(chains).toHaveLength(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('flags a stored type the curation no longer lists as removed, never deleting it', async () => {
    const { db, chains } = mockDb([
      { id: 5, actionType: 'foul', consequenceType: null, removed: false },
      { id: 6, actionType: null, consequenceType: 'casualty', removed: false },
    ]);

    await service.sync(db, 1, {
      ...computed,
      awardRuleMatchEventTypes: [{ actionType: 'foul' }],
    });

    expect(chains).toHaveLength(2);
    expect(db.update).toHaveBeenCalledWith(trophyAwardRuleMatchEventTypes);
    expect(firstCallArg(chains[1].set)).toEqual({ removed: true });
    expect(extractAllFilterValues(firstCallArg(chains[1].where))).toEqual([6]);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('revives a removed type the curation lists again instead of inserting a duplicate', async () => {
    const { db, chains } = mockDb([
      { id: 6, actionType: null, consequenceType: 'casualty', removed: true },
    ]);

    await service.sync(db, 1, {
      ...computed,
      awardRuleMatchEventTypes: [{ consequenceType: 'casualty' }],
    });

    expect(chains).toHaveLength(2);
    expect(firstCallArg(chains[1].set)).toEqual({ removed: false });
    expect(extractAllFilterValues(firstCallArg(chains[1].where))).toEqual([6]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('syncs the excluded event types in their own table', async () => {
    const { db, chains } = mockDb([]);

    await service.sync(db, 1, {
      ...computed,
      awardRuleExcludedMatchEventTypes: [{ actionType: 'mvp_award' }],
    });

    expect(chains).toHaveLength(2);
    expect(db.insert).toHaveBeenCalledWith(
      trophyAwardRuleExcludedMatchEventTypes,
    );
    expect(firstCallArg(chains[1].values)).toEqual([
      { trophyId: 1, actionType: 'mvp_award', consequenceType: null },
    ]);
  });

  it('revives a removed excluded type and flags a dropped one in the excluded table', async () => {
    const { db, chains } = mockDb(
      [
        {
          id: 3,
          actionType: 'mvp_award',
          consequenceType: null,
          removed: true,
        },
        { id: 4, actionType: 'foul', consequenceType: null, removed: false },
      ],
      [],
      [],
    );

    await service.sync(db, 1, {
      ...computed,
      awardRuleExcludedMatchEventTypes: [{ actionType: 'mvp_award' }],
    });

    // 0 read, 1 revival, 2 removal.
    expect(chains).toHaveLength(3);
    expect(db.update).toHaveBeenCalledWith(
      trophyAwardRuleExcludedMatchEventTypes,
    );
    expect(firstCallArg(chains[1].set)).toEqual({ removed: false });
    expect(extractAllFilterValues(firstCallArg(chains[1].where))).toEqual([3]);
    expect(firstCallArg(chains[2].set)).toEqual({ removed: true });
    expect(extractAllFilterValues(firstCallArg(chains[2].where))).toEqual([4]);
  });

  it('inserts a duplicated curated entry only once', async () => {
    const { db, chains } = mockDb([]);

    await service.sync(db, 1, {
      ...computed,
      awardRuleMatchEventTypes: [
        { actionType: 'foul' },
        { actionType: 'foul' },
      ],
    });

    expect(chains).toHaveLength(2);
    expect(firstCallArg(chains[1].values)).toEqual([
      { trophyId: 1, actionType: 'foul', consequenceType: null },
    ]);
  });

  it('syncs eligible positions by their Name external id', async () => {
    const { db, chains } = mockDb([
      {
        id: 8,
        positionNameExternalId: 'Ogre: Gnoblar Lineman',
        removed: false,
      },
    ]);

    await service.sync(db, 1, {
      ...computed,
      awardRuleEligiblePositions: ['Ogre: Ogre Blocker'],
    });

    // 0 read, 1 insert of the new id, 2 removal of the dropped one.
    expect(chains).toHaveLength(3);
    expect(db.insert).toHaveBeenCalledWith(trophyAwardRuleEligiblePositions);
    expect(firstCallArg(chains[1].values)).toEqual([
      { trophyId: 1, positionNameExternalId: 'Ogre: Ogre Blocker' },
    ]);
    expect(firstCallArg(chains[2].set)).toEqual({ removed: true });
    expect(extractAllFilterValues(firstCallArg(chains[2].where))).toEqual([8]);
  });

  it('leaves every table alone when a computed kind omits its arrays', async () => {
    const { db, chains } = mockDb();

    await service.sync(db, 1, computed);

    expect(chains).toHaveLength(0);
  });

  it('leaves every table alone when the upsert states no award rule kind', async () => {
    const { db, chains } = mockDb();

    await service.sync(db, 1, {
      externalIds: [{ externalSystemId: 1, externalId: 'Top Fouler' }],
    });

    expect(chains).toHaveLength(0);
  });

  it('flags every stored rule row removed when the trophy becomes non-computed, discarding supplied rows', async () => {
    // 0 included read, 1 its removal, 2 excluded read (nothing stored),
    // 3 eligible read, 4 its removal.
    const { db, chains } = mockDb(
      [{ id: 1, actionType: 'foul', consequenceType: null, removed: false }],
      [],
      [],
      [{ id: 2, positionNameExternalId: 'Ogre: Ogre Blocker', removed: false }],
      [],
    );

    await service.sync(db, 1, {
      ...computed,
      awardRuleKind: 'manual',
      awardProcedure: 'Rolled by hand.',
      awardRuleMatchEventTypes: [{ actionType: 'touchdown' }],
    });

    expect(chains).toHaveLength(5);
    expect(db.insert).not.toHaveBeenCalled();
    expect(firstCallArg(chains[1].set)).toEqual({ removed: true });
    expect(firstCallArg(chains[4].set)).toEqual({ removed: true });
  });
});
