import type { ErasService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  ERAS_LIST_NO_DATA_MESSAGE,
  ERAS_LIST_TIMEOUT_MESSAGE,
  ERAS_RULES_SET_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { resolveErasList } from './eras-list';
import { expectTimeoutFallback } from './toplist.test-helpers';

type EraRow = {
  id: number;
  name: string;
  leagueName: string;
  startDate: string;
  endDate: string | null;
};

function makeEras(
  rows: EraRow[],
  rulesByEra: Record<number, string[]> = {},
): ErasService {
  return {
    listErasWithLeague: vi.fn().mockResolvedValue(rows),
    getRulesSetNames: vi.fn((eraId: number) =>
      Promise.resolve(rulesByEra[eraId] ?? []),
    ),
  } as unknown as ErasService;
}

describe('resolveErasList', () => {
  it('returns the empty-state embed when there are no eras', async () => {
    const result = await resolveErasList(makeEras([]));
    expect(result).toEqual({
      embeds: [{ title: 'Eras', description: ERAS_LIST_NO_DATA_MESSAGE }],
    });
  });

  it('renders a single era with its rules sets', async () => {
    const result = await resolveErasList(
      makeEras(
        [
          {
            id: 1,
            name: 'Season 1',
            leagueName: 'Premier',
            startDate: '2020-01-01',
            endDate: '2020-12-31',
          },
        ],
        { 1: ['BB2016', 'BB2020'] },
      ),
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Eras',
          description:
            'Season 1 (Premier): 2020-01-01 – 2020-12-31 — Rules: BB2016, BB2020',
        },
      ],
    });
  });

  it('renders an ongoing era with no end date as "present" and omits the rules suffix when empty', async () => {
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
    });
  });

  it('falls back to the stunned message when the era query times out', async () => {
    await expectTimeoutFallback(
      (eras: ErasService) => resolveErasList(eras),
      () =>
        ({
          listErasWithLeague: vi.fn().mockReturnValue(new Promise(() => {})),
          getRulesSetNames: vi.fn(),
        }) as unknown as ErasService,
      ERAS_LIST_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the stunned message when the rules-set lookup times out', async () => {
    await expectTimeoutFallback(
      (eras: ErasService) => resolveErasList(eras),
      () =>
        ({
          // Only the era id is read before the rules-set lookup times out,
          // so a minimal single-era array is enough to reach that lookup.
          listErasWithLeague: vi.fn().mockResolvedValue([{ id: 1 }]),
          getRulesSetNames: vi.fn().mockReturnValue(new Promise(() => {})),
        }) as unknown as ErasService,
      ERAS_RULES_SET_TIMEOUT_MESSAGE,
    );
  });
});
