import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { CharacteristicFormatMismatchError } from '../shared/characteristic-format-mismatch-error';
import { CharacteristicFormatValidationService } from '../shared/characteristic-format-validation.service';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { PositionRulesSetsService } from './position-rules-sets.service';

async function makeService(
  db: MockDbResult,
): Promise<PositionRulesSetsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionRulesSetsService,
      // Pure, dependency-free decision service: passed real so these tests
      // keep asserting the actual format rule (see CLAUDE.md, "Testing
      // services").
      CharacteristicFormatValidationService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return moduleRef.get(PositionRulesSetsService);
}

/** A modern rules set: Agility, Passing and Armour are all target numbers. */
const bb2020Formats = {
  id: 4,
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
};

/** An older rules set: no Passing characteristic at all. */
const crpFormats = {
  id: 5,
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'bare',
  passingFormat: 'absent',
  armourFormat: 'bare',
};

const bb2020Entry = {
  positionId: 3,
  rulesSetId: 4,
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};

const crpEntry = {
  positionId: 3,
  rulesSetId: 5,
  move: 6,
  strength: 3,
  agility: 3,
  passing: null,
  armour: 8,
};

describe('PositionRulesSetsService', () => {
  describe('sync', () => {
    it('returns no ids and issues no query for an empty entries list', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const result = await service.sync({ entries: [] });

      expect(result).toEqual({ positionRulesSetIds: [] });
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('inserts a row whose characteristics match the declared formats', async () => {
      // Query 0: the rules-set format lookup. Query 1: the existing-rows
      // lookup (nothing there). Query 2: the insert.
      const db = mockDb([bb2020Formats], [], [{ id: 21 }]);
      const service = await makeService(db);

      const result = await service.sync({ entries: [bb2020Entry] });

      expect(result).toEqual({ positionRulesSetIds: [21] });
      expect(firstCallArg(db.chains[2].values)).toEqual([
        {
          positionId: 3,
          rulesSetId: 4,
          move: 6,
          strength: 3,
          agility: 3,
          passing: 4,
          armour: 9,
        },
      ]);
      expect(db.transaction).toHaveBeenCalled();
    });

    it('inserts a null passing for a rules set with no Passing characteristic', async () => {
      const db = mockDb([crpFormats], [], [{ id: 22 }]);
      const service = await makeService(db);

      const result = await service.sync({ entries: [crpEntry] });

      expect(result).toEqual({ positionRulesSetIds: [22] });
      expect(firstCallArg(db.chains[2].values)).toEqual([
        {
          positionId: 3,
          rulesSetId: 5,
          move: 6,
          strength: 3,
          agility: 3,
          passing: null,
          armour: 8,
        },
      ]);
    });

    it('rejects a characteristic the rules set declares absent', async () => {
      const db = mockDb([crpFormats]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [{ ...crpEntry, passing: 4 }] }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('names the offending characteristic in the rejection', async () => {
      const db = mockDb([crpFormats]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [{ ...crpEntry, passing: 4 }] }),
      ).rejects.toThrow(/Passing/);
    });

    it('rejects a characteristic the rules set requires but the entry omits', async () => {
      const db = mockDb([bb2020Formats]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [{ ...bb2020Entry, passing: null }] }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects an entry naming a rules set that does not exist', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [bb2020Entry] }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
    });

    it('rejects a batch with the same (positionId, rulesSetId) pair twice', async () => {
      // Query 0: the rules-set format lookup — the only query issued, since
      // the duplicate is caught before the existing-rows lookup ever runs.
      const db = mockDb([bb2020Formats]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [bb2020Entry, bb2020Entry] }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
      expect(db.chains).toHaveLength(1);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('validates the whole batch before any write, even when the bad entry is last', async () => {
      // Query 0: the rules-set format lookup for both rules sets in one
      // query. No further queries: the first entry passes validation, but
      // the second (last) fails, so the existing-rows lookup never runs.
      const db = mockDb([bb2020Formats, crpFormats]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [bb2020Entry, { ...crpEntry, passing: 4 }] }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
      expect(db.chains).toHaveLength(1);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('handles a batch mixing an insert and an update', async () => {
      // Query 0: formats. Query 1: the existing-rows lookup finds only the
      // position-3 pair. Query 2: the INSERT for the new position-7 pair.
      // Query 3: the UPDATE for the existing position-3 pair.
      const newPositionEntry = { ...bb2020Entry, positionId: 7 };
      const db = mockDb(
        [bb2020Formats],
        [{ id: 21, positionId: 3, rulesSetId: 4 }],
        [{ id: 30 }],
        [{ id: 21 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [{ ...bb2020Entry, move: 7 }, newPositionEntry],
      });

      expect(result).toEqual({ positionRulesSetIds: [30, 21] });
      expect(firstCallArg(db.chains[2].values)).toEqual([
        {
          positionId: 7,
          rulesSetId: 4,
          move: 6,
          strength: 3,
          agility: 3,
          passing: 4,
          armour: 9,
        },
      ]);
      expect(firstCallArg(db.chains[3].set)).toEqual({
        move: 7,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
      });
    });

    it('updates the existing row for a re-synced pair instead of duplicating it', async () => {
      // Query 0: formats. Query 1: the existing-rows lookup finds the pair.
      // Query 2: the UPDATE — and nothing else, which is what proves no
      // second row was inserted for the same pair.
      const db = mockDb(
        [bb2020Formats],
        [{ id: 21, positionId: 3, rulesSetId: 4 }],
        [{ id: 21 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [{ ...bb2020Entry, move: 7 }],
      });

      expect(result).toEqual({ positionRulesSetIds: [21] });
      expect(db.chains).toHaveLength(3);
      expect(firstCallArg(db.chains[2].set)).toEqual({
        move: 7,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
      });
    });
  });

  describe('listByPosition', () => {
    const row = {
      rulesSetId: 3,
      rulesSetName: 'BB2020',
      moveFormat: 'bare',
      move: 7,
      strengthFormat: 'bare',
      strength: 3,
      agilityFormat: 'plus',
      agility: 3,
      passingFormat: 'plus',
      passing: 4,
      armourFormat: 'plus',
      armour: 9,
    };

    it('returns one row per rules set the position has characteristics for', async () => {
      const db = mockDb([row]);
      const service = await makeService(db);

      await expect(service.listByPosition(1)).resolves.toEqual([row]);
      // extractFilterValues returns the bare literal for a single eq()
      // filter, not a single-element array — matches the established
      // convention across this package's specs (e.g. players.service.spec.ts,
      // coaches.service.spec.ts), which all assert `.toBe(<value>)` here.
      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(1);
    });

    it('returns an empty array when the position has no characteristics rows', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await expect(service.listByPosition(1)).resolves.toEqual([]);
    });

    it('orders rules sets chronologically by their earliest era, then by name', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await service.listByPosition(1);

      // sqlText only renders literal StringChunks, not the bare Column node
      // inside min(...), so it surfaces the aggregate call itself ("min(...
      // asc") rather than the column name; extractJoinColumns is what recovers
      // which column the aggregate is over. Together these two assertions
      // verify the same behavior the brief's original single sqlText
      // assertion intended: ordering by the earliest (min) era start date.
      expect(sqlText(firstCallArg(db.chains[0].orderBy, 0, 0))).toContain(
        'min(',
      );
      expect(
        extractJoinColumns(firstCallArg(db.chains[0].orderBy, 0, 0)),
      ).toEqual(['eras.start_date']);
      expect(
        extractJoinColumns(firstCallArg(db.chains[0].orderBy, 0, 1)),
      ).toEqual(['rules_sets.name']);
    });
  });

  describe('findCharacteristicsContext', () => {
    /**
     * One resolved row as the query returns it: the rules set's five formats
     * plus the left-joined position baseline. `baselineRulesSetId` is the
     * left join's presence flag — null when this era rules set has no
     * `position_rules_sets` row for the position.
     */
    const resolvedRow = {
      moveFormat: 'bare',
      strengthFormat: 'bare',
      agilityFormat: 'plus',
      passingFormat: 'plus',
      armourFormat: 'plus',
      baselineRulesSetId: 90,
      baselineMove: 6,
      baselineStrength: 3,
      baselineAgility: 3,
      baselinePassing: 4,
      baselineArmour: 9,
    };

    it('returns the formats and the baseline of the matched rules set', async () => {
      const db = mockDb([resolvedRow]);
      const service = await makeService(db);

      await expect(service.findCharacteristicsContext(3, 7)).resolves.toEqual({
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'plus',
        armourFormat: 'plus',
        baseline: {
          move: 6,
          strength: 3,
          agility: 3,
          passing: 4,
          armour: 9,
        },
      });
    });

    it('filters on the era and the position, and takes a single row', async () => {
      const db = mockDb([resolvedRow]);
      const service = await makeService(db);

      await service.findCharacteristicsContext(3, 7);

      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(7);
      expect(
        extractAllFilterValues(firstCallArg(db.chains[0].leftJoin, 0, 1)),
      ).toContain(3);
      expect(firstCallArg(db.chains[0].limit)).toBe(1);
    });

    it('prefers a position match over a higher-id era rules set without one', async () => {
      // The ordering is what implements the preference, so assert on it: rows
      // with a position match sort first, then the highest era_rules_sets.id.
      const db = mockDb([resolvedRow]);
      const service = await makeService(db);

      await service.findCharacteristicsContext(3, 7);

      expect(sqlText(firstCallArg(db.chains[0].orderBy, 0, 0))).toContain(
        'is null',
      );
      expect(
        extractJoinColumns(firstCallArg(db.chains[0].orderBy, 0, 1)),
      ).toEqual(['era_rules_sets.id']);
    });

    it('returns the formats with no baseline when no era rules set covers the position', async () => {
      const db = mockDb([
        {
          ...resolvedRow,
          baselineRulesSetId: null,
          baselineMove: null,
          baselineStrength: null,
          baselineAgility: null,
          baselinePassing: null,
          baselineArmour: null,
        },
      ]);
      const service = await makeService(db);

      await expect(service.findCharacteristicsContext(3, 7)).resolves.toEqual({
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'plus',
        armourFormat: 'plus',
        baseline: undefined,
      });
    });

    it('keeps a null baseline passing for a rules set with no Passing characteristic', async () => {
      const db = mockDb([
        {
          ...resolvedRow,
          agilityFormat: 'bare',
          passingFormat: 'absent',
          armourFormat: 'bare',
          baselinePassing: null,
          baselineArmour: 8,
        },
      ]);
      const service = await makeService(db);

      await expect(service.findCharacteristicsContext(3, 7)).resolves.toEqual({
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'bare',
        passingFormat: 'absent',
        armourFormat: 'bare',
        baseline: {
          move: 6,
          strength: 3,
          agility: 3,
          passing: null,
          armour: 8,
        },
      });
    });

    it('returns undefined when the era lists no rules sets at all', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await expect(
        service.findCharacteristicsContext(3, 7),
      ).resolves.toBeUndefined();
    });
  });
});
