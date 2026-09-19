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
  moveIncreaseCount: 0,
  strengthIncreaseCount: 0,
  agilityIncreaseCount: 0,
  passingIncreaseCount: 0,
  armourIncreaseCount: 0,
};

const rulesSetRow = { rulesSetId: 100, rulesSetName: 'BB2020' };

async function makeService(dbResult: MockDbResult): Promise<{
  service: PlayerAdvancementsDbRendererService;
  bbl: MockProxy<BblPlayerAdvancementsReaderService>;
  tp: MockProxy<TpRawPlayerSkillsIndexService>;
}> {
  const bbl = mock<BblPlayerAdvancementsReaderService>();
  const tp = mock<TpRawPlayerSkillsIndexService>();
  bbl.read.mockResolvedValue(null);
  tp.advancementsFor.mockResolvedValue(null);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerAdvancementsDbRendererService,
      { provide: DB, useValue: dbResult.db },
      { provide: BblPlayerAdvancementsReaderService, useValue: bbl },
      { provide: TpRawPlayerSkillsIndexService, useValue: tp },
      HtmlService,
      SkillFormatService,
    ],
  }).compile();
  return {
    service: moduleRef.get(PlayerAdvancementsDbRendererService),
    bbl,
    tp,
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

  it('highlights a stored skill the raw source does not have', async () => {
    const { service, bbl } = await makeService(
      mockDb(
        [playerRow],
        [rulesSetRow],
        [
          {
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
      increaseCounts: {
        move: 0,
        strength: 0,
        agility: 0,
        passing: 0,
        armour: 0,
      },
    });

    const html = await service.render(player);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('not in the raw source');
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
      increaseCounts: {
        move: 0,
        strength: 0,
        agility: 0,
        passing: 0,
        armour: 0,
      },
    });

    const html = await service.render(player);

    expect(html).toContain('in the raw source only');
    expect(html).toContain('Guard');
  });

  it('highlights a stored increase count that disagrees with the BBL page', async () => {
    const { service, bbl } = await makeService(
      mockDb([{ ...playerRow, agilityIncreaseCount: 0 }], [rulesSetRow], []),
    );
    bbl.read.mockResolvedValue({
      skills: [],
      increaseCounts: {
        move: 0,
        strength: 0,
        agility: 2,
        passing: 0,
        armour: 0,
      },
    });

    const html = await service.render(player);

    expect(html).toContain('mismatch-cell');
  });

  it('never flags increase counts for a TP-sourced player', async () => {
    const { service, tp } = await makeService(
      mockDb([playerRow], [rulesSetRow], []),
    );
    tp.advancementsFor.mockResolvedValue({
      startingSkills: [],
      gainedSkills: [],
      characteristicDiffs: {
        move: 0,
        strength: 1,
        agility: 0,
        passing: 0,
        armour: 0,
      },
      hasTemplate: true,
    });

    const html = await service.render({ ...player, source: 'tp' });

    expect(html).toContain('TP publishes no advancement counts');
    expect(html).not.toContain('mismatch-cell');
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
