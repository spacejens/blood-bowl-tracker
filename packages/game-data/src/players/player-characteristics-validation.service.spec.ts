import { DB, rulesSets } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicFormatValidationService } from '../shared/characteristic-format-validation.service';
import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { PlayerCharacteristicsValidationService } from './player-characteristics-validation.service';

const externalIds = [{ externalSystemId: 1, externalId: 'pid-7' }];

/** A full, internally consistent BB2020-style characteristic line. */
const fullLine = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
  rulesSetId: 20,
};

const bb2020Formats = {
  moveFormat: 'bare' as const,
  strengthFormat: 'bare' as const,
  agilityFormat: 'plus' as const,
  passingFormat: 'plus' as const,
  armourFormat: 'plus' as const,
};

describe('PlayerCharacteristicsValidationService', () => {
  let service: PlayerCharacteristicsValidationService;

  async function build(...rowsPerQuery: unknown[][]): Promise<MockDbResult> {
    const dbMock = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerCharacteristicsValidationService,
        // Pure and dependency-free (CLAUDE.md's decision-service carve-out):
        // passed real so the real format rules are exercised, exactly as
        // PlayersService's own spec already does.
        CharacteristicFormatValidationService,
        { provide: DB, useValue: dbMock.db },
      ],
    }).compile();
    service = moduleRef.get(PlayerCharacteristicsValidationService);
    return dbMock;
  }

  beforeEach(() => {
    service = undefined as unknown as PlayerCharacteristicsValidationService;
  });

  it('does nothing, and issues no query, when no characteristics are supplied', async () => {
    const dbMock = await build();

    await expect(service.validate({ externalIds })).resolves.toBeUndefined();

    expect(dbMock.chains).toHaveLength(0);
  });

  it('looks the formats up by the supplied rules set id and accepts a valid line', async () => {
    const dbMock = await build([bb2020Formats]);

    await expect(
      service.validate({ ...fullLine, externalIds }),
    ).resolves.toBeUndefined();

    expect(dbMock.chains).toHaveLength(1);
    expect(extractFilterValues(firstCallArg(dbMock.chains[0].where))).toBe(20);
    expect(Object.keys(firstCallArg(dbMock.db.select, 0, 0) as object)).toEqual(
      expect.arrayContaining([
        'moveFormat',
        'strengthFormat',
        'agilityFormat',
        'passingFormat',
        'armourFormat',
      ]),
    );
  });

  it('rejects a partial characteristic line, naming the player by external id', async () => {
    await build();

    await expect(
      service.validate({ move: 6, strength: 3, externalIds }),
    ).rejects.toThrow(/all-or-nothing.*player 1:pid-7/s);
  });

  it('rejects a complete line with no rules set to validate it against', async () => {
    await build();

    const { rulesSetId: _ignored, ...withoutRulesSet } = fullLine;

    await expect(
      service.validate({ ...withoutRulesSet, externalIds }),
    ).rejects.toThrow(/without a rules set to validate them against/);
  });

  it('rejects a rules set supplied without any characteristics', async () => {
    await build();

    await expect(
      service.validate({ rulesSetId: 20, externalIds }),
    ).rejects.toThrow(/without a complete set of characteristics/);
  });

  it('treats an explicit null passing as supplied', async () => {
    const dbMock = await build([{ ...bb2020Formats, passingFormat: 'absent' }]);

    await expect(
      service.validate({ ...fullLine, passing: null, externalIds }),
    ).resolves.toBeUndefined();

    expect(dbMock.chains).toHaveLength(1);
  });

  it('reads the formats off the rules_sets table', async () => {
    const dbMock = await build([bb2020Formats]);

    await service.validate({ ...fullLine, externalIds });

    expect(dbMock.chains[0].from).toHaveBeenCalledWith(rulesSets);
  });
});
