import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import { BblUnspentSppReaderService } from '../source/bbl-unspent-spp-reader.service';
import { BblAdvancementCostsRawRendererService } from './bbl-advancement-costs-raw-renderer.service';

const ADVANCEMENTS = {
  skills: [
    {
      name: 'Block',
      attributeValue: null,
      source: 'starting' as const,
      advancementOrder: null,
    },
    {
      name: 'Dodge',
      attributeValue: null,
      source: 'gained' as const,
      advancementOrder: 1,
    },
    {
      name: 'Hatred',
      attributeValue: 'Dwarf',
      source: 'gained' as const,
      advancementOrder: 2,
    },
  ],
  increaseCounts: { move: 1, strength: 0, agility: 0, passing: 0, armour: 2 },
};

describe('BblAdvancementCostsRawRendererService', () => {
  let service: BblAdvancementCostsRawRendererService;
  let unspent: MockProxy<BblUnspentSppReaderService>;
  let advancements: MockProxy<BblPlayerAdvancementsReaderService>;

  beforeEach(async () => {
    unspent = mock<BblUnspentSppReaderService>();
    advancements = mock<BblPlayerAdvancementsReaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblAdvancementCostsRawRendererService,
        { provide: BblUnspentSppReaderService, useValue: unspent },
        { provide: BblPlayerAdvancementsReaderService, useValue: advancements },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(BblAdvancementCostsRawRendererService);
  });

  it('shows both Unspent SPP figures, gained skills in page order and the increase counts', async () => {
    unspent.read.mockResolvedValue({ unspent: -4, careerTotal: 34 });
    advancements.read.mockResolvedValue(ADVANCEMENTS);

    const html = await service.render('1020');

    expect(unspent.read).toHaveBeenCalledWith('1020');
    expect(html).toContain('<td>Unspent SPP (reported)</td><td>-4</td>');
    expect(html).toContain('<td>Career SPP (in brackets)</td><td>34</td>');
    expect(html).toContain('<td>1</td><td>Dodge</td>');
    expect(html).toContain('<td>2</td><td>Hatred (Dwarf)</td>');
    expect(html).not.toContain('<td>Block</td>');
    expect(html).toContain(
      '<td>1</td><td>0</td><td>0</td><td>0</td><td>2</td>',
    );
    expect(html).toContain(
      'cannot say whether a gained skill was randomly rolled or freely chosen',
    );
  });

  it('shows a missing figure as a dash', async () => {
    unspent.read.mockResolvedValue({ unspent: null, careerTotal: null });
    advancements.read.mockResolvedValue(ADVANCEMENTS);

    const html = await service.render('1020');

    expect(html).toContain('<td>Unspent SPP (reported)</td><td>—</td>');
    expect(html).toContain('<td>Career SPP (in brackets)</td><td>—</td>');
  });

  it('shows a player with no gained skills and no increases', async () => {
    unspent.read.mockResolvedValue({ unspent: 6, careerTotal: 6 });
    advancements.read.mockResolvedValue({
      skills: [
        {
          name: 'Block',
          attributeValue: null,
          source: 'starting' as const,
          advancementOrder: null,
        },
      ],
      increaseCounts: {
        move: 0,
        strength: 0,
        agility: 0,
        passing: 0,
        armour: 0,
      },
    });

    const html = await service.render('1020');

    expect(html).toContain('<td>Unspent SPP (reported)</td><td>6</td>');
    expect(html).not.toContain('<td>Block</td>');
    expect(html).toContain(
      '<td>0</td><td>0</td><td>0</td><td>0</td><td>0</td>',
    );
  });

  it('notes a page with no Skills cell', async () => {
    unspent.read.mockResolvedValue({ unspent: 0, careerTotal: 0 });
    advancements.read.mockResolvedValue(null);

    expect(await service.render('1020')).toContain(
      '<p class="note">The page has no Skills cell.</p>',
    );
  });

  it('notes a pid the mirror has no page for', async () => {
    unspent.read.mockResolvedValue(null);

    expect(await service.render('1020')).toBe(
      '<p class="note">No BBL player page for pid 1020 in the downloaded mirror.</p>',
    );
  });
});
