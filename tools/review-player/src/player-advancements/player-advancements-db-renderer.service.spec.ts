import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';
import { PlayerAdvancementsDbRendererService } from './player-advancements-db-renderer.service';
import { PlayerIncreasesDbRendererService } from './player-increases-db-renderer.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 5,
  externalId: '1000',
  playerName: 'Grim',
  teamName: 'Dwarf Giants',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
  selectedFor: ['Random sample'],
};

const playerRow = {
  positionId: 3,
  eraId: 10,
};

const rulesSetRow = { rulesSetId: 100, rulesSetName: 'BB2020' };

async function makeService(dbResult: MockDbResult): Promise<{
  service: PlayerAdvancementsDbRendererService;
  bbl: MockProxy<BblPlayerAdvancementsReaderService>;
  tp: MockProxy<TpRawPlayerSkillsIndexService>;
  increases: MockProxy<PlayerIncreasesDbRendererService>;
}> {
  const bbl = mock<BblPlayerAdvancementsReaderService>();
  const tp = mock<TpRawPlayerSkillsIndexService>();
  const increases = mock<PlayerIncreasesDbRendererService>();
  increases.render.mockResolvedValue('');
  bbl.read.mockResolvedValue(null);
  tp.advancementsFor.mockResolvedValue(null);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerAdvancementsDbRendererService,
      { provide: DB, useValue: dbResult.db },
      { provide: BblPlayerAdvancementsReaderService, useValue: bbl },
      { provide: TpRawPlayerSkillsIndexService, useValue: tp },
      { provide: PlayerIncreasesDbRendererService, useValue: increases },
      HtmlService,
      SkillFormatService,
    ],
  }).compile();
  return {
    service: moduleRef.get(PlayerAdvancementsDbRendererService),
    bbl,
    tp,
    increases,
  };
}

describe('PlayerAdvancementsDbRendererService', () => {
  it('renders a starting skill plain and a random gained skill with the dice marker', async () => {
    const { service } = await makeService(
      mockDb(
        [playerRow],
        [rulesSetRow],
        [
          {
            skillName: 'Block',
            source: 'starting',
            attributeValue: null,
            advancementOrder: null,
            isElite: false,
          },
          {
            skillName: 'Guard',
            source: 'random',
            attributeValue: null,
            advancementOrder: 1,
            isElite: false,
          },
        ],
      ),
    );

    const html = await service.render(player);

    expect(html).toContain('<td>Block</td><td>starting</td>');
    expect(html).toContain('⚄ Guard');
  });

  it('ignores a stored row that names no skill', async () => {
    const { service } = await makeService(
      mockDb(
        [playerRow],
        [rulesSetRow],
        [
          {
            skillId: null,
            skillName: 'Phantom',
            source: 'characteristic',
            attributeValue: null,
            advancementOrder: 1,
            isElite: false,
          },
        ],
      ),
    );

    expect(await service.render(player)).not.toContain('Phantom');
  });

  it('marks an elite gained skill, and both markers when it is also random', async () => {
    const { service } = await makeService(
      mockDb(
        [playerRow],
        [rulesSetRow],
        [
          {
            skillName: 'Block',
            source: 'random',
            attributeValue: null,
            advancementOrder: 1,
            isElite: true,
          },
        ],
      ),
    );

    expect(await service.render(player)).toContain('⚄ ◆ Block');
  });

  it('never marks a starting skill as elite', async () => {
    const { service } = await makeService(
      mockDb(
        [playerRow],
        [rulesSetRow],
        [
          {
            skillName: 'Block',
            source: 'starting',
            attributeValue: null,
            advancementOrder: null,
            isElite: true,
          },
        ],
      ),
    );

    const html = await service.render(player);

    expect(html).toContain('<td>Block</td>');
    expect(html).not.toContain('◆');
  });

  it('matches a stored skill to a differently-spelled raw skill via curated Name external ids', async () => {
    const { service, bbl } = await makeService(
      mockDb(
        [playerRow],
        [rulesSetRow],
        [
          {
            skillId: 42,
            skillName: 'Bone-Head',
            source: 'starting',
            attributeValue: null,
            advancementOrder: null,
            isElite: false,
          },
        ],
        [{ externalId: 'Bone Head', skillId: 42 }],
      ),
    );
    bbl.read.mockResolvedValue({
      skills: [
        {
          name: 'Bone Head',
          attributeValue: null,
          source: 'starting',
          advancementOrder: null,
        },
      ],
      increases: [],
    });

    const html = await service.render(player);

    expect(html).not.toContain('class="mismatch"');
    expect(html).toContain(
      '<td>Bone-Head</td><td>starting</td><td>—</td><td>yes</td>',
    );
  });

  it('highlights a stored skill the raw source does not have', async () => {
    const { service, bbl } = await makeService(
      mockDb(
        [playerRow],
        [rulesSetRow],
        [
          {
            skillId: 7,
            skillName: 'Guard',
            source: 'advancement',
            attributeValue: null,
            advancementOrder: 1,
            isElite: false,
          },
        ],
      ),
    );
    bbl.read.mockResolvedValue({
      skills: [],
      increases: [],
    });

    const html = await service.render(player);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('not in the raw source');
  });

  it('treats two differently-spelled raw entries resolving to the same stored skill as both accounted for', async () => {
    const { service, bbl } = await makeService(
      mockDb(
        [playerRow],
        [rulesSetRow],
        [
          {
            skillId: 42,
            skillName: 'Bone-Head',
            source: 'starting',
            attributeValue: null,
            advancementOrder: null,
            isElite: false,
          },
        ],
        [
          { externalId: 'Bone Head', skillId: 42 },
          { externalId: 'Bonehead', skillId: 42 },
        ],
      ),
    );
    bbl.read.mockResolvedValue({
      skills: [
        {
          name: 'Bone Head',
          attributeValue: null,
          source: 'starting',
          advancementOrder: null,
        },
        {
          name: 'Bonehead',
          attributeValue: null,
          source: 'starting',
          advancementOrder: null,
        },
      ],
      increases: [],
    });

    const html = await service.render(player);

    expect(html).not.toContain('class="mismatch"');
    expect(html).not.toContain('in the raw source only');
  });

  it('adds a highlighted row for a raw skill that was never stored', async () => {
    const { service, bbl } = await makeService(
      mockDb([playerRow], [rulesSetRow], []),
    );
    bbl.read.mockResolvedValue({
      skills: [
        {
          name: 'Guard',
          attributeValue: null,
          source: 'gained',
          advancementOrder: 1,
        },
      ],
      increases: [],
    });

    const html = await service.render(player);

    expect(html).toContain('in the raw source only');
    expect(html).toContain('Guard');
  });

  it('flags a BBL starting/gained category mismatch even when the name matches', async () => {
    const { service, bbl } = await makeService(
      mockDb(
        [playerRow],
        [rulesSetRow],
        [
          {
            skillId: 9,
            skillName: 'Block',
            source: 'chosen',
            attributeValue: null,
            advancementOrder: 1,
            isElite: false,
          },
        ],
      ),
    );
    bbl.read.mockResolvedValue({
      skills: [
        {
          name: 'Block',
          attributeValue: null,
          source: 'starting',
          advancementOrder: null,
        },
      ],
      increases: [],
    });

    const html = await service.render(player);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('not in the raw source');
    expect(html).toContain('in the raw source only');
  });

  it('flags a TP starting/gained category mismatch even when the name matches', async () => {
    const { service, tp } = await makeService(
      mockDb(
        [playerRow],
        [rulesSetRow],
        [
          {
            skillId: 9,
            skillName: 'Block',
            source: 'chosen',
            attributeValue: null,
            advancementOrder: 1,
            isElite: false,
          },
        ],
      ),
    );
    tp.advancementsFor.mockResolvedValue({
      startingSkills: [
        {
          skillMasterId: 220,
          name: 'Block',
          attributeValue: null,
          isElite: false,
        },
      ],
      gainedSkills: [],
      characteristicDiffs: {
        move: 0,
        strength: 0,
        agility: 0,
        passing: 0,
        armour: 0,
      },
      hasTemplate: true,
    });

    const html = await service.render({ ...player, source: 'tp' });

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('not in the raw source');
    expect(html).toContain('in the raw source only');
  });

  it('renders the increases section through the increases renderer', async () => {
    const { service, increases } = await makeService(
      mockDb([playerRow], [rulesSetRow], []),
    );
    increases.render.mockResolvedValue('<p>INCREASES</p>');

    const html = await service.render(player);

    expect(html).toContain('<p>INCREASES</p>');
    expect(increases.render).toHaveBeenCalledWith(player);
  });

  it('renders a note when the player row is missing', async () => {
    const { service } = await makeService(mockDb([], [], []));

    expect(await service.render(player)).toBe(
      '<p class="note">No player row with id 5 in the database.</p>',
    );
  });

  it('renders a note when the era maps to no rules set', async () => {
    const { service } = await makeService(mockDb([playerRow], [], []));

    expect(await service.render(player)).toContain('maps to no rules set');
  });
});
