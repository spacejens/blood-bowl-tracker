import type {
  PositionCharacteristicsContext,
  PositionKeyword,
} from '@blood-bowl-tracker/game-data';
import { PositionRulesSetKeywordsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { mockDatabaseTimeout } from '../../database-timeout-mock.test-helpers';
import { DEEPDIVE_PLAYER_KEYWORDS_TIMEOUT_MESSAGE } from '../../error-messages';
import {
  griff,
  makePlayers,
  makePositionRulesSetKeywords,
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

const goblin: PositionKeyword = {
  rulesSetId: RULES_SET_ID,
  rulesSetName: 'BB2025',
  keywordId: 1,
  keywordName: 'Goblin',
  kind: 'species',
};
const undead: PositionKeyword = {
  ...goblin,
  keywordId: 2,
  keywordName: 'Undead',
};

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

describe('PlayerDeepdiveService keywords line', () => {
  it('shows the position keywords for the player rules set', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(context()),
      positionRulesSetKeywords: makePositionRulesSetKeywords([goblin, undead]),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).toContain('Keywords: Goblin, Undead');
  });

  it('shows no keyword line when the position has none', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(context()),
      positionRulesSetKeywords: makePositionRulesSetKeywords([]),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).not.toContain('Keywords:');
  });

  it('shows no keyword line when no rules set resolves for the era', async () => {
    const { service, positionRulesSetKeywords } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(undefined),
      positionRulesSetKeywords: makePositionRulesSetKeywords([goblin, undead]),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(positionRulesSetKeywords.listByPosition).not.toHaveBeenCalled();
    expect(description).not.toContain('Keywords:');
  });

  it('reports the keywords timeout', async () => {
    // The keywords query is the last `run` call in `resolve`; time out that
    // one call only, identified by its own work promise (the idiom used by
    // the characteristics and skills timeout specs), and leave every earlier
    // query answering normally.
    const positionRulesSetKeywords = mock<PositionRulesSetKeywordsService>();
    const work = Promise.resolve<PositionKeyword[]>([goblin]);
    positionRulesSetKeywords.listByPosition.mockReturnValue(work);
    const databaseTimeout = mockDatabaseTimeout();
    databaseTimeout.run.mockImplementation(async (pending, fallback) =>
      pending === work ? fallback : pending,
    );

    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets(context()),
      positionRulesSetKeywords,
      databaseTimeout,
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_PLAYER_KEYWORDS_TIMEOUT_MESSAGE,
    );
  });
});
