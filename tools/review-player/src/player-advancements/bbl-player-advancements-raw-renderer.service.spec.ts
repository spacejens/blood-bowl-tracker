import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import { BblUnspentSppReaderService } from '../source/bbl-unspent-spp-reader.service';
import { BblPlayerAdvancementsRawRendererService } from './bbl-player-advancements-raw-renderer.service';

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
      advancementOrder: 3,
    },
  ],
  increases: [
    { characteristic: 'AV' as const, advancementOrder: 4 },
    { characteristic: 'MA' as const, advancementOrder: 2 },
  ],
};

describe('BblPlayerAdvancementsRawRendererService', () => {
  let service: BblPlayerAdvancementsRawRendererService;
  let unspent: MockProxy<BblUnspentSppReaderService>;
  let reader: MockProxy<BblPlayerAdvancementsReaderService>;

  beforeEach(async () => {
    unspent = mock<BblUnspentSppReaderService>();
    reader = mock<BblPlayerAdvancementsReaderService>();
    unspent.read.mockResolvedValue({ unspent: -3, careerTotal: 51 });
    reader.read.mockResolvedValue(ADVANCEMENTS);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPlayerAdvancementsRawRendererService,
        { provide: BblUnspentSppReaderService, useValue: unspent },
        { provide: BblPlayerAdvancementsReaderService, useValue: reader },
        SkillFormatService,
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(BblPlayerAdvancementsRawRendererService);
  });

  it('shows both figures of the Unspent SPP row', async () => {
    const html = await service.render('1000');

    expect(unspent.read).toHaveBeenCalledWith('1000');
    expect(html).toContain('<h5>SPP figures</h5>');
    expect(html).toContain('<td>Career SPP (in brackets)</td><td>51</td>');
    expect(html).toContain('<td>Unspent SPP (reported)</td><td>-3</td>');
  });

  it('shows a missing figure as a dash', async () => {
    unspent.read.mockResolvedValue({ unspent: null, careerTotal: 51 });

    expect(await service.render('1000')).toContain(
      '<td>Unspent SPP (reported)</td><td>—</td>',
    );
  });

  it('lists starting skills, then gained skills and increases in page order', async () => {
    const html = await service.render('1000');

    expect(html).toContain('<h5>Skills and advancements</h5>');
    expect(html).toContain('<th>Order</th><th>Advancement</th><th>Source</th>');
    expect(html).toContain(
      '<tr><td>—</td><td>Block</td><td>starting</td></tr>' +
        '<tr><td>#1</td><td>Dodge</td><td>gained</td></tr>' +
        '<tr><td>#2</td><td>+MA</td><td>characteristic increase</td></tr>' +
        '<tr><td>#3</td><td>Hatred (Dwarf)</td><td>gained</td></tr>' +
        '<tr><td>#4</td><td>+AV</td><td>characteristic increase</td></tr>',
    );
  });

  it('never marks a skill and explains nothing BBL cannot record', async () => {
    const html = await service.render('1000');

    expect(html).not.toContain('⚄');
    expect(html).not.toContain('◆');
    expect(html).not.toContain('cannot say whether');
    expect(html).not.toContain('does not record how a skill was gained');
    expect(html).not.toContain('class="note"');
  });

  it('notes a page with no Skills cell', async () => {
    reader.read.mockResolvedValue(null);

    expect(await service.render('1000')).toContain(
      '<p class="note">The page has no Skills cell.</p>',
    );
  });

  it('notes a pid the mirror has no page for', async () => {
    unspent.read.mockResolvedValue(null);

    expect(await service.render('1000')).toBe(
      '<p class="note">No BBL player page for pid 1000 in the downloaded mirror.</p>',
    );
    expect(reader.read).not.toHaveBeenCalled();
  });
});
