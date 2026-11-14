import type { DbOrTx } from '@blood-bowl-tracker/db';
import { playerAdvancements } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { describe, expect, it } from 'vitest';

import { makeService } from './player-skills.test-helpers';

const storedRow = {
  id: 51,
  playerId: 1,
  skillId: 7,
  characteristic: null,
  source: 'chosen',
  attributeValue: null,
  advancementOrder: 2,
  orderConfirmed: false,
  isFreeExtra: false,
  removed: false,
};

const confirm = {
  entries: [
    {
      playerId: 1,
      skillId: 7,
      source: 'advancement' as const,
      advancementOrder: 1,
      orderConfirmed: true,
    },
  ],
};

describe("PlayerSkillsService.sync inside a caller's transaction", () => {
  it('writes on the given transaction and opens none of its own', async () => {
    const db = mockDb(
      [{ id: 1, grantedSkillId: null }],
      [{ id: 7, name: 'Block' }],
      [storedRow],
    );
    const tx = mockDb();
    const service = await makeService(db);

    const result = await service.sync(confirm, {
      keepUnspentSpp: true,
      tx: tx.db as DbOrTx,
    });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.db.update).not.toHaveBeenCalled();
    expect(tx.db.update).toHaveBeenCalledWith(playerAdvancements);
    expect(result).toEqual({ playerSkillIds: [51] });
  });

  it('opens its own transaction without one', async () => {
    const db = mockDb(
      [{ id: 1, grantedSkillId: null }],
      [{ id: 7, name: 'Block' }],
      [storedRow],
    );
    const service = await makeService(db);

    await service.sync(confirm, { keepUnspentSpp: true });

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});
