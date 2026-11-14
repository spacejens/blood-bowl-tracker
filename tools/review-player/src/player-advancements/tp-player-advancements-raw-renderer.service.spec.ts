import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type {
  TpRawGainedSkill,
  TpRawPlayerAdvancements,
} from '../source/tp-raw-player-skills-index.service';
import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';
import { TpPlayerAdvancementsRawRendererService } from './tp-player-advancements-raw-renderer.service';

function gained(
  name: string | null,
  extra: Partial<TpRawGainedSkill> = {},
): TpRawGainedSkill {
  return {
    skillMasterId: 261,
    name,
    attributeValue: null,
    isElite: false,
    isRandom: true,
    ...extra,
  };
}

function advancements(
  overrides: Partial<TpRawPlayerAdvancements> = {},
): TpRawPlayerAdvancements {
  return {
    startingSkills: [
      { skillMasterId: 1, name: 'Block', attributeValue: null, isElite: false },
    ],
    gainedSkills: [
      gained('Guard'),
      gained(null, { skillMasterId: 262, isElite: true, isRandom: null }),
    ],
    characteristicDiffs: {
      move: 1,
      strength: 0,
      agility: 1,
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
    index.sppFiguresFor.mockResolvedValue({
      totalStarPlayerPoints: 51,
      starPlayerPoints: 9,
      pendingImprovements: null,
    });
    index.advancementsFor.mockResolvedValue(advancements());
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpPlayerAdvancementsRawRendererService,
        { provide: TpRawPlayerSkillsIndexService, useValue: index },
        SkillFormatService,
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(TpPlayerAdvancementsRawRendererService);
  });

  it('shows the roster SPP fields, labelling the unspent one', async () => {
    const html = await service.render('2477481');

    expect(html).toContain('<h5>SPP figures</h5>');
    expect(html).toContain('<td>totalStarPlayerPoints</td><td>51</td>');
    expect(html).toContain('<td>starPlayerPoints (unspent)</td><td>9</td>');
    expect(html).toContain('<td>pendingImprovements</td><td>—</td>');
    expect(html).not.toContain('is the SPP TP holds unspent');
  });

  it('lists starting and gained skills in one table with the raw flags', async () => {
    const html = await service.render('2477481');

    expect(html).toContain('<h5>Skills and advancements</h5>');
    expect(html).toContain(
      '<th>Skill</th><th>Source</th><th>isRandom</th><th>isElite</th><th>isExtra</th>',
    );
    expect(html).toContain(
      '<tr><td>Block</td><td>starting</td><td>—</td><td>—</td><td>—</td></tr>',
    );
    expect(html).toContain(
      '<tr><td>Guard</td><td>gained</td><td>true</td><td>false</td><td>—</td></tr>',
    );
    expect(html).toContain(
      '<tr><td>skill master #262</td><td>gained</td><td>not recorded</td>' +
        '<td>true</td><td>—</td></tr>',
    );
  });

  it('explains nothing the cells already say', async () => {
    const html = await service.render('2477481');

    expect(html).not.toContain('TP recorded no random/chosen flag');
    expect(html).not.toContain("TP's download carries no per-advancement");
    expect(html).not.toContain('Extra skills');
    expect(html).not.toContain('Journeyman');
    expect(html).not.toContain('class="note"');
  });

  it('explains pricing for a player with an extra skill', async () => {
    index.advancementsFor.mockResolvedValue(
      advancements({
        gainedSkills: [
          gained('Hatred', { isExtra: true, attributeValue: 'Dwarf' }),
        ],
      }),
    );

    const html = await service.render('2477481');

    expect(html).toContain(
      '<td>Hatred (Dwarf)</td><td>gained</td><td>true</td><td>false</td><td>true</td>',
    );
    expect(html).toContain(
      '<p>Extra skills (isExtra, such as Hatred) are imported as free ' +
        'extras, so the modelled range prices them at 0.</p>',
    );
    expect(html).not.toContain('Journeyman');
  });

  it('adds no pricing line for a gained Loner', async () => {
    index.advancementsFor.mockResolvedValue(
      advancements({
        gainedSkills: [gained('Loner', { attributeValue: '4+' })],
      }),
    );

    const html = await service.render('2477481');

    expect(html).toContain('<td>Loner (4+)</td><td>gained</td>');
    expect(html).not.toContain('Journeyman');
    expect(html).not.toContain('<p>');
  });

  it('shows the derived improvements under a heading that says so', async () => {
    const html = await service.render('2477481');

    expect(html).toContain(
      '<h5>Characteristic improvements (derived from position template)</h5>',
    );
    expect(html).toContain(
      '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th>',
    );
    expect(html).toContain(
      '<tr><td>1</td><td>0</td><td>1</td><td>0</td><td>0</td></tr>',
    );
    expect(html).not.toContain(
      'Derived from the position template, not reported',
    );
  });

  it('notes a missing template and skips the derived improvements', async () => {
    index.advancementsFor.mockResolvedValue(
      advancements({ startingSkills: [], hasTemplate: false }),
    );

    const html = await service.render('2477481');

    expect(html).toContain(
      '<p class="note">TP published no position template for this player, ' +
        'so starting skills and derived increases are unavailable.</p>',
    );
    expect(html).not.toContain('Characteristic improvements');
    expect(html).toContain('<td>Guard</td>');
  });

  it('notes a line-up no roster file carries', async () => {
    index.advancementsFor.mockResolvedValue(null);

    expect(await service.render('2477481')).toBe(
      '<p class="note">No downloaded TP roster file carries line-up 2477481.</p>',
    );
  });

  it('notes a line-up with advancements but no SPP figures', async () => {
    index.sppFiguresFor.mockResolvedValue(null);

    expect(await service.render('2477481')).toContain(
      'No downloaded TP roster file carries line-up 2477481.',
    );
  });
});
