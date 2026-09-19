import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import { BblPlayerAdvancementsRawRendererService } from './bbl-player-advancements-raw-renderer.service';

describe('BblPlayerAdvancementsRawRendererService', () => {
  let service: BblPlayerAdvancementsRawRendererService;
  let reader: MockProxy<BblPlayerAdvancementsReaderService>;

  beforeEach(async () => {
    reader = mock<BblPlayerAdvancementsReaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPlayerAdvancementsRawRendererService,
        { provide: BblPlayerAdvancementsReaderService, useValue: reader },
        HtmlService,
        SkillFormatService,
      ],
    }).compile();
    service = moduleRef.get(BblPlayerAdvancementsRawRendererService);
  });

  it('lists starting and gained skills with their order', async () => {
    reader.read.mockResolvedValue({
      skills: [
        {
          name: 'Block',
          attributeValue: null,
          source: 'starting',
          advancementOrder: null,
        },
        {
          name: 'Guard',
          attributeValue: null,
          source: 'gained',
          advancementOrder: 1,
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

    const html = await service.render('1000');

    expect(html).toContain('<td>Block</td><td>starting</td><td>—</td>');
    expect(html).toContain('<td>Guard</td><td>gained</td><td>1</td>');
  });

  it('never shows a dice marker, because BBL cannot tell random from chosen', async () => {
    reader.read.mockResolvedValue({
      skills: [
        {
          name: 'Guard',
          attributeValue: null,
          source: 'gained',
          advancementOrder: 1,
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

    const html = await service.render('1000');

    expect(html).not.toContain('⚄');
    expect(html).toContain('BBL does not record how a skill was gained');
  });

  it('shows the characteristic-increase counts', async () => {
    reader.read.mockResolvedValue({
      skills: [],
      increaseCounts: {
        move: 1,
        strength: 0,
        agility: 2,
        passing: 0,
        armour: 0,
      },
    });

    const html = await service.render('1000');

    expect(html).toContain(
      '<td>1</td><td>0</td><td>2</td><td>0</td><td>0</td>',
    );
  });

  it('renders a note when the mirror has no page for the player', async () => {
    reader.read.mockResolvedValue(null);

    expect(await service.render('1000')).toBe(
      '<p class="note">No BBL player page, or no skills line on it, for pid 1000 in the downloaded mirror.</p>',
    );
  });
});
