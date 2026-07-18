import type { ErasService } from '@blood-bowl-tracker/game-data';
import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import {
  ERAS_LIST_NO_DATA_MESSAGE,
  ERAS_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { ERA_BUTTON_CUSTOM_ID_PREFIX } from '../../slash-commands/deepdive-command.service';
import { resolveErasList } from './eras-list';
import { expectTimeoutFallback } from './toplist.test-helpers';

type EraRow = {
  id: number;
  name: string;
  leagueName: string;
  startDate: string;
  endDate: string | null;
};

function makeEras(rows: EraRow[]): ErasService {
  return {
    listErasWithLeague: vi.fn().mockResolvedValue(rows),
  } as unknown as ErasService;
}

describe('resolveErasList', () => {
  it('returns the empty-state embed when there are no eras', async () => {
    const result = await resolveErasList(makeEras([]));
    expect(result).toEqual({
      embeds: [{ title: 'Eras', description: ERAS_LIST_NO_DATA_MESSAGE }],
    });
  });

  it('renders a single era with a deepdive button and no inline rules', async () => {
    const result = await resolveErasList(
      makeEras([
        {
          id: 1,
          name: 'Season 1',
          leagueName: 'Premier',
          startDate: '2020-01-01',
          endDate: '2020-12-31',
        },
      ]),
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Eras',
          description: 'Season 1 (Premier): 2020-01-01 – 2020-12-31',
        },
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}1`,
            },
          ],
        },
      ],
    });
  });

  it('renders an ongoing era with no end date as "present" and still attaches a deepdive button', async () => {
    const result = await resolveErasList(
      makeEras([
        {
          id: 1,
          name: 'Season 1',
          leagueName: 'Premier',
          startDate: '2020-01-01',
          endDate: null,
        },
      ]),
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Eras',
          description: 'Season 1 (Premier): 2020-01-01 – present',
        },
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}1`,
            },
          ],
        },
      ],
    });
  });

  it('groups by league, orders leagues by earliest era, and orders eras within a league by start date', async () => {
    const result = await resolveErasList(
      makeEras([
        // deliberately out of order in the input
        {
          id: 3,
          name: 'B Season 2',
          leagueName: 'B League',
          startDate: '2022-01-01',
          endDate: null,
        },
        {
          id: 1,
          name: 'A Season 1',
          leagueName: 'A League',
          startDate: '2019-01-01',
          endDate: '2019-12-31',
        },
        {
          id: 2,
          name: 'A Season 2',
          leagueName: 'A League',
          startDate: '2020-01-01',
          endDate: '2020-12-31',
        },
        {
          id: 4,
          name: 'B Season 1',
          leagueName: 'B League',
          startDate: '2021-01-01',
          endDate: '2021-12-31',
        },
      ]),
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Eras',
          description: [
            'A Season 1 (A League): 2019-01-01 – 2019-12-31',
            'A Season 2 (A League): 2020-01-01 – 2020-12-31',
            'B Season 1 (B League): 2021-01-01 – 2021-12-31',
            'B Season 2 (B League): 2022-01-01 – present',
          ].join('\n'),
        },
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'A Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}1`,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'A Season 2',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}2`,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'B Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}4`,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'B Season 2',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}3`,
            },
          ],
        },
      ],
    });
  });

  it('falls back to the stunned message when the era query times out', async () => {
    await expectTimeoutFallback(
      (eras: ErasService) => resolveErasList(eras),
      () =>
        ({
          listErasWithLeague: vi.fn().mockReturnValue(new Promise(() => {})),
        }) as unknown as ErasService,
      ERAS_LIST_TIMEOUT_MESSAGE,
    );
  });

  it('caps deepdive buttons at 25 even when more eras are listed', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      name: `Era ${i + 1}`,
      leagueName: 'League',
      startDate: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`,
      endDate: null,
    }));
    const result = (await resolveErasList(makeEras(rows))) as {
      embeds: unknown[];
      components: { components: unknown[] }[];
    };
    const totalButtons = result.components.reduce(
      (sum, row) => sum + row.components.length,
      0,
    );
    expect(result.components).toHaveLength(5); // 5 rows
    expect(totalButtons).toBe(25); // 5 per row
  });
});
