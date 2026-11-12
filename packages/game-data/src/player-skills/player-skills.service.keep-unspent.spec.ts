import { players } from '@blood-bowl-tracker/db';
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

describe('PlayerSkillsService.sync and the stored unspent SPP', () => {
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

  it('clears it for a changed player by default', async () => {
    const db = mockDb(
      [{ id: 1, grantedSkillId: null }],
      [{ id: 7, name: 'Block' }],
      [storedRow],
    );
    const service = await makeService(db);

    await service.sync(confirm);

    expect(db.db.update).toHaveBeenCalledWith(players);
  });

  it('keeps it when asked to', async () => {
    const db = mockDb(
      [{ id: 1, grantedSkillId: null }],
      [{ id: 7, name: 'Block' }],
      [storedRow],
    );
    const service = await makeService(db);

    await service.sync(confirm, { keepUnspentSpp: true });

    expect(db.db.update).not.toHaveBeenCalledWith(players);
  });
});
