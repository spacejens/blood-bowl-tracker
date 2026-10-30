import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';
import { TpAdvancementCostsRawRendererService } from './tp-advancement-costs-raw-renderer.service';

const ADVANCEMENTS = {
  startingSkills: [],
  gainedSkills: [
    {
      skillMasterId: 261,
      name: 'Guard',
      attributeValue: null,
      isElite: false,
      isRandom: true,
    },
    {
      skillMasterId: 262,
      name: null,
      attributeValue: null,
      isElite: true,
      isRandom: null,
    },
    {
      skillMasterId: 263,
      name: 'Hatred',
      attributeValue: null,
      isElite: false,
      isRandom: false,
      isExtra: true,
    },
  ],
  characteristicDiffs: {
    move: 0,
    strength: 0,
    agility: 0,
    passing: 0,
    armour: 0,
  },
  hasTemplate: true,
};

describe('TpAdvancementCostsRawRendererService', () => {
  let service: TpAdvancementCostsRawRendererService;
  let index: MockProxy<TpRawPlayerSkillsIndexService>;

  beforeEach(async () => {
    index = mock<TpRawPlayerSkillsIndexService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpAdvancementCostsRawRendererService,
        { provide: TpRawPlayerSkillsIndexService, useValue: index },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(TpAdvancementCostsRawRendererService);
  });

  it("shows the roster SPP fields and each gained skill's flags", async () => {
    index.sppFiguresFor.mockResolvedValue({
      totalStarPlayerPoints: 16,
      starPlayerPoints: 4,
      pendingImprovements: 0,
    });
    index.advancementsFor.mockResolvedValue(ADVANCEMENTS);

    const html = await service.render('77');

    expect(index.sppFiguresFor).toHaveBeenCalledWith('77');
    expect(html).toContain('<td>totalStarPlayerPoints</td><td>16</td>');
    expect(html).toContain('<td>starPlayerPoints</td><td>4</td>');
    expect(html).toContain('<td>pendingImprovements</td><td>0</td>');
    expect(html).toContain(
      '<tr><th>Skill</th><th>isRandom</th><th>isElite</th><th>isExtra</th></tr>',
    );
    expect(html).toContain(
      '<td>Guard</td><td>true</td><td>false</td><td>—</td>',
    );
    expect(html).toContain(
      '<td>skillMasterId 262</td><td>not recorded</td><td>true</td><td>—</td>',
    );
    expect(html).toContain(
      '<td>Hatred</td><td>false</td><td>false</td><td>true</td>',
    );
    expect(html).toContain('carries no per-advancement SPP cost');
    expect(html).toContain(
      'Extra skills (isExtra, such as Hatred) and a Journeyman&#39;s Loner are granted without SPP being spent',
    );
  });

  it('says a skill without a random/chosen flag is not recorded as chosen', async () => {
    index.sppFiguresFor.mockResolvedValue({
      totalStarPlayerPoints: 16,
      starPlayerPoints: 4,
      pendingImprovements: 0,
    });
    index.advancementsFor.mockResolvedValue(ADVANCEMENTS);

    expect(await service.render('77')).toContain(
      'Skills marked not recorded had no random/chosen flag in TP&#39;s data; that is not the same as chosen.',
    );
  });

  it('omits the missing-flag note when every gained skill has a flag', async () => {
    index.sppFiguresFor.mockResolvedValue({
      totalStarPlayerPoints: 16,
      starPlayerPoints: 4,
      pendingImprovements: 0,
    });
    index.advancementsFor.mockResolvedValue({
      ...ADVANCEMENTS,
      gainedSkills: [ADVANCEMENTS.gainedSkills[0]],
    });

    expect(await service.render('77')).not.toContain(
      'had no random/chosen flag',
    );
  });

  it('shows a missing SPP field as a dash', async () => {
    index.sppFiguresFor.mockResolvedValue({
      totalStarPlayerPoints: null,
      starPlayerPoints: null,
      pendingImprovements: null,
    });
    index.advancementsFor.mockResolvedValue({
      ...ADVANCEMENTS,
      gainedSkills: [],
    });

    const html = await service.render('77');

    expect(html).toContain('<td>starPlayerPoints</td><td>—</td>');
  });

  it.each([
    [null, ADVANCEMENTS],
    [
      { totalStarPlayerPoints: 1, starPlayerPoints: 1, pendingImprovements: 0 },
      null,
    ],
  ])(
    'notes a line-up no roster file carries',
    async (figures, advancements) => {
      index.sppFiguresFor.mockResolvedValue(figures);
      index.advancementsFor.mockResolvedValue(advancements);

      expect(await service.render('77')).toBe(
        '<p class="note">No downloaded TP roster file carries line-up 77.</p>',
      );
    },
  );
});
