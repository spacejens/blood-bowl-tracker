import { DB } from '@blood-bowl-tracker/db';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import type { MockDbResult } from '@blood-bowl-tracker/review-harness/test-helpers';
import { mockDb } from '@blood-bowl-tracker/review-harness/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

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

  it('shows a star player position as yes', async () => {
    const service = await makeService(
      mockDb(
        [
          {
            playerId: 42,
            playerName: 'Janhorgh',
            teamName: 'Bockar',
            positionName: 'Star player',
            isStarPlayer: true,
            positionId: 900,
            eraName: 'Third Era',
          },
        ],
        [],
        [],
      ),
    );

    const html = await service.render(player);

    expect(html).toContain('<td>Star player position</td><td>yes</td>');
  });

  it('notes a sampled player that is no longer in the database', async () => {
    const service = await makeService(mockDb([]));

    expect(await service.render(player)).toBe(
      '<p class="note">No player row with id 42 in the database.</p>',
    );
  });

  it("lists a star player's other hires, one row per team era", async () => {
    const service = await makeService(
      mockDb(
        [
          {
            playerId: 42,
            playerName: "Morg 'n' Thorg",
            teamName: 'Bockar',
            positionName: "Morg 'n' Thorg",
            isStarPlayer: true,
            positionId: 900,
            eraName: 'Third Era',
          },
        ],
        [],
        [
          { teamName: '40 Thieves', eraName: 'Third Era' },
          { teamName: 'Reikland Reavers', eraName: 'Fourth Era' },
        ],
      ),
    );

    const html = await service.render(player);

    expect(html).toContain(
      '<td>Other hire</td><td>40 Thieves (Third Era)</td>',
    );
    expect(html).toContain(
      '<td>Other hire</td><td>Reikland Reavers (Fourth Era)</td>',
    );
  });

  it("dedupes a star's other hires by team+era, since one team era can have many players rows for the same star", async () => {
    const service = await makeService(
      mockDb(
        [
          {
            playerId: 42,
            playerName: "Morg 'n' Thorg",
            teamName: 'Brunnsbo Rams',
            positionName: "Morg 'n' Thorg",
            isStarPlayer: true,
            positionId: 900,
            eraName: 'Third Era',
          },
        ],
        [],
        [
          { teamName: 'Bockar', eraName: 'Third Era' },
          { teamName: 'Bockar', eraName: 'Third Era' },
        ],
      ),
    );

    const html = await service.render(player);

    expect(
      html.split('<td>Other hire</td><td>Bockar (Third Era)</td>').length - 1,
    ).toBe(1);
  });

  it('says so when a star player has no other hires', async () => {
    const service = await makeService(
      mockDb(
        [
          {
            playerId: 42,
            playerName: "Morg 'n' Thorg",
            teamName: 'Bockar',
            positionName: "Morg 'n' Thorg",
            isStarPlayer: true,
            positionId: 900,
            eraName: 'Third Era',
          },
        ],
        [],
        [],
      ),
    );

    expect(await service.render(player)).toContain(
      '<td>Other hires</td><td>none</td>',
    );
  });

  it('issues no other-hires query for a regular player', async () => {
    const dbResult = mockDb(
      [
        {
          playerId: 42,
          playerName: 'Janhorgh',
          teamName: 'Bockar',
          positionName: 'Lineman',
          isStarPlayer: false,
          positionId: 12,
          eraName: 'Third Era',
        },
      ],
      [],
    );
    const service = await makeService(dbResult);

    const html = await service.render(player);

    expect(dbResult.chains).toHaveLength(2);
    expect(html).not.toContain('Other hire');
  });
});
