import type { TpOfficialPosition } from '@blood-bowl-tracker/api-contract';
import { TpOfficialListingPrecedenceService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  officialPosition,
  officialRace,
  STATS,
} from './official-teams.test-helpers';
import { TpOfficialStarNormalizerService } from './tp-official-star-normalizer.service';

const LEGACY_STATS = { ...STATS, strength: 4 };
const OTHER_STATS = { ...STATS, move: 7 };

function star(overrides: Partial<TpOfficialPosition> = {}): TpOfficialPosition {
  return officialPosition({
    name: 'Grim Ironjaw',
    isStarPlayer: true,
    tpPositionId: 501,
    ...overrides,
  });
}

describe('TpOfficialStarNormalizerService', () => {
  let service: TpOfficialStarNormalizerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialStarNormalizerService,
        // Pure, dependency-free decision service: passed real (CLAUDE.md).
        TpOfficialListingPrecedenceService,
      ],
    }).compile();
    service = moduleRef.get(TpOfficialStarNormalizerService);
  });

  it.each([
    { order: 'legacy listed first', officialFlags: [false, true] },
    { order: 'official listed first', officialFlags: [true, false] },
  ])(
    "gives every race's copy of a star the official listing's values ($order)",
    ({ officialFlags }) => {
      const races = officialFlags.map((isOfficial, index) =>
        officialRace({
          name: index === 0 ? 'Orc' : 'Dwarf',
          teamRaceCode: `race${index}`,
          isOfficial,
          positions: [
            star({
              tpPositionId: 500 + index,
              characteristics: isOfficial ? STATS : LEGACY_STATS,
              keywordCodes: isOfficial ? [1] : [2],
            }),
          ],
        }),
      );

      const result = service.normalize(races);

      for (const [index, race] of result.entries()) {
        expect(race.positions[0]).toEqual(
          star({ tpPositionId: 500 + index, keywordCodes: [1] }),
        );
      }
    },
  );

  it('lets the later of two official listings win, like the server', () => {
    const result = service.normalize([
      officialRace({ positions: [star({ characteristics: STATS })] }),
      officialRace({
        name: 'Dwarf',
        teamRaceCode: 'dwarf20',
        positions: [star({ characteristics: OTHER_STATS })],
      }),
    ]);

    expect(result.map((race) => race.positions[0].characteristics)).toEqual([
      OTHER_STATS,
      OTHER_STATS,
    ]);
  });

  it('picks one listing per race name before choosing across races, like the server', () => {
    // Server: the Orc group ends on the second Orc listing (LEGACY_STATS
    // values, official roster), the Dwarf group on OTHER_STATS; folding the
    // groups in first-seen order (Orc, Dwarf) keeps Dwarf's.
    const result = service.normalize([
      officialRace({ positions: [star({ characteristics: STATS })] }),
      officialRace({
        name: 'Dwarf',
        teamRaceCode: 'dwarf20',
        positions: [star({ characteristics: OTHER_STATS })],
      }),
      officialRace({
        teamRaceCode: 'orcVariant20',
        positions: [star({ characteristics: LEGACY_STATS })],
      }),
    ]);

    expect(result.map((race) => race.positions[0].characteristics)).toEqual([
      OTHER_STATS,
      OTHER_STATS,
      OTHER_STATS,
    ]);
  });

  it("drops a loser's own categories error when the winner has none", () => {
    const result = service.normalize([
      officialRace({
        isOfficial: false,
        positions: [star({ skillCategoriesError: 'corrupt' })],
      }),
      officialRace({
        name: 'Dwarf',
        teamRaceCode: 'dwarf20',
        positions: [star()],
      }),
    ]);

    for (const race of result) {
      expect(race.positions[0]).not.toHaveProperty('skillCategoriesError');
    }
  });

  it("copies the winner's categories error to every copy", () => {
    const result = service.normalize([
      officialRace({ positions: [star({ skillCategoriesError: 'corrupt' })] }),
      officialRace({
        name: 'Dwarf',
        teamRaceCode: 'dwarf20',
        isOfficial: false,
        positions: [star()],
      }),
    ]);

    expect(result[1].positions[0].skillCategoriesError).toBe('corrupt');
  });

  it('leaves a star fielded by one race untouched', () => {
    const races = [officialRace({ positions: [star(), officialPosition()] })];

    expect(service.normalize(races)).toEqual(races);
  });

  it('never merges regular positions that share a name across races', () => {
    const races = [
      officialRace({
        positions: [officialPosition({ characteristics: STATS })],
      }),
      officialRace({
        name: 'Dwarf',
        teamRaceCode: 'dwarf20',
        positions: [officialPosition({ characteristics: OTHER_STATS })],
      }),
    ];

    expect(service.normalize(races)).toEqual(races);
  });

  it('does not modify its input', () => {
    const races = [
      officialRace({
        isOfficial: false,
        positions: [star({ characteristics: LEGACY_STATS })],
      }),
      officialRace({
        name: 'Dwarf',
        teamRaceCode: 'dwarf20',
        positions: [star()],
      }),
    ];
    const snapshot = structuredClone(races);

    service.normalize(races);

    expect(races).toEqual(snapshot);
  });

  it('returns no races for no races', () => {
    expect(service.normalize([])).toEqual([]);
  });
});
