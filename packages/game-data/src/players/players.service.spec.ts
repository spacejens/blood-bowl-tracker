import { DB, players } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { JourneymanLonerService } from '../player-skills/journeyman-loner.service';
import { CharacteristicFormatMismatchError } from '../shared/characteristic-format-mismatch-error';
import { LastingInjuryValidationError } from '../shared/lasting-injury-validation-error';
import { PlayerCharacteristicsValidationService } from './player-characteristics-validation.service';
import { PlayerLastingInjuryValidationService } from './player-lasting-injury-validation.service';
import { PlayersService, PlayerUpsertConflictError } from './players.service';

const fakePlayer = {
  id: 1,
  name: 'Griff Oberwald',
  teamEraId: 10,
  positionId: 20,
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
  missNextGame: false,
  nigglingInjuryCount: 0,
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
  createdAt: new Date('2026-01-01'),
};

describe('PlayersService', () => {
  let service: PlayersService;
  let characteristicsValidation: MockProxy<PlayerCharacteristicsValidationService>;
  let journeymen: MockProxy<JourneymanLonerService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<MockDbResult> {
    const dbMock = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayersService,
        // PlayerCharacteristicsValidationService has a real @Inject(DB) and
        // performs its own query, so it is mocked like any other I/O-bearing
        // collaborator — CLAUDE.md's pure-decision-service carve-out does not
        // extend to it.
        {
          provide: PlayerCharacteristicsValidationService,
          useValue: characteristicsValidation,
        },
        // Pure and dependency-free (CLAUDE.md's decision-service carve-out):
        // no constructor, no I/O — passed real rather than mocked.
        PlayerLastingInjuryValidationService,
        { provide: JourneymanLonerService, useValue: journeymen },
        { provide: DB, useValue: dbMock.db },
      ],
    }).compile();
    service = moduleRef.get(PlayersService);
    return dbMock;
  }

  beforeEach(() => {
    characteristicsValidation = mock<PlayerCharacteristicsValidationService>();
    journeymen = mock<JourneymanLonerService>();
  });

  describe('upsert', () => {
    const base = { name: 'Griff Oberwald', teamEraId: 10, positionId: 20 };
    const externalIds = [
      { externalSystemId: 1, externalId: '12345' },
      { externalSystemId: 2, externalId: 'Griff Oberwald' },
    ];

    it('creates a new player when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: both external IDs are new, so they get
      // inserted.
      const { db, chains } = await build([], [fakePlayer]);

      const result = await service.upsert({ ...base, externalIds });

      expect(result).toEqual({ player: fakePlayer, created: true });
      expect(chains).toHaveLength(3);
      expect(db.insert).toHaveBeenCalledWith(players);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('updates the matching player when exactly one external ID matches', async () => {
      // query 0: external-id lookup finds one owner; query 1: the update
      // returns the row; query 2: the one still-missing external ID gets
      // inserted.
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [fakePlayer],
      );

      const result = await service.upsert({ ...base, externalIds });

      expect(result).toEqual({ player: fakePlayer, created: false });
      expect(chains).toHaveLength(3);
      expect(db.update).toHaveBeenCalledWith(players);
    });

    it('throws PlayerUpsertConflictError when external IDs match different players', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: '12345' },
        { ownerId: 2, externalSystemId: 2, externalId: 'Griff Oberwald' },
      ]);

      await expect(service.upsert({ ...base, externalIds })).rejects.toThrow(
        PlayerUpsertConflictError,
      );
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched player', async () => {
      // Both external IDs already resolve to the same owner, so no join-table
      // insert is issued: only the lookup and the update run.
      const { db, chains } = await build(
        [
          { ownerId: 1, externalSystemId: 1, externalId: '12345' },
          { ownerId: 1, externalSystemId: 2, externalId: 'Griff Oberwald' },
        ],
        [fakePlayer],
      );

      await service.upsert({ ...base, externalIds });

      expect(chains).toHaveLength(2);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing player', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [fakePlayer],
      );

      await service.upsert({ ...base, externalIds });

      expect(chains).toHaveLength(3);
      expect(firstCallArg(chains[2].values)).toEqual([
        { playerId: 1, externalSystemId: 2, externalId: 'Griff Oberwald' },
      ]);
    });

    it('updates only the supplied column, leaving teamEraId and positionId alone', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [fakePlayer],
      );

      await service.upsert({
        name: 'Griff Oberwald II',
        externalIds: [{ externalSystemId: 1, externalId: '12345' }],
      });

      expect(firstCallArg(chains[1].set)).toEqual({
        name: 'Griff Oberwald II',
        unspentSpp: null,
      });
    });

    it('clears the stored unspent SPP on insert', async () => {
      const { chains } = await build([], [fakePlayer]);
      await service.upsert({ ...base, externalIds });
      expect(firstCallArg(chains[1].values)).toMatchObject({
        unspentSpp: null,
      });
    });

    it('clears the stored unspent SPP on update', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [fakePlayer],
      );
      await service.upsert({ ...base, externalIds });
      expect(firstCallArg(chains[1].set)).toMatchObject({ unspentSpp: null });
    });

    it('writes sppTotal through to the entity columns', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, sppTotal: 176, externalIds });

      // chains[1] is the insert; its .values() carries the entity columns.
      expect(firstCallArg(chains[1].values)).toMatchObject({ sppTotal: 176 });
    });

    it('leaves sppTotal undefined in the columns when the caller omits it', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, externalIds });

      expect(
        (firstCallArg(chains[1].values) as { sppTotal?: number }).sppTotal,
      ).toBeUndefined();
    });

    it('writes a null sppTotal through to the inserted columns', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, sppTotal: null, externalIds });

      // chains[1] is the insert; null survives the undefined-key stripping.
      expect(firstCallArg(chains[1].values)).toMatchObject({ sppTotal: null });
    });

    it('writes a null sppTotal through to the updated columns', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [fakePlayer],
      );

      await service.upsert({
        name: 'Griff Oberwald',
        sppTotal: null,
        externalIds: [{ externalSystemId: 1, externalId: '12345' }],
      });

      expect(firstCallArg(chains[1].set)).toEqual({
        name: 'Griff Oberwald',
        sppTotal: null,
        unspentSpp: null,
      });
    });

    it('writes status through to the entity columns', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, status: 'retired', externalIds });

      // chains[1] is the insert; its .values() carries the entity columns.
      expect(firstCallArg(chains[1].values)).toMatchObject({
        status: 'retired',
      });
    });

    it('leaves status undefined in the columns when the caller omits it', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, externalIds });

      expect(
        (firstCallArg(chains[1].values) as { status?: string }).status,
      ).toBeUndefined();
    });

    it('writes the journeyman marker when the payload states it', async () => {
      const { chains } = await build(
        [],
        [{ ...fakePlayer, isJourneyman: true }],
      );

      await service.upsert({ ...base, isJourneyman: true, externalIds });

      expect(firstCallArg(chains[1].values)).toMatchObject({
        isJourneyman: true,
      });
    });

    it('writes an explicit false journeyman marker', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, isJourneyman: false, externalIds });

      expect(firstCallArg(chains[1].values)).toMatchObject({
        isJourneyman: false,
      });
    });

    it('leaves the marker alone when the payload omits it', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, externalIds });

      expect(firstCallArg(chains[1].values)).not.toHaveProperty('isJourneyman');
    });

    it('ensures the starting Loner when the player is a journeyman after the write', async () => {
      await build([], [{ ...fakePlayer, isJourneyman: true }]);

      await service.upsert({ ...base, isJourneyman: true, externalIds });

      expect(journeymen.ensureStartingLoner).toHaveBeenCalledWith(1);
      expect(journeymen.retireStartingLoner).not.toHaveBeenCalled();
    });

    it('ensures it when the payload omits the marker but the stored row has it', async () => {
      await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [{ ...fakePlayer, isJourneyman: true }],
      );

      await service.upsert({ ...base, externalIds });

      expect(journeymen.ensureStartingLoner).toHaveBeenCalledWith(1);
    });

    it('retires a journeyman starting Loner whenever the written row is not a journeyman', async () => {
      await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [{ ...fakePlayer, isJourneyman: false }],
      );

      await service.upsert({ ...base, isJourneyman: false, externalIds });

      expect(journeymen.retireStartingLoner).toHaveBeenCalledWith(1);
      expect(journeymen.ensureStartingLoner).not.toHaveBeenCalled();
    });

    it('retires it also when the payload omits the marker', async () => {
      await build([], [fakePlayer]);

      await service.upsert({ ...base, externalIds });

      expect(journeymen.retireStartingLoner).toHaveBeenCalledWith(1);
    });

    it('reads no stored marker before the write', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, isJourneyman: false, externalIds });

      // The same three queries as the plain create case: lookup, insert,
      // external ids.
      expect(chains).toHaveLength(3);
    });

    it('writes a null status through to the updated columns', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [fakePlayer],
      );

      await service.upsert({
        name: 'Griff Oberwald',
        status: null,
        externalIds: [{ externalSystemId: 1, externalId: '12345' }],
      });

      expect(firstCallArg(chains[1].set)).toEqual({
        name: 'Griff Oberwald',
        status: null,
        unspentSpp: null,
      });
    });

    const characteristics = {
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
    };

    it('writes the five characteristics after validation passes', async () => {
      // Query 0: the external-id lookup finds nothing. Query 1: the insert.
      // Characteristics validation is mocked, so it issues no query of its
      // own here — that lookup is covered by
      // PlayerCharacteristicsValidationService's own spec.
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({
        ...base,
        ...characteristics,
        rulesSetId: 4,
        externalIds,
      });

      expect(characteristicsValidation.validate).toHaveBeenCalledWith(
        expect.objectContaining({ rulesSetId: 4 }),
      );
      expect(firstCallArg(chains[1].values)).toMatchObject(characteristics);
    });

    it('writes a null passing after validation passes', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({
        ...base,
        ...characteristics,
        passing: null,
        armour: 8,
        rulesSetId: 5,
        externalIds,
      });

      expect(firstCallArg(chains[1].values)).toMatchObject({ passing: null });
    });

    it('leaves the characteristic columns untouched when the caller omits them', async () => {
      // With no characteristics in the payload there is no rules-set format
      // lookup: query 0 is the external-id lookup, query 1 the upsert, query
      // 2 the external ids.
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, externalIds });

      expect(chains).toHaveLength(3);
      const values = firstCallArg(chains[1].values) as Record<string, unknown>;
      expect(values.move).toBeUndefined();
      expect(values.passing).toBeUndefined();
    });

    // The following tests exercise PlayersService.upsert's propagation of a
    // characteristics-validation rejection, not the validation logic itself
    // (which is PlayerCharacteristicsValidationService's own spec's job, and
    // it is mocked here rather than passed real). Each configures the
    // mock to reject the way the real service would for an equivalent input,
    // and asserts upsert both rejects with it and writes nothing.

    it('rejects a Passing value the rules set declares absent, writing nothing', async () => {
      const { transaction, chains } = await build();
      characteristicsValidation.validate.mockRejectedValueOnce(
        new CharacteristicFormatMismatchError(
          'Rules set 5 declares no Passing characteristic for player 1:12345, but a Passing value was supplied',
        ),
      );

      await expect(
        service.upsert({
          ...base,
          ...characteristics,
          rulesSetId: 5,
          externalIds,
        }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
      expect(chains).toHaveLength(0);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects a missing characteristic the rules set requires, writing nothing', async () => {
      const { transaction, chains } = await build();
      characteristicsValidation.validate.mockRejectedValueOnce(
        new CharacteristicFormatMismatchError(
          'Rules set 4 requires a Passing characteristic for player 1:12345, but none was supplied',
        ),
      );

      await expect(
        service.upsert({
          ...base,
          ...characteristics,
          passing: null,
          rulesSetId: 4,
          externalIds,
        }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
      expect(chains).toHaveLength(0);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects an unknown rulesSetId, writing nothing', async () => {
      const { transaction, chains } = await build();
      characteristicsValidation.validate.mockRejectedValueOnce(
        new CharacteristicFormatMismatchError('Rules set 99 does not exist'),
      );

      await expect(
        service.upsert({
          ...base,
          ...characteristics,
          rulesSetId: 99,
          externalIds,
        }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
      expect(chains).toHaveLength(0);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('propagates the offending player named in the rejection', async () => {
      await build();
      characteristicsValidation.validate.mockRejectedValueOnce(
        new CharacteristicFormatMismatchError(
          'Rules set 5 declares no Passing characteristic for player 1:12345, but a Passing value was supplied',
        ),
      );

      await expect(
        service.upsert({
          ...base,
          ...characteristics,
          rulesSetId: 5,
          externalIds,
        }),
      ).rejects.toThrow(/player 1:12345/);
    });

    it('rejects a rulesSetId supplied without a complete characteristic line', async () => {
      const { transaction } = await build();
      characteristicsValidation.validate.mockRejectedValueOnce(
        new CharacteristicFormatMismatchError(
          'Rules set 4 was supplied for player 1:12345 without a complete set of characteristics',
        ),
      );

      await expect(
        service.upsert({ ...base, rulesSetId: 4, externalIds }),
      ).rejects.toThrow(/without a complete set of characteristics/);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects characteristics supplied without a rulesSetId', async () => {
      const { transaction } = await build();
      characteristicsValidation.validate.mockRejectedValueOnce(
        new CharacteristicFormatMismatchError(
          'Characteristics were supplied for player 1:12345 without a rules set to validate them against',
        ),
      );

      await expect(
        service.upsert({ ...base, ...characteristics, externalIds }),
      ).rejects.toThrow(/without a rules set to validate/);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects a partial characteristic line supplied without a rulesSetId', async () => {
      const { transaction } = await build();
      characteristicsValidation.validate.mockRejectedValueOnce(
        new CharacteristicFormatMismatchError(
          'Characteristics are all-or-nothing: a partial characteristic line was supplied for player 1:12345',
        ),
      );

      await expect(
        service.upsert({ ...base, move: 6, externalIds }),
      ).rejects.toThrow(/all-or-nothing/);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects a partial lasting-injury line, writing nothing', async () => {
      // Exercises the real PlayerLastingInjuryValidationService (passed real
      // per the pure-decision-service carve-out): crafted invalid input
      // triggers its actual validation logic, rather than a mocked
      // rejection.
      const { transaction, chains } = await build();

      await expect(
        service.upsert({ ...base, missNextGame: true, externalIds }),
      ).rejects.toBeInstanceOf(LastingInjuryValidationError);
      expect(chains).toHaveLength(0);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('writes every supplied lasting-injury field', async () => {
      // Query 0: the external-id lookup, finding nothing. Query 1: the
      // insert. Query 2: the external ids. Characteristics validation is
      // mocked, so it issues no query of its own here.
      const { chains } = await build([], [fakePlayer], []);

      await service.upsert({
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
        rulesSetId: 20,
        missNextGame: true,
        nigglingInjuryCount: 2,
        moveReductionCount: 1,
        strengthReductionCount: 0,
        agilityReductionCount: 0,
        passingReductionCount: 0,
        armourReductionCount: 3,
        externalIds: [{ externalSystemId: 1, externalId: 'pid-7' }],
      });

      expect(firstCallArg(chains[1].values)).toMatchObject({
        missNextGame: true,
        nigglingInjuryCount: 2,
        moveReductionCount: 1,
        strengthReductionCount: 0,
        agilityReductionCount: 0,
        passingReductionCount: 0,
        armourReductionCount: 3,
      });
    });

    it('leaves the stored lasting-injury state untouched when the group is omitted', async () => {
      // Query 0: the external-id lookup (no characteristics supplied, so no
      // format lookup fires). Query 1: the insert. Query 2: the external ids.
      const { chains } = await build([], [fakePlayer], []);

      await service.upsert({
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        externalIds: [{ externalSystemId: 1, externalId: 'pid-7' }],
      });

      const values = firstCallArg(chains[1].values) as Record<string, unknown>;
      expect(values.missNextGame).toBeUndefined();
      expect(values.nigglingInjuryCount).toBeUndefined();
      expect(values.armourReductionCount).toBeUndefined();
    });
  });

  describe('retireAbsentExternalPlayers', () => {
    const options = {
      teamEraId: 10,
      externalSystemId: 5,
      presentExternalIds: ['101', '102'],
    };

    it('retires the era players absent from the given ids and returns how many', async () => {
      const { db, chains } = await build([{ id: 7 }, { id: 8 }]);
      await expect(service.retireAbsentExternalPlayers(options)).resolves.toBe(
        2,
      );
      expect(db.update).toHaveBeenCalledWith(players);
      expect(firstCallArg(chains[0].set)).toEqual({ status: 'retired' });
      const where = firstCallArg(chains[0].where);
      expect(extractAllFilterValues(where)).toEqual([
        10,
        'dead',
        5,
        5,
        '101',
        '102',
      ]);
      expect(extractJoinColumns(where)).toEqual([
        'players.team_era_id',
        'players.status',
        'players.status',
        'players.id',
        'players_external_ids.player_id',
        'players_external_ids.external_system_id',
        'players_external_ids.external_id',
        'players_external_ids.player_id',
        'players.id',
        'players_external_ids.external_system_id',
        'players_external_ids.external_id',
      ]);
      const text = sqlText(where).toLowerCase();
      expect(text).toContain('( is null)) or ( <> ))');
      expect(text).not.toContain('or ( = ))');
      expect(text).toContain('not exists');
      expect(text).toContain('~');
    });

    it('only considers numeric lineUps ids, never a star hire id', async () => {
      const { chains } = await build([]);
      await service.retireAbsentExternalPlayers(options);
      const where = firstCallArg(chains[0].where);
      expect(sqlText(where)).toContain(`( ~ '^[0-9]+$')`);
    });

    it('excludes no id when none are given', async () => {
      const { chains } = await build([]);
      await expect(
        service.retireAbsentExternalPlayers({
          ...options,
          presentExternalIds: [],
        }),
      ).resolves.toBe(0);
      const where = firstCallArg(chains[0].where);
      expect(extractAllFilterValues(where)).toEqual([10, 'dead', 5]);
      expect(sqlText(where).toLowerCase()).not.toContain('not exists');
    });
  });
});
