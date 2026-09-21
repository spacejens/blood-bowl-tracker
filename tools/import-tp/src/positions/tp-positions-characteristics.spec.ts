import { describe, expect, it, vi } from 'vitest';

import {
  makeService,
  officialPosition,
  officialTeamsEntry,
  oneSystemUpsertMock,
  positionRecord,
} from './tp-positions-import.test-helpers';

/** MA 6 ST 3 AG 3 PA 4 AV 9 — the official list's BB2020 stat line. */
const BB2020_STATS = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};
/** The same position's BB2025 stat line, deliberately different. */
const BB2025_STATS = {
  move: 7,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};
/** A position TP says cannot pass: a literal 0, carried through unchanged. */
const SLAYER_STATS = {
  move: 5,
  strength: 3,
  agility: 4,
  passing: 0,
  armour: 9,
};

function upsertAndSyncMocks(positionId: number) {
  return {
    upsertPosition: vi.fn().mockResolvedValue(positionRecord(positionId)),
    syncRaceEras: vi.fn().mockResolvedValue({ positionId, raceEraIds: [1] }),
    bootstrap: oneSystemUpsertMock(),
  };
}

describe('TpPositionsImportService characteristics', () => {
  it('writes one characteristics entry per (position, rules set) when only one source provides it', async () => {
    const { service } = await makeService(upsertAndSyncMocks(70));

    const { characteristicsByPositionId } = await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Runner',
              tpPositionId: 953,
              characteristics: BB2020_STATS,
            }),
          ],
        }),
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2025',
          positions: [
            officialPosition({
              name: 'Dwarf Runner',
              tpPositionId: 954,
              characteristics: BB2025_STATS,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId).toEqual(
      new Map([
        [
          70,
          new Map([
            [900, BB2020_STATS],
            [901, BB2025_STATS],
          ]),
        ],
      ]),
    );
  });

  it('carries a zero Passing through unchanged', async () => {
    const { service } = await makeService(upsertAndSyncMocks(70));

    const { characteristicsByPositionId } = await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Troll Slayer',
              tpPositionId: 954,
              characteristics: SLAYER_STATS,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId.get(70)?.get(900)?.passing).toBe(0);
  });

  it('accumulates star position characteristics the same way as regular positions', async () => {
    const { service } = await makeService(upsertAndSyncMocks(80));

    const { characteristicsByPositionId } = await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Grim Ironjaw',
              isStarPlayer: true,
              tpPositionId: 5001,
              characteristics: BB2020_STATS,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId).toEqual(
      new Map([[80, new Map([[900, BB2020_STATS]])]]),
    );
  });

  it('skips characteristics for a rules set the resolver returned no id for', async () => {
    const { service } = await makeService({
      ...upsertAndSyncMocks(70),
      rulesSetIdByEraName: new Map([['Fifth era', 901]]),
    });

    const { characteristicsByPositionId } = await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Runner',
              tpPositionId: 953,
              characteristics: BB2020_STATS,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId.size).toBe(0);
  });
});

describe('TpPositionsImportService skills', () => {
  it("records each position's skill references per rules set", async () => {
    const { service } = await makeService(upsertAndSyncMocks(70));

    const { skillRefsByPositionId } = await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Runner',
              tpPositionId: 953,
              characteristics: BB2020_STATS,
              skills: [{ skillMasterId: 87 }],
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(skillRefsByPositionId.get(70)).toEqual(
      new Map([[900, [{ skillMasterId: 87 }]]]),
    );
  });

  it("lets an official roster's skills win over a legacy roster's for the same slot", async () => {
    const { service } = await makeService(upsertAndSyncMocks(70));

    const { skillRefsByPositionId } = await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          isOfficial: false,
          positions: [
            officialPosition({
              name: 'Dwarf Runner',
              tpPositionId: 953,
              characteristics: BB2020_STATS,
              skills: [{ skillMasterId: 1 }],
            }),
          ],
        }),
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          isOfficial: true,
          positions: [
            officialPosition({
              name: 'Dwarf Runner',
              tpPositionId: 953,
              characteristics: BB2020_STATS,
              skills: [{ skillMasterId: 2 }],
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(skillRefsByPositionId.get(70)?.get(900)).toEqual([
      { skillMasterId: 2 },
    ]);
  });
});

describe('TpPositionsImportService keywords', () => {
  it('records the BB2025 keyword codes for a position under its rules set', async () => {
    const { service } = await makeService(upsertAndSyncMocks(70));

    const { keywordCodesByPositionId } = await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2025',
          positions: [
            officialPosition({
              name: 'Dwarf Runner',
              tpPositionId: 954,
              keywordCodes: [110, 100],
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(keywordCodesByPositionId).toEqual(
      new Map([[70, new Map([[901, [110, 100]]])]]),
    );
  });

  it('leaves the map empty when an entry carries no keyword codes at all', async () => {
    const { service } = await makeService(upsertAndSyncMocks(70));

    const { keywordCodesByPositionId } = await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Runner',
              tpPositionId: 953,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(keywordCodesByPositionId.size).toBe(0);
  });
});
