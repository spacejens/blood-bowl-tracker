import { PlayerSkillsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { PlayerAdvancementOrdersProcessor } from './player-advancement-orders.processor';

const entry = {
  player: { system: 'tourplay.net', id: '586220' },
  advancements: [
    { skill: { system: 'Name', id: 'Block' } },
    { characteristic: 'AG' as const },
    { skill: { system: 'Name', id: 'Hatred' }, attributeValue: 'Dwarf' },
  ],
};

function emptyData(): ManualDataFile {
  return {
    externalSystems: [],
    rulesSets: [],
    leagues: [],
    eras: [],
    races: [],
    positions: [],
    positionRulesSets: [],
    positionRulesSetSkills: [],
    positionRulesSetSkillCategories: [],
    skills: [],
    skillRulesSets: [],
    keywords: [],
    coaches: [],
    teams: [],
    competitions: [],
    sppAwardValues: [],
    advancementCosts: [],
    trophies: [],
    competitionGroups: [],
    trophyAwards: [],
    playerAdvancementOrders: [],
  };
}

function makeContext(data: ManualDataFile): ProcessContext {
  return {
    data,
    systemIds: new Map([
      ['Name', 2],
      ['tourplay.net', 3],
    ]),
    errors: [],
  };
}

describe('PlayerAdvancementOrdersProcessor', () => {
  let processor: PlayerAdvancementOrdersProcessor;
  let refResolver: MockProxy<ReferenceResolverService>;
  let playerSkills: MockProxy<PlayerSkillsImportService>;

  beforeEach(async () => {
    refResolver = mock<ReferenceResolverService>();
    playerSkills = mock<PlayerSkillsImportService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerAdvancementOrdersProcessor,
        { provide: ReferenceResolverService, useValue: refResolver },
        { provide: PlayerSkillsImportService, useValue: playerSkills },
      ],
    }).compile();
    processor = moduleRef.get(PlayerAdvancementOrdersProcessor);
  });

  it('sends the whole order confirmed, numbered from 1, with the spend check on', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    refResolver.resolveRefs.mockResolvedValue([70, 71]);
    playerSkills.syncPlayerSkills.mockResolvedValue(3);
    const ctx = makeContext({
      ...emptyData(),
      playerAdvancementOrders: [entry],
    });

    expect(await processor.process(ctx)).toBe(1);
    expect(refResolver.resolveRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: entry.player,
        kind: 'player',
        item: entry,
      }),
    );
    expect(refResolver.resolveRefs).toHaveBeenCalledWith(
      expect.objectContaining({
        refs: [
          { system: 'Name', id: 'Block' },
          { system: 'Name', id: 'Hatred' },
        ],
        kind: 'skill',
      }),
    );
    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      {
        entries: [
          {
            playerId: 9,
            skillId: 70,
            source: 'advancement',
            attributeValue: null,
            advancementOrder: 1,
            orderConfirmed: true,
          },
          {
            playerId: 9,
            source: 'characteristic',
            characteristic: 'AG',
            advancementOrder: 2,
            orderConfirmed: true,
          },
          {
            playerId: 9,
            skillId: 71,
            source: 'advancement',
            attributeValue: 'Dwarf',
            advancementOrder: 3,
            orderConfirmed: true,
          },
        ],
        characteristicPlayerIds: [9],
        checkOrderAgainstSpend: true,
      },
      ctx.errors,
    );
  });

  it('skips an entry whose player does not resolve', async () => {
    refResolver.resolveRef.mockResolvedValue(undefined);
    const ctx = makeContext({
      ...emptyData(),
      playerAdvancementOrders: [entry],
    });

    expect(await processor.process(ctx)).toBe(0);
    expect(playerSkills.syncPlayerSkills).not.toHaveBeenCalled();
  });

  it('skips an entry with a skill that does not resolve', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    refResolver.resolveRefs.mockResolvedValue(undefined);
    const ctx = makeContext({
      ...emptyData(),
      playerAdvancementOrders: [entry],
    });

    expect(await processor.process(ctx)).toBe(0);
    expect(playerSkills.syncPlayerSkills).not.toHaveBeenCalled();
  });

  it('does not count an entry the server refuses', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    refResolver.resolveRefs.mockResolvedValue([70, 71]);
    playerSkills.syncPlayerSkills.mockResolvedValue(0);
    const ctx = makeContext({
      ...emptyData(),
      playerAdvancementOrders: [entry],
    });

    expect(await processor.process(ctx)).toBe(0);
  });
});
