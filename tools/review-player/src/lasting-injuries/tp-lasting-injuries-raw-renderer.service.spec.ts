import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { TpRawPlayerAggregate } from '../source/tp-raw-player-index.service';
import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';
import { TpLastingInjuriesRawRendererService } from './tp-lasting-injuries-raw-renderer.service';

function aggregate(
  overrides: Partial<TpRawPlayerAggregate> = {},
): TpRawPlayerAggregate {
  return {
    lineUpId: 1,
    name: 'Test Player',
    position: 'Thrower',
    totalStarPlayerPoints: 0,
    starPointsFromEvents: 0,
    eventCounts: new Map(),
    matchCount: 1,
    move: 5,
    strength: 3,
    agility: 3,
    passing: 4,
    armour: 8,
    nigglingInjuries: null,
    canPlayNextGame: null,
    templateMove: null,
    templateStrength: null,
    templateAgility: null,
    templatePassing: null,
    templateArmour: null,
    templateKeywordCodes: null,
    templatePositionTypes: null,
    templateIsBigGuy: null,
    rosterStatus: null,
    matchStatus: null,
    ...overrides,
  };
}

describe('TpLastingInjuriesRawRendererService', () => {
  let service: TpLastingInjuriesRawRendererService;
  let index: MockProxy<TpRawPlayerIndexService>;

  beforeEach(async () => {
    index = mock<TpRawPlayerIndexService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLastingInjuriesRawRendererService,
        { provide: TpRawPlayerIndexService, useValue: index },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(TpLastingInjuriesRawRendererService);
  });

  it('renders nigglingInjuries and canPlayNextGame verbatim, including false and 0', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({ nigglingInjuries: 0, canPlayNextGame: false }),
    );

    const html = await service.render('1');

    expect(html).toContain('<th>nigglingInjuries</th><th>canPlayNextGame</th>');
    expect(html).toContain('<td>0</td><td>false</td>');
  });

  it('notes a player who appears in no downloaded TP match file', async () => {
    index.aggregateFor.mockResolvedValue(null);

    const html = await service.render('9999');

    expect(html).toBe(
      '<p class="note">Line-up id 9999 appears in no downloaded TP match file.</p>',
    );
  });

  it('notes a player no downloaded roster file carries lasting-injury data for', async () => {
    index.aggregateFor.mockResolvedValue(aggregate());

    const html = await service.render('4');

    expect(html).toBe(
      '<p class="note">No lasting-injury data for line-up id 4 in any downloaded TP roster file.</p>',
    );
  });

  it('shows no stat line: the characteristics part carries it', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({ nigglingInjuries: 1, templateMove: 6 }),
    );

    const html = await service.render('2477481');

    expect(html).not.toContain('Current vs. position template');
    expect(html).not.toContain('<td>Template</td>');
  });

  it('notes no lasting-injury data even when the template is known', async () => {
    index.aggregateFor.mockResolvedValue(aggregate({ templateMove: 6 }));

    expect(await service.render('2477481')).toContain(
      'No lasting-injury data for line-up id 2477481',
    );
  });
});
