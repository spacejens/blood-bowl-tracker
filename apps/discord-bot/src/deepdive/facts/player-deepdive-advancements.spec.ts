import type {
  PlayerCharacteristicAdvancementRow,
  PlayerSkillRow,
} from '@blood-bowl-tracker/game-data';
import { PlayerAdvancementReadsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { mockDatabaseTimeout } from '../../database-timeout-mock.test-helpers';
import { DEEPDIVE_PLAYER_SKILLS_TIMEOUT_MESSAGE } from '../../error-messages';
import {
  griff,
  makeAdvancementReads,
  makePlayers,
  makePlayerSkills,
  makePositionRulesSets,
  makeService,
} from './player-deepdive.test-helpers';

/** BB2020 formats, so the characteristics line renders alongside. */
const bb2020 = {
  rulesSetId: 2,
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
  baseline: undefined,
} as const;

const increase = (
  characteristic: PlayerCharacteristicAdvancementRow['characteristic'],
  advancementOrder: number | null,
): PlayerCharacteristicAdvancementRow => ({
  characteristic,
  advancementOrder,
  orderConfirmed: false,
});

const gainedSkill = (
  skillName: string,
  advancementOrder: number,
): PlayerSkillRow => ({
  skillId: 1,
  skillName,
  source: 'chosen',
  attributeValue: null,
  advancementOrder,
  category: 'general',
  isElite: false,
  isFreeExtra: false,
});

/**
 * The embed description of a resolved reply. Throws for a plain string reply
 * (a timeout or not-found message) rather than returning '', so a
 * `not.toContain(...)` assertion cannot pass vacuously.
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

describe('PlayerDeepdiveService advancements line', () => {
  it('shows no advancements line for a player with no increases and no skills', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).not.toContain('Advancements:');
    expect(description).not.toContain('Characteristic advancements:');
  });

  it('renders increases among the gained skills in order', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
      playerSkills: makePlayerSkills([
        gainedSkill('Block', 1),
        gainedSkill('Dodge', 3),
      ]),
      advancementReads: makeAdvancementReads([increase('AG', 2)]),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).toContain('Advancements: Block, +AG, Dodge');
    expect(description).not.toContain('Characteristic advancements:');
    expect(description).not.toContain('Gained skills:');
  });

  it('still renders when no rules set resolves and the characteristics line is absent', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(undefined),
      advancementReads: makeAdvancementReads([increase('MA', null)]),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).not.toContain('Characteristics: ');
    expect(description).toContain('Advancements: +MA');
  });

  it('reports a timed-out increases query with the skills timeout message', async () => {
    // Time out that one call only, identified by its own work promise, and
    // leave every earlier query answering normally.
    const advancementReads = mock<PlayerAdvancementReadsService>();
    const work = Promise.resolve<PlayerCharacteristicAdvancementRow[]>([]);
    advancementReads.listCharacteristicAdvancements.mockReturnValue(work);
    const databaseTimeout = mockDatabaseTimeout();
    databaseTimeout.run.mockImplementation(async (pending, fallback) =>
      pending === work ? fallback : pending,
    );

    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
      advancementReads,
      databaseTimeout,
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_PLAYER_SKILLS_TIMEOUT_MESSAGE,
    );
  });
});
