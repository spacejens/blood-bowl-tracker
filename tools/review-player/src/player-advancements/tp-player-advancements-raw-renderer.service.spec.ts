import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { TpRawPlayerAdvancements } from '../source/tp-raw-player-skills-index.service';
import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';
import { TpPlayerAdvancementsRawRendererService } from './tp-player-advancements-raw-renderer.service';

function advancements(
  overrides: Partial<TpRawPlayerAdvancements> = {},
): TpRawPlayerAdvancements {
  return {
    startingSkills: [],
    gainedSkills: [],
    characteristicDiffs: {
      move: 0,
      strength: 0,
      agility: 0,
      passing: 0,
      armour: 0,
    },
    hasTemplate: true,
    ...overrides,
  };
}

describe('TpPlayerAdvancementsRawRendererService', () => {
  let service: TpPlayerAdvancementsRawRendererService;
  let index: MockProxy<TpRawPlayerSkillsIndexService>;

  beforeEach(async () => {
    index = mock<TpRawPlayerSkillsIndexService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpPlayerAdvancementsRawRendererService,
        { provide: TpRawPlayerSkillsIndexService, useValue: index },
        HtmlService,
        SkillFormatService,
      ],
    }).compile();
    service = moduleRef.get(TpPlayerAdvancementsRawRendererService);
  });

  it('renders starting skills plain, with no markers', async () => {
    index.advancementsFor.mockResolvedValue(
      advancements({
        startingSkills: [
          {
            skillMasterId: 1,
            name: 'Block',
            attributeValue: null,
            isElite: false,
          },
        ],
      }),
    );

    const html = await service.render('2000');

    expect(html).toContain('<td>Block</td><td>starting</td>');
    expect(html).not.toContain('⚄');
    expect(html).not.toContain('◆');
  });

  it('shows ⚄ for a randomly rolled gained skill, and ⚄ ◆ when also elite', async () => {
    index.advancementsFor.mockResolvedValue(
      advancements({
        gainedSkills: [
          {
            skillMasterId: 2,
            name: 'Guard',
            attributeValue: null,
            isElite: false,
            isRandom: true,
          },
          {
            skillMasterId: 3,
            name: 'Mighty Blow',
            attributeValue: null,
            isElite: true,
            isRandom: true,
          },
        ],
      }),
    );

    const html = await service.render('2000');

    expect(html).toContain('<td>⚄ Guard</td><td>gained</td>');
    expect(html).toContain('<td>⚄ ◆ Mighty Blow</td><td>gained</td>');
  });

  it('shows no dice marker and a note when isRandom is null', async () => {
    index.advancementsFor.mockResolvedValue(
      advancements({
        gainedSkills: [
          {
            skillMasterId: 4,
            name: 'Dodge',
            attributeValue: null,
            isElite: false,
            isRandom: null,
          },
        ],
      }),
    );

    const html = await service.render('2000');

    expect(html).toContain('<td>Dodge</td><td>gained</td>');
    expect(html).not.toContain('⚄');
    expect(html).toContain('TP recorded no random/chosen flag for this skill');
  });

  it('falls back to "skill master #<id>" when the skill has no embedded name', async () => {
    index.advancementsFor.mockResolvedValue(
      advancements({
        startingSkills: [
          {
            skillMasterId: 42,
            name: null,
            attributeValue: null,
            isElite: false,
          },
        ],
      }),
    );

    const html = await service.render('2000');

    expect(html).toContain('<td>skill master #42</td><td>starting</td>');
  });

  it('renders the derived characteristic diffs table with the derivation note', async () => {
    index.advancementsFor.mockResolvedValue(
      advancements({
        characteristicDiffs: {
          move: 1,
          strength: 0,
          agility: 2,
          passing: 0,
          armour: 1,
        },
      }),
    );

    const html = await service.render('2000');

    expect(html).toContain(
      '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th>',
    );
    expect(html).toContain(
      '<td>1</td><td>0</td><td>2</td><td>0</td><td>1</td>',
    );
    expect(html).toContain(
      'Derived from the position template, not reported by TP',
    );
  });

  it('renders a note and skips derived increases when hasTemplate is false', async () => {
    index.advancementsFor.mockResolvedValue(
      advancements({
        hasTemplate: false,
        gainedSkills: [
          {
            skillMasterId: 5,
            name: 'Block',
            attributeValue: null,
            isElite: false,
            isRandom: true,
          },
        ],
      }),
    );

    const html = await service.render('2000');

    expect(html).toContain(
      'TP published no position template for this player, so starting skills and derived increases are unavailable.',
    );
    expect(html).toContain('<td>⚄ Block</td><td>gained</td>');
    expect(html).not.toContain(
      'Derived from the position template, not reported by TP',
    );
  });

  it('renders a note when advancementsFor resolves null', async () => {
    index.advancementsFor.mockResolvedValue(null);

    expect(await service.render('2000')).toBe(
      '<p class="note">No TP roster entry for line-up id 2000 in the downloaded files.</p>',
    );
  });
});
