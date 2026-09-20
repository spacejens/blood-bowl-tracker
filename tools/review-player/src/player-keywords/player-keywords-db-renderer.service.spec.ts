import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { SampledPlayer } from '../shared/review.types';
import { PlayerKeywordsDbRendererService } from './player-keywords-db-renderer.service';

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

async function makeService(
  dbResult: MockDbResult,
): Promise<PlayerKeywordsDbRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerKeywordsDbRendererService,
      { provide: DB, useValue: dbResult.db },
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(PlayerKeywordsDbRendererService);
}

describe('PlayerKeywordsDbRendererService', () => {
  it('renders the keywords the database recorded for the player position', async () => {
    const service = await makeService(
      mockDb(
        [{ positionId: 7 }],
        [{ id: 500, rulesSetName: 'BB2025' }],
        [
          { positionRulesSetId: 500, keywordName: 'Goblin' },
          { positionRulesSetId: 500, keywordName: 'Undead' },
        ],
      ),
    );

    const html = await service.render(player);

    expect(html).toContain('<th>Rules set</th><th>Keywords</th>');
    expect(html).toContain('<td>BB2025</td><td>Goblin, Undead</td>');
  });

  it('shows "none" when the position has no keywords under any rules set', async () => {
    const service = await makeService(
      mockDb([{ positionId: 7 }], [{ id: 500, rulesSetName: 'BB2025' }], []),
    );

    const html = await service.render(player);

    expect(html).toContain('<td>BB2025</td><td>none</td>');
  });

  it('renders one row per rules set the position maps to', async () => {
    const service = await makeService(
      mockDb(
        [{ positionId: 7 }],
        [
          { id: 400, rulesSetName: 'BB2020' },
          { id: 500, rulesSetName: 'BB2025' },
        ],
        [{ positionRulesSetId: 500, keywordName: 'Goblin' }],
      ),
    );

    const html = await service.render(player);

    expect(html).toContain('<td>BB2020</td><td>none</td>');
    expect(html).toContain('<td>BB2025</td><td>Goblin</td>');
  });

  it('notes a player with no row in the database', async () => {
    const service = await makeService(mockDb([]));

    const html = await service.render(player);

    expect(html).toBe(
      '<p class="note">No player row with id 42 in the database.</p>',
    );
  });

  it('notes a position with no characteristics row under any rules set', async () => {
    const service = await makeService(mockDb([{ positionId: 7 }], []));

    const html = await service.render(player);

    expect(html).toBe(
      '<p class="note">Position &quot;Blitzer&quot; has no characteristics row under any rules set.</p>',
    );
  });
});
