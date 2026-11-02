import {
  HtmlService,
  NO_CHARACTERISTIC,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { TpRawPlayerAggregate } from '../source/tp-raw-player-index.service';
import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';
import { TpPlayerCharacteristicsRawRendererService } from './tp-player-characteristics-raw-renderer.service';

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
    move: null,
    strength: null,
    agility: null,
    passing: null,
    armour: null,
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

describe('TpPlayerCharacteristicsRawRendererService', () => {
  let service: TpPlayerCharacteristicsRawRendererService;
  let index: MockProxy<TpRawPlayerIndexService>;

  beforeEach(async () => {
    index = mock<TpRawPlayerIndexService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpPlayerCharacteristicsRawRendererService,
        { provide: TpRawPlayerIndexService, useValue: index },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(TpPlayerCharacteristicsRawRendererService);
  });

  it('renders the five values from the TP index', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({ move: 5, strength: 3, agility: 3, passing: 4, armour: 8 }),
    );

    const html = await service.render('1');

    expect(html).toContain(
      '<th>Row</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th>',
    );
    expect(html).toContain(
      '<tr><td>Player</td><td>5</td><td>3</td><td>3</td><td>4</td><td>8</td></tr>',
    );
  });

  it('renders a null characteristic as the none marker', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({ move: 6, strength: 3, agility: 2, passing: null, armour: 9 }),
    );

    const html = await service.render('2');

    expect(html).toContain(
      '<tr><td>Player</td><td>6</td><td>3</td><td>2</td><td>—</td><td>9</td></tr>',
    );
  });

  it('renders a real zero characteristic as 0, not the none marker', async () => {
    // This renderer shows raw TP data with no CharacteristicFormat context,
    // so a stored 0 (e.g. a Kroxigor/Ogre's Passing) is a real value and
    // must print like any other number. Only null means "no data".
    index.aggregateFor.mockResolvedValue(
      aggregate({ move: 0, strength: 0, agility: 3, passing: 0, armour: 8 }),
    );

    const html = await service.render('3');

    expect(html).toContain(
      '<tr><td>Player</td><td>0</td><td>0</td><td>3</td><td>0</td><td>8</td></tr>',
    );
  });

  it('notes a player who appears in no downloaded TP match file', async () => {
    index.aggregateFor.mockResolvedValue(null);

    const html = await service.render('9999');

    expect(html).toBe(
      '<p class="note">Line-up id 9999 appears in no downloaded TP match file.</p>',
    );
  });

  it('notes a player no downloaded roster file carries characteristics for', async () => {
    index.aggregateFor.mockResolvedValue(aggregate());

    const html = await service.render('4');

    expect(html).toBe(
      '<p class="note">No characteristics for line-up id 4 in any downloaded TP roster file.</p>',
    );
  });

  it('shows the position template above the current stat line', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
        templateMove: 6,
        templateStrength: 3,
        templateAgility: 3,
        templatePassing: 4,
        templateArmour: 9,
      }),
    );

    const html = await service.render('2477481');

    expect(html).toContain(
      '<tr><td>Position template</td><td>6</td><td>3</td><td>3</td><td>4</td><td>9</td></tr>' +
        '<tr><td>Player</td><td>5</td><td>3</td><td>3</td><td>4</td><td>8</td></tr>',
    );
  });

  it('shows a missing template value as the none marker', async () => {
    index.aggregateFor.mockResolvedValue(aggregate({ templateMove: 6 }));

    expect(await service.render('2477481')).toContain(
      `<tr><td>Position template</td><td>6</td><td>${NO_CHARACTERISTIC}</td>`,
    );
  });

  it('renders when only a template value is known', async () => {
    index.aggregateFor.mockResolvedValue(aggregate({ templateArmour: 9 }));

    expect(await service.render('2477481')).toContain(
      '<td>Position template</td>',
    );
  });
});
