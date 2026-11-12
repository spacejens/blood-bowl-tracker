import { JourneymanRuleService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BblJourneymanAdvancementsService } from './bbl-journeyman-advancements.service';

describe('BblJourneymanAdvancementsService', () => {
  let service: BblJourneymanAdvancementsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BblJourneymanAdvancementsService, JourneymanRuleService],
    }).compile();
    service = moduleRef.get(BblJourneymanAdvancementsService);
  });

  it('sees a gained Loner in any case', () => {
    expect(
      service.listsLoner({
        skills: [{ name: 'loner', source: 'advancement', advancementOrder: 1 }],
        characteristicIncreases: [],
      }),
    ).toBe(true);
  });

  it('sees no Loner on a recruit', () => {
    expect(
      service.listsLoner({
        skills: [{ name: 'Block', source: 'advancement', advancementOrder: 1 }],
        characteristicIncreases: [],
      }),
    ).toBe(false);
  });

  it('drops the gained Loner and closes its number', () => {
    expect(
      service.withoutGainedLoner({
        skills: [
          { name: 'Disturbing Presence', source: 'starting' },
          { name: 'Loner', source: 'advancement', advancementOrder: 1 },
          { name: 'Block', source: 'advancement', advancementOrder: 2 },
        ],
        characteristicIncreases: [
          { characteristic: 'MA', advancementOrder: 3 },
        ],
      }),
    ).toEqual({
      skills: [
        { name: 'Disturbing Presence', source: 'starting' },
        { name: 'Block', source: 'advancement', advancementOrder: 1 },
      ],
      characteristicIncreases: [{ characteristic: 'MA', advancementOrder: 2 }],
    });
  });

  it('keeps a starting Loner', () => {
    const advancements = {
      skills: [{ name: 'Loner', source: 'starting' as const }],
      characteristicIncreases: [],
    };
    expect(service.withoutGainedLoner(advancements)).toEqual(advancements);
  });
});
