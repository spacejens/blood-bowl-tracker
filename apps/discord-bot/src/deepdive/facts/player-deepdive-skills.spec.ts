import type {
  PlayerSkillRow,
  PositionCharacteristicsContext,
} from '@blood-bowl-tracker/game-data';
import { PlayerSkillsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { mockDatabaseTimeout } from '../../database-timeout-mock.test-helpers';
import { DEEPDIVE_PLAYER_SKILLS_TIMEOUT_MESSAGE } from '../../error-messages';
import {
  griff,
  makePlayers,
  makePlayerSkills,
  makePositionRulesSets,
  makeService,
} from './player-deepdive.test-helpers';

/** The rules set the player's era resolves to in these tests. */
const RULES_SET_ID = 2;

function context(): PositionCharacteristicsContext {
  return {
    rulesSetId: RULES_SET_ID,
    moveFormat: 'bare',
    strengthFormat: 'bare',
    agilityFormat: 'plus',
    passingFormat: 'plus',
    armourFormat: 'plus',
    baseline: undefined,
  };
}

/** One skill row, defaulted to an ordinary curated starting skill. */
function skill(
  overrides: Partial<PlayerSkillRow> & { skillName: string },
): PlayerSkillRow {
  return {
    skillId: 1,
    source: 'starting',
    attributeValue: null,
    advancementOrder: null,
    category: 'general',
    isElite: false,
    ...overrides,
  };
}

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

describe('PlayerDeepdiveService skill lines', () => {
  it('renders both skill lines in the header block', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(context()),
      playerSkills: makePlayerSkills([
        skill({ skillName: 'Block' }),
        skill({ skillName: 'Dodge', attributeValue: '4+' }),
        skill({
          skillName: 'Mighty Blow',
          source: 'random',
          advancementOrder: 1,
          isElite: true,
        }),
      ]),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).toContain('Starting skills: Block, Dodge (4+)');
    expect(description).toContain('Gained skills: ⚄ ♦ Mighty Blow');
    expect(description.indexOf('Position: Blitzer')).toBeLessThan(
      description.indexOf('Starting skills:'),
    );
    expect(description.indexOf('Starting skills:')).toBeLessThan(
      description.indexOf('Trophies:') === -1
        ? description.length
        : description.indexOf('Trophies:'),
    );
  });

  it("reads the skills under the player's resolved rules set", async () => {
    const { service, playerSkills } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(context()),
      playerSkills: makePlayerSkills([skill({ skillName: 'Block' })]),
    });

    await service.resolve(1);

    expect(playerSkills.listByPlayer).toHaveBeenCalledWith(1, RULES_SET_ID);
  });

  it('shows no skill lines for a player with no recorded skills', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(context()),
      playerSkills: makePlayerSkills([]),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).not.toContain('Starting skills:');
    expect(description).not.toContain('Gained skills:');
  });

  it('skips the skills query entirely when no rules set applies to the era', async () => {
    const { service, playerSkills } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(undefined),
      playerSkills: makePlayerSkills([skill({ skillName: 'Block' })]),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(playerSkills.listByPlayer).not.toHaveBeenCalled();
    expect(description).not.toContain('Starting skills:');
  });

  it('reports a timed-out skills query with its own message', async () => {
    // The skills query is the last `run` call in `resolve`; time out that
    // one call only, identified by its own work promise (the idiom used by
    // the characteristics timeout spec), and leave every earlier query
    // answering normally.
    const playerSkills = mock<PlayerSkillsService>();
    const work = Promise.resolve<PlayerSkillRow[]>([
      skill({ skillName: 'Block' }),
    ]);
    playerSkills.listByPlayer.mockReturnValue(work);
    const databaseTimeout = mockDatabaseTimeout();
    databaseTimeout.run.mockImplementation(async (pending, fallback) =>
      pending === work ? fallback : pending,
    );

    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(context()),
      playerSkills,
      databaseTimeout,
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_PLAYER_SKILLS_TIMEOUT_MESSAGE,
    );
  });
});
