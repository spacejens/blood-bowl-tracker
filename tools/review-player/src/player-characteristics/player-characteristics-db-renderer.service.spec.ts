import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { SampledPlayer } from '../shared/review.types';
import { CharacteristicFormatService } from './characteristic-format.service';
import { PlayerCharacteristicsDbRendererService } from './player-characteristics-db-renderer.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1000',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
  selectedFor: ['Random sample'],
};

function playerRow(overrides: Record<string, unknown> = {}) {
  return {
    move: 6,
    strength: 3,
    agility: 3,
    passing: 4,
    armour: 9,
    positionId: 7,
    eraId: 3,
    ...overrides,
  };
}

function rulesSetRow(overrides: Record<string, unknown> = {}) {
  return {
    rulesSetId: 100,
    rulesSetName: 'BB2020',
    moveFormat: 'bare',
    strengthFormat: 'bare',
    agilityFormat: 'plus',
    passingFormat: 'plus',
    armourFormat: 'plus',
    ...overrides,
  };
}

function baselineRow(overrides: Record<string, unknown> = {}) {
  return {
    move: 6,
    strength: 3,
    agility: 3,
    passing: 4,
    armour: 9,
    ...overrides,
  };
}

async function makeService(
  dbResult: MockDbResult,
): Promise<PlayerCharacteristicsDbRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerCharacteristicsDbRendererService,
      { provide: DB, useValue: dbResult.db },
      CharacteristicFormatService,
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(PlayerCharacteristicsDbRendererService);
}

describe('PlayerCharacteristicsDbRendererService', () => {
  it('renders the baseline row and the player row, formatted per the rules set', async () => {
    const service = await makeService(
      mockDb([playerRow()], [rulesSetRow()], [baselineRow()]),
    );

    const html = await service.render(player);

    expect(html).toContain(
      '<td>Position baseline (BB2020)</td><td>6</td><td>3</td><td>3+</td><td>4+</td><td>9+</td>',
    );
    expect(html).toContain(
      '<td>Player (unchanged)</td><td>6</td><td>3</td><td>3+</td><td>4+</td><td>9+</td>',
    );
  });

  it('marks an increased characteristic and highlights the player row', async () => {
    const service = await makeService(
      mockDb([playerRow({ move: 7 })], [rulesSetRow()], [baselineRow()]),
    );

    const html = await service.render(player);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('<td>Player (changed)</td><td>7 ▲</td>');
  });

  it('marks a decreased characteristic', async () => {
    const service = await makeService(
      mockDb([playerRow({ armour: 8 })], [rulesSetRow()], [baselineRow()]),
    );

    const html = await service.render(player);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('<td>8+ ▼</td>');
  });

  it('marks a change to a real zero even though the cell shows a dash', async () => {
    const service = await makeService(
      mockDb([playerRow({ move: 0 })], [rulesSetRow()], [baselineRow()]),
    );

    const html = await service.render(player);

    expect(html).toContain('<td>— ▼</td>');
  });

  it('treats Passing appearing where the baseline has none as a change', async () => {
    const service = await makeService(
      mockDb([playerRow()], [rulesSetRow()], [baselineRow({ passing: null })]),
    );

    const html = await service.render(player);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('<td>4+ ▲</td>');
  });

  it('treats Passing absent on both sides as unchanged', async () => {
    const service = await makeService(
      mockDb(
        [playerRow({ passing: null })],
        [rulesSetRow()],
        [baselineRow({ passing: null })],
      ),
    );

    const html = await service.render(player);

    expect(html).not.toContain('class="mismatch"');
    expect(html).toContain('<td>Player (unchanged)</td>');
  });

  it('highlights a missing baseline row and skips the comparison', async () => {
    const service = await makeService(
      mockDb([playerRow()], [rulesSetRow()], []),
    );

    const html = await service.render(player);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain(
      '<td>Position baseline (BB2020)</td><td>missing</td><td>missing</td><td>missing</td><td>missing</td><td>missing</td>',
    );
    expect(html).toContain('<td>Player</td><td>6</td>');
    expect(html).not.toContain('▲');
    expect(html).not.toContain('▼');
  });

  it('notes a player with no row in the database', async () => {
    const service = await makeService(mockDb([]));

    const html = await service.render(player);

    expect(html).toBe(
      '<p class="note">No player row with id 42 in the database.</p>',
    );
  });

  it('notes an era mapped to no rules set', async () => {
    const service = await makeService(mockDb([playerRow()], []));

    const html = await service.render(player);

    expect(html).toBe(
      '<p class="note">Era &quot;Fourth Era&quot; maps to no rules set, so there is no baseline to compare against.</p>',
    );
  });

  it('resolves the era rules set by descending era_rules_sets id', async () => {
    const dbResult = mockDb([playerRow()], [rulesSetRow()], [baselineRow()]);
    const service = await makeService(dbResult);

    await service.render(player);

    expect(dbResult.chains[1].orderBy).toHaveBeenCalled();
    expect(dbResult.chains[1].limit).toHaveBeenCalledWith(1);
  });
});
