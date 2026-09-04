import type { PositionCharacteristicsContext } from '@blood-bowl-tracker/game-data';
import { PositionRulesSetsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { mockDatabaseTimeout } from '../../database-timeout-mock.test-helpers';
import { DEEPDIVE_PLAYER_CHARACTERISTICS_TIMEOUT_MESSAGE } from '../../error-messages';
import {
  griff,
  makePlayers,
  makePositionRulesSets,
  makeService,
} from './player-deepdive.test-helpers';

/** A modern rules set: Agility, Passing and Armour are target numbers. */
const bb2020Formats = {
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
} as const;

function context(
  overrides: Partial<PositionCharacteristicsContext> = {},
): PositionCharacteristicsContext {
  return {
    ...bb2020Formats,
    baseline: undefined,
    ...overrides,
  };
}

/** The embed description of a resolved reply, or '' if it is a plain string. */
function descriptionOf(reply: string | InteractionReplyOptions): string {
  return typeof reply === 'string'
    ? ''
    : ((reply.embeds?.[0] as { description?: string } | undefined)
        ?.description ?? '');
}

describe('PlayerDeepdiveService characteristics line', () => {
  it('renders the characteristics under the position line', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(context()),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).toContain(
      'Characteristics: MA 7 ST 3 AG 3+ PA 4+ AV 9+',
    );
    expect(description.indexOf('Position: Blitzer')).toBeLessThan(
      description.indexOf('Characteristics:'),
    );
  });

  it('looks the context up by the player position and era', async () => {
    const { service, positionRulesSets } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(context()),
    });

    await service.resolve(1);

    expect(positionRulesSets.findCharacteristicsContext).toHaveBeenCalledWith(
      4,
      7,
    );
  });

  it('renders no characteristics line when no rules set applies', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(undefined),
    });

    expect(descriptionOf(await service.resolve(1))).not.toContain(
      'Characteristics:',
    );
  });

  it('omits Passing entirely for a rules set with no Passing characteristic', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: { ...griff, passing: null } }),
      positionRulesSets: makePositionRulesSets(
        context({
          agilityFormat: 'bare',
          passingFormat: 'absent',
          armourFormat: 'bare',
        }),
      ),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).toContain('Characteristics: MA 7 ST 3 AG 3 AV 9');
    expect(description).not.toContain('PA');
  });

  it('renders a not-yet-curated zero as a dash', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: { ...griff, move: 0, strength: 0, agility: 0, armour: 0 },
      }),
      positionRulesSets: makePositionRulesSets(context()),
    });

    expect(descriptionOf(await service.resolve(1))).toContain(
      'Characteristics: MA — ST — AG — PA 4+ AV —',
    );
  });

  it('falls back to the characteristics timeout message when the lookup times out', async () => {
    const positionRulesSets = mock<PositionRulesSetsService>();
    const work = Promise.resolve<PositionCharacteristicsContext | undefined>(
      context(),
    );
    positionRulesSets.findCharacteristicsContext.mockReturnValue(work);
    const databaseTimeout = mockDatabaseTimeout();
    // Time out this one call only, identified by its own work promise, so the
    // test does not depend on where in the sequence the call happens to sit.
    databaseTimeout.run.mockImplementation(async (pending, fallback) =>
      pending === work ? fallback : pending,
    );
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets,
      databaseTimeout,
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_PLAYER_CHARACTERISTICS_TIMEOUT_MESSAGE,
    );
  });
});
