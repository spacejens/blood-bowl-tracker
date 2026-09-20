import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type { SampledPlayer } from '../shared/review.types';
import { ManualRawKeywordsService } from '../source/manual-raw-keywords.service';
import type { TpRawPlayerAggregate } from '../source/tp-raw-player-index.service';
import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';
import { PlayerKeywordsRawRendererService } from './player-keywords-raw-renderer.service';

const player: SampledPlayer = {
  source: 'tp',
  playerId: 42,
  externalId: '2477481',
  playerName: 'Hubert Hårdråde',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
  selectedFor: ['Random sample'],
};

const bblPlayer: SampledPlayer = {
  ...player,
  source: 'bbl',
  externalId: 'bbl-pid-9001',
};

function aggregate(
  overrides: Partial<TpRawPlayerAggregate> = {},
): TpRawPlayerAggregate {
  return {
    lineUpId: 2477481,
    name: 'Hubert Hårdråde',
    position: 'Blitzer',
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
    ...overrides,
  };
}

describe('PlayerKeywordsRawRendererService', () => {
  let service: PlayerKeywordsRawRendererService;
  let index: MockProxy<TpRawPlayerIndexService>;
  let manual: MockProxy<ManualRawKeywordsService>;
  let externalSystems: MockProxy<ExternalSystemLookupService>;

  async function makeService(dbRows: unknown[][] = []) {
    index = mock<TpRawPlayerIndexService>();
    manual = mock<ManualRawKeywordsService>();
    manual.all.mockResolvedValue([]);
    externalSystems = mock<ExternalSystemLookupService>();
    externalSystems.getSystemId.mockResolvedValue(9);
    const dbResult = mockDb(...dbRows);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerKeywordsRawRendererService,
        { provide: TpRawPlayerIndexService, useValue: index },
        { provide: ManualRawKeywordsService, useValue: manual },
        { provide: ExternalSystemLookupService, useValue: externalSystems },
        { provide: DB, useValue: dbResult.db },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(PlayerKeywordsRawRendererService);
  }

  beforeEach(async () => {
    await makeService();
  });

  it('renders the template keyword codes with their curated names', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({ templateKeywordCodes: [111, 110] }),
    );
    manual.all.mockResolvedValue([
      { name: 'Goblin', kind: 'species', code: '111' },
      { name: 'Undead', kind: 'species', code: '110' },
      { name: 'Big Guy', kind: 'positional', code: null },
    ]);

    const html = await service.render(player);

    expect(html).toContain('<th>Source</th><th>TP keyword codes</th>');
    expect(html).toContain('Goblin (111)');
    expect(html).toContain('Undead (110)');
    expect(html).toContain('<h5>Manual curation</h5>');
    expect(html).toContain('<td>Big Guy</td><td>positional</td><td>none</td>');
  });

  it('highlights a code no curated keyword carries', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({ templateKeywordCodes: [777] }),
    );

    const html = await service.render(player);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('777 — not curated');
  });

  it('notes that no downloaded roster file carries this player', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({ templateKeywordCodes: null }),
    );

    const html = await service.render(player);

    expect(html).toBe(
      '<p class="note">No downloaded TP roster file carries this player.</p>',
    );
  });

  it('notes no roster file when the line-up appears in no match file at all', async () => {
    index.aggregateFor.mockResolvedValue(null);

    const html = await service.render(player);

    expect(html).toBe(
      '<p class="note">No downloaded TP roster file carries this player.</p>',
    );
  });

  it('shows "none" for a player whose template carries no codes', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({ templateKeywordCodes: [] }),
    );

    const html = await service.render(player);

    expect(html).toContain('<td>Template</td><td>none</td>');
  });

  it('renders no manual-curation section when the catalogue is empty', async () => {
    index.aggregateFor.mockResolvedValue(
      aggregate({ templateKeywordCodes: [] }),
    );

    const html = await service.render(player);

    expect(html).not.toContain('Manual curation');
  });

  it("resolves a BBL-sourced player's tourplay.net external id before querying TP", async () => {
    await makeService([[{ externalId: '2477481' }]]);
    index.aggregateFor.mockResolvedValue(
      aggregate({ templateKeywordCodes: [111] }),
    );
    manual.all.mockResolvedValue([
      { name: 'Goblin', kind: 'species', code: '111' },
    ]);

    const html = await service.render(bblPlayer);

    expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');
    expect(index.aggregateFor).toHaveBeenCalledWith('2477481');
    expect(html).toContain('Goblin (111)');
  });

  it('notes no roster file for a BBL-sourced player with no resolved TP id', async () => {
    await makeService([[]]);

    const html = await service.render(bblPlayer);

    expect(index.aggregateFor).not.toHaveBeenCalled();
    expect(html).toBe(
      '<p class="note">No downloaded TP roster file carries this player.</p>',
    );
  });
});
