import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { TpRawPlayerAggregate } from '../source/tp-raw-player-index.service';
import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';
import { TpPlayerStatusRawRendererService } from './tp-player-status-raw-renderer.service';

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

describe('TpPlayerStatusRawRendererService', () => {
  let service: TpPlayerStatusRawRendererService;
  let index: MockProxy<TpRawPlayerIndexService>;

  beforeEach(async () => {
    index = mock<TpRawPlayerIndexService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpPlayerStatusRawRendererService,
        { provide: TpRawPlayerIndexService, useValue: index },
        // A pure formatter with its own tests; mocking it would leave the
        // generated markup unasserted.
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(TpPlayerStatusRawRendererService);
  });

  it('shows the roster and match snapshot fields verbatim, with their files', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({
        rosterStatus: {
          file: 'rosters_500.json',
          state: 12289,
          isActive: true,
        },
        matchStatus: { file: 'match_7.json', state: 24, isActive: false },
      }),
    );

    const html = await service.render('1');

    expect(html).toContain(
      '<th>Origin</th><th>File</th><th>state</th><th>isActive</th>',
    );
    expect(html).toContain(
      '<td>Roster file</td><td>rosters_500.json</td><td>12289</td><td>true</td>',
    );
    expect(html).toContain(
      '<td>Match snapshot (latest)</td><td>match_7.json</td><td>24</td><td>false</td>',
    );
  });

  it('renders an absent field as the none marker and a 0 as itself', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({
        matchStatus: { file: 'match_7.json', state: 0, isActive: null },
      }),
    );

    const html = await service.render('1');

    expect(html).toContain(
      '<td>Match snapshot (latest)</td><td>match_7.json</td><td>0</td><td>—</td>',
    );
    expect(html).not.toContain('Roster file');
  });

  it('notes a line-up id in no downloaded file', async () => {
    index.aggregateFor.mockResolvedValue(null);

    expect(await service.render('9999')).toBe(
      '<p class="note">Line-up id 9999 appears in no downloaded TP match file.</p>',
    );
  });

  it('notes a player whose entries carry neither field', async () => {
    index.aggregateFor.mockResolvedValue(aggregate());

    expect(await service.render('4')).toBe(
      '<p class="note">No state or isActive for line-up id 4 in any downloaded TP roster or match file.</p>',
    );
  });
});
