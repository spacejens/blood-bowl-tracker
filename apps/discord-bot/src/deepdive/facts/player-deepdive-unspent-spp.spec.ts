import type {
  KnownUnspentSpp,
  UnspentSppResult,
} from '@blood-bowl-tracker/game-data';
import { UnspentSppService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { mockDatabaseTimeout } from '../../database-timeout-mock.test-helpers';
import {
  griff,
  makePlayers,
  makeService,
  makeUnspentSpp,
} from './player-deepdive.test-helpers';

const covers: KnownUnspentSpp = {
  status: 'known',
  totalSpp: 12,
  advancementsGained: 1,
  spentMin: 6,
  spentMax: 6,
  unspentMin: 6,
  unspentMax: 6,
  cheapestNextCost: 6,
  coversAnother: 'yes',
};

/** Griff with a computed total, so the total section is shown. */
const withTotal = { ...griff, sppTotal: 12, sppAdjustment: null };

/**
 * The embed description of a resolved reply. Throws for a plain string reply
 * (a timeout or not-found message) rather than returning '', so a
 * `not.toContain(...)` assertion against it cannot pass vacuously.
 */
function descriptionOf(reply: string | InteractionReplyOptions): string {
  if (typeof reply === 'string') {
    throw new Error(`Expected an embed reply, got the plain string: ${reply}`);
  }
  return (
    (reply.embeds?.[0] as { description?: string } | undefined)?.description ??
    ''
  );
}

describe('PlayerDeepdiveService unspent SPP line', () => {
  it('shows the unspent line directly under the total', async () => {
    const { service, unspentSpp } = await makeService({
      players: makePlayers({
        player: withTotal,
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
      }),
      unspentSpp: makeUnspentSpp(covers),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).toBe(
      [
        'Team: Reikland Reavers',
        'Era: Season 5 (2020-01-01 – 2023-12-31)',
        'Race: Human',
        'Position: Blitzer',
        'Status: Unknown',
        '',
        'Touchdowns scored: 3',
        '',
        'Total SPP: 12',
        'Unspent SPP: 6 (covers another advancement)',
      ].join('\n'),
    );
    expect(unspentSpp.forPlayer).toHaveBeenCalledTimes(1);
    expect(unspentSpp.forPlayer).toHaveBeenCalledWith(1);
  });

  it('neither looks up nor shows unspent SPP without a total', async () => {
    const { service, unspentSpp } = await makeService({
      players: makePlayers({ player: griff }),
      unspentSpp: makeUnspentSpp(covers),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(unspentSpp.forPlayer).not.toHaveBeenCalled();
    expect(description).not.toContain('Unspent SPP');
  });

  it('shows no unspent line when the lookup finds no such player', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: withTotal }),
      unspentSpp: makeUnspentSpp(undefined),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).toContain('Total SPP: 12');
    expect(description).not.toContain('Unspent SPP');
  });

  it('shows unknown on a lookup timeout and keeps the rest of the embed', async () => {
    // Time out the unspent lookup only, identified by its own work promise
    // (the idiom the keywords and skills timeout specs use), and leave every
    // other query answering normally. Faithful to the real `run`: the
    // timed-out call resolves with the caller's own fallback.
    const unspentSpp = mock<UnspentSppService>();
    const work = Promise.resolve<UnspentSppResult | undefined>(covers);
    unspentSpp.forPlayer.mockReturnValue(work);
    const databaseTimeout = mockDatabaseTimeout();
    databaseTimeout.run.mockImplementation(async (pending, fallback) =>
      pending === work ? fallback : pending,
    );

    const { service } = await makeService({
      players: makePlayers({ player: withTotal }),
      unspentSpp,
      databaseTimeout,
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).toContain('Team: Reikland Reavers');
    expect(description).toContain(
      'Total SPP: 12\nUnspent SPP: unknown (lookup timed out)',
    );
  });

  it('shows the unknown reason the lookup gives', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: withTotal }),
      unspentSpp: makeUnspentSpp({ status: 'unknown', reason: 'star_player' }),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).toContain(
      'Unspent SPP: unknown (star players do not advance)',
    );
  });

  it('shows the line for a dead player like any other', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: { ...withTotal, status: 'dead' } }),
      unspentSpp: makeUnspentSpp(covers),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).toContain(
      'Unspent SPP: 6 (covers another advancement)',
    );
  });
});
