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

  it('renders the template and current stat rows', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({
        nigglingInjuries: 1,
        canPlayNextGame: true,
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 6,
        templateMove: 5,
        templateStrength: 3,
        templateAgility: 3,
        templatePassing: 4,
        templateArmour: 7,
      }),
    );

    const html = await service.render('1');

    expect(html).toContain(
      '<td>Template</td><td>5</td><td>3</td><td>3</td><td>4</td><td>7</td>',
    );
    expect(html).toContain(
      '<td>Player</td><td>5</td><td>3</td><td>3</td><td>4</td><td>6</td>',
    );
  });

  it('renders a null template cell as the none marker', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({ nigglingInjuries: 0, canPlayNextGame: false }),
    );

    const html = await service.render('1');

    expect(html).toContain(
      '<td>Template</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>',
    );
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
});
