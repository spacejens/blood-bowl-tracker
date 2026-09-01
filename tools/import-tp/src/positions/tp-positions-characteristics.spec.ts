import { describe, expect, it, vi } from 'vitest';

import {
  makeService,
  oneSystemUpsertMock,
  positionRecord,
  resultArgs,
  rosterEntry,
} from './tp-positions-import.test-helpers';

/** MA 6 ST 3 AG 3 PA 4 AV 9 — the fixture value one roster reports. */
const RUNNER = { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 };
/** A deliberately different set, for conflict cases. */
const RUNNER_ALT = { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 };
/** A position TP says cannot pass: a literal 0, carried through unchanged. */
const SLAYER = { move: 5, strength: 3, agility: 4, passing: 0, armour: 9 };

function upsertAndSyncMocks(positionId: number) {
  return {
    upsertPosition: vi.fn().mockResolvedValue(positionRecord(positionId)),
    syncRaceEras: vi.fn().mockResolvedValue({ positionId, raceEraIds: [1] }),
    bootstrap: oneSystemUpsertMock(),
  };
}

describe('TpPositionsImportService characteristics accumulation', () => {
  it('maps a regular position to its era rules set characteristics', async () => {
    const { service } = await makeService(upsertAndSyncMocks(70));

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER,
            },
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId).toEqual(
      new Map([[70, new Map([[900, RUNNER]])]]),
    );
  });

  it('carries a zero Passing through unchanged', async () => {
    const { service } = await makeService(upsertAndSyncMocks(70));

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 954,
              name: 'Troll Slayer',
              characteristics: SLAYER,
            },
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId.get(70)?.get(900)?.passing).toBe(0);
  });

  it('collects one entry per rules set when a position appears in two eras', async () => {
    const { service } = await makeService(upsertAndSyncMocks(70));

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER,
            },
          ],
          id: 1,
        }),
        rosterEntry('Fifth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER_ALT,
            },
          ],
          id: 2,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId).toEqual(
      new Map([
        [
          70,
          new Map([
            [900, RUNNER],
            [901, RUNNER_ALT],
          ]),
        ],
      ]),
    );
  });

  it('drops a rules set whose two observations disagree, and records an error', async () => {
    const { service, importResults } = await makeService(
      upsertAndSyncMocks(70),
    );

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER,
            },
          ],
          id: 1,
        }),
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER_ALT,
            },
          ],
          id: 2,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId.get(70)?.has(900)).toBeFalsy();
    expect(resultArgs(importResults).errors).toHaveLength(1);
    expect(resultArgs(importResults).errors[0].message).toContain(
      'Dwarf Runner',
    );
  });

  it('records the conflict only once even when a third roster repeats it', async () => {
    const { service, importResults } = await makeService(
      upsertAndSyncMocks(70),
    );

    await service.importPositions(
      [1, 2, 3].map((id) =>
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: id === 1 ? RUNNER : RUNNER_ALT,
            },
          ],
          id,
        }),
      ),
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(resultArgs(importResults).errors).toHaveLength(1);
  });

  it('keeps a non-conflicting rules set for a position that conflicts in another', async () => {
    const { service } = await makeService(upsertAndSyncMocks(70));

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER,
            },
          ],
          id: 1,
        }),
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER_ALT,
            },
          ],
          id: 2,
        }),
        rosterEntry('Fifth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: SLAYER,
            },
          ],
          id: 3,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId.get(70)).toEqual(
      new Map([[901, SLAYER]]),
    );
  });

  it('accumulates star position characteristics the same way', async () => {
    const { service } = await makeService(upsertAndSyncMocks(80));

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [],
          starPositions: [
            {
              tpPositionId: 5001,
              name: 'Grim Ironjaw',
              characteristics: RUNNER,
            },
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId).toEqual(
      new Map([[80, new Map([[900, RUNNER]])]]),
    );
  });

  it('drops a conflicting star position rules set and records an error', async () => {
    const { service, importResults } = await makeService(
      upsertAndSyncMocks(80),
    );

    const { characteristicsByPositionId } = await service.importPositions(
      [1, 2].map((id) =>
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [],
          starPositions: [
            {
              tpPositionId: 5001,
              name: 'Grim Ironjaw',
              characteristics: id === 1 ? RUNNER : RUNNER_ALT,
            },
          ],
          id,
        }),
      ),
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId.size).toBe(0);
    expect(resultArgs(importResults).errors[0].message).toContain(
      'Grim Ironjaw',
    );
  });

  it('skips characteristics for an era declaring more than one rules set, with one error', async () => {
    const { service, importResults } = await makeService({
      ...upsertAndSyncMocks(70),
      eraRulesSets: new Map([
        ['Fourth era', ['BB2020', 'BB2025']],
        ['Fifth era', ['BB2025']],
      ]),
    });

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER,
            },
          ],
          id: 1,
        }),
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER,
            },
          ],
          id: 2,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId.size).toBe(0);
    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Fourth era');
  });

  it('skips characteristics for an era whose rules set id does not resolve', async () => {
    const { service, importResults } = await makeService({
      ...upsertAndSyncMocks(70),
      rulesSetIdsByName: new Map([['BB2025', 901]]),
    });

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER,
            },
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId.size).toBe(0);
    expect(resultArgs(importResults).errors[0].message).toContain('BB2020');
  });

  it('records no characteristics for a position whose upsert failed', async () => {
    const { service } = await makeService({
      ...upsertAndSyncMocks(70),
      upsertPosition: vi.fn().mockResolvedValue(undefined),
    });

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER,
            },
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId.size).toBe(0);
  });
});
