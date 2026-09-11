import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TrophyAwardRuleDescriptionService } from './trophy-award-rule-description.service';

describe('TrophyAwardRuleDescriptionService', () => {
  let service: TrophyAwardRuleDescriptionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TrophyAwardRuleDescriptionService],
    }).compile();
    service = moduleRef.get(TrophyAwardRuleDescriptionService);
  });

  const base = {
    awardProcedure: null,
    awardRuleTieCutoff: null,
    awardRuleThreshold: null,
    awardRuleMeasure: null,
    includedEventTypes: [] as string[],
    excludedEventTypes: [] as string[],
  };

  it("returns a source-recorded trophy's own procedure verbatim", () => {
    expect(
      service.describe({
        ...base,
        awardRuleKind: 'direct_source',
        awardProcedure: 'Taken from the season standings.',
      }),
    ).toBe('Taken from the season standings.');
  });

  it("returns a manual trophy's own procedure verbatim", () => {
    expect(
      service.describe({
        ...base,
        awardRuleKind: 'manual',
        awardProcedure: 'Voted on by all coaches after the season.',
      }),
    ).toBe('Voted on by all coaches after the season.');
  });

  it('generates a sentence for a single-type count rule', () => {
    expect(
      service.describe({
        ...base,
        awardRuleKind: 'max_count',
        awardRuleTieCutoff: 4,
        includedEventTypes: ['touchdown'],
      }),
    ).toBe(
      'Awarded automatically to the player with the most touchdown events in ' +
        'the competition, shared by up to 4 tied players and not awarded if ' +
        'more tie.',
    );
  });

  it('lists every counted type of a compound count rule', () => {
    expect(
      service.describe({
        ...base,
        awardRuleKind: 'max_count',
        awardRuleTieCutoff: 4,
        includedEventTypes: ['foul', 'casualty', 'badly hurt'],
      }),
    ).toContain('foul, casualty and badly hurt events');
  });

  it('generates a sentence for an unrestricted SPP sum', () => {
    expect(
      service.describe({
        ...base,
        awardRuleKind: 'max_spp_sum',
        awardRuleTieCutoff: 4,
      }),
    ).toBe(
      'Awarded automatically to the player with the most Star Player Points ' +
        'in the competition, shared by up to 4 tied players and not awarded ' +
        'if more tie.',
    );
  });

  it('names the exclusions of an SPP sum rule', () => {
    expect(
      service.describe({
        ...base,
        awardRuleKind: 'max_spp_sum',
        awardRuleTieCutoff: 4,
        excludedEventTypes: ['mvp award'],
      }),
    ).toContain('excluding Star Player Points from mvp award events');
  });

  it('generates a sentence for a career SPP threshold', () => {
    expect(
      service.describe({
        ...base,
        awardRuleKind: 'career_threshold',
        awardRuleThreshold: 176,
        awardRuleMeasure: 'spp_sum',
      }),
    ).toBe(
      'Awarded automatically to every player who reaches 176 Star Player ' +
        'Points over their career.',
    );
  });

  it('generates a sentence for a career event-count threshold', () => {
    expect(
      service.describe({
        ...base,
        awardRuleKind: 'career_threshold',
        awardRuleThreshold: 3,
        awardRuleMeasure: 'event_count',
        includedEventTypes: ['casualty', 'death'],
      }),
    ).toBe(
      'Awarded automatically to every player who records 3 casualty or death ' +
        'events over their career.',
    );
  });
});
