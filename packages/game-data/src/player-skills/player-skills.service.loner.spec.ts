import { firstCallArg, mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { describe, expect, it } from 'vitest';

import { makeService } from './player-skills.test-helpers';

const playerRow = { id: 1 };
const entry = { playerId: 1, skillId: 7, source: 'starting' as const };

describe('PlayerSkillsService and a gained Loner', () => {
  it('stores a gained Loner as a free extra although the source does not flag it', async () => {
    const db = mockDb(
      [playerRow],
      [{ id: 7, name: 'Loner' }],
      [],
      [{ id: 51, playerId: 1, skillId: 7, attributeValue: '4+' }],
    );
    const service = await makeService(db);

    await service.sync({
      entries: [
        {
          ...entry,
          source: 'advancement',
          attributeValue: '4+',
          advancementOrder: 1,
        },
      ],
    });

    expect(firstCallArg(db.chains[3].values)).toEqual([
      expect.objectContaining({ attributeValue: '4+', isFreeExtra: true }),
    ]);
  });

  it('leaves a starting Loner unmarked', async () => {
    const db = mockDb(
      [playerRow],
      [{ id: 7, name: 'Loner' }],
      [],
      [{ id: 51, playerId: 1, skillId: 7, attributeValue: '4+' }],
    );
    const service = await makeService(db);

    await service.sync({ entries: [{ ...entry, attributeValue: '4+' }] });

    expect(firstCallArg(db.chains[3].values)).toEqual([
      expect.not.objectContaining({ isFreeExtra: true }),
    ]);
  });

  it('never marks Loner for a trophy award', async () => {
    const db = mockDb([{ name: 'Loner' }]);
    const service = await makeService(db);

    await service.markTrophyGranted(1, 7);

    expect(db.db.update).not.toHaveBeenCalled();
  });

  it('never unmarks Loner', async () => {
    const db = mockDb([{ name: 'Loner' }]);
    const service = await makeService(db);

    await service.unmarkTrophyGranted(1, 7);

    expect(db.db.update).not.toHaveBeenCalled();
  });
});
