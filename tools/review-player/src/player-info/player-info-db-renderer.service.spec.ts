import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { HtmlService } from '../shared/html.service';
import type { SampledPlayer } from '../shared/review.types';
import { PlayerInfoDbRendererService } from './player-info-db-renderer.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1000',
  playerName: 'Janhorgh',
  teamName: 'Bull Whip Whippersnappers',
  positionName: 'Hobgoblin Linemen',
  eraName: 'Third Era',
  selectedFor: ['SPP discrepancy'],
};

async function makeService(
  dbResult: MockDbResult,
): Promise<PlayerInfoDbRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerInfoDbRendererService,
      { provide: DB, useValue: dbResult.db },
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(PlayerInfoDbRendererService);
}

describe('PlayerInfoDbRendererService', () => {
  it('renders the stored identity, team, position and era', async () => {
    const service = await makeService(
      mockDb(
        [
          {
            playerId: 42,
            playerName: 'Janhorgh',
            teamName: 'Bull Whip Whippersnappers',
            positionName: 'Hobgoblin Linemen',
            isStarPlayer: false,
            eraName: 'Third Era',
          },
        ],
        [
          { systemName: 'BBL', externalId: '1000' },
          { systemName: 'TP', externalId: '2477481' },
        ],
      ),
    );

    const html = await service.render(player);

    expect(html).toContain('<td>Database id</td><td>42</td>');
    expect(html).toContain('<td>Name</td><td>Janhorgh</td>');
    expect(html).toContain('<td>Team</td><td>Bull Whip Whippersnappers</td>');
    expect(html).toContain('<td>Position</td><td>Hobgoblin Linemen</td>');
    expect(html).toContain('<td>Star player position</td><td>no</td>');
    expect(html).toContain('<td>Era</td><td>Third Era</td>');
  });

  it('lists every external id the player carries, per system', async () => {
    const service = await makeService(
      mockDb(
        [
          {
            playerId: 42,
            playerName: 'Janhorgh',
            teamName: 'Bockar',
            positionName: 'Lineman',
            isStarPlayer: false,
            eraName: 'Third Era',
          },
        ],
        [
          { systemName: 'BBL', externalId: '1000' },
          { systemName: 'TP', externalId: '2477481' },
        ],
      ),
    );

    const html = await service.render(player);

    expect(html).toContain('<td>External id (BBL)</td><td>1000</td>');
    expect(html).toContain('<td>External id (TP)</td><td>2477481</td>');
  });

  it('notes a sampled player that is no longer in the database', async () => {
    const service = await makeService(mockDb([]));

    expect(await service.render(player)).toBe(
      '<p class="note">No player row with id 42 in the database.</p>',
    );
  });
});
