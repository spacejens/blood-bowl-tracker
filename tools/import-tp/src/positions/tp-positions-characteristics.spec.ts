import { describe, expect, it, vi } from 'vitest';

import type { EraDataConfig } from '../eras/era-data-config.service';
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

    expect(characteristicsByPositionId.has(70)).toBe(false);
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

  it('lets an authoritative roster arriving second override the legacy one', async () => {
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
          teamRace: 'Dwarf_BB2020',
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
      new Map([[70, new Map([[900, RUNNER_ALT]])]]),
    );
    expect(resultArgs(importResults).errors).toEqual([]);
  });

  it('skips characteristics for an era the rules set resolver returned no id for', async () => {
    const { service } = await makeService({
      ...upsertAndSyncMocks(70),
      rulesSetIdByEraName: new Map([['Fifth era', 901]]),
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

  it('keeps agreeing characteristics from an authoritative and a legacy roster', async () => {
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
          teamRace: 'Dwarf_BB2020',
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

    expect(characteristicsByPositionId).toEqual(
      new Map([[70, new Map([[900, RUNNER]])]]),
    );
    expect(resultArgs(importResults).errors).toEqual([]);
  });

  it('imports a position that exists only in the authoritative roster', async () => {
    const { service, importResults } = await makeService(
      upsertAndSyncMocks(70),
    );

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [],
          id: 1,
        }),
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf_BB2020',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 960,
              name: 'Dwarf Thrower',
              characteristics: RUNNER_ALT,
            },
          ],
          id: 2,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId).toEqual(
      new Map([[70, new Map([[900, RUNNER_ALT]])]]),
    );
    expect(resultArgs(importResults).errors).toEqual([]);
  });

  it('keeps an authoritative roster arriving first over a later legacy one', async () => {
    const { service, importResults } = await makeService(
      upsertAndSyncMocks(70),
    );

    const { characteristicsByPositionId } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf_BB2020',
          raceName: 'Dwarf',
          positions: [
            {
              tpPositionId: 953,
              name: 'Dwarf Runner',
              characteristics: RUNNER_ALT,
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

    expect(characteristicsByPositionId).toEqual(
      new Map([[70, new Map([[900, RUNNER_ALT]])]]),
    );
    expect(resultArgs(importResults).errors).toEqual([]);
  });

  it('promotes agreed characteristics an authoritative roster confirms', async () => {
    const { service, importResults } = await makeService(
      upsertAndSyncMocks(70),
    );

    const { characteristicsByPositionId } = await service.importPositions(
      [
        // Legacy roster observes RUNNER first...
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
        // ...the authoritative roster agrees, which marks RUNNER
        // authoritative even though nothing needed storing...
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf_BB2020',
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
        // ...so a third, legacy, disagreeing roster loses rather than making
        // the rules set ambiguous.
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
          id: 3,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(characteristicsByPositionId).toEqual(
      new Map([[70, new Map([[900, RUNNER]])]]),
    );
    expect(resultArgs(importResults).errors).toEqual([]);
  });

  it('still drops a rules set when both disagreeing rosters are authoritative', async () => {
    const { service, importResults } = await makeService(
      upsertAndSyncMocks(70),
    );

    const { characteristicsByPositionId } = await service.importPositions(
      [1, 2].map((id) =>
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf_BB2020',
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

    expect(characteristicsByPositionId.has(70)).toBe(false);
    expect(resultArgs(importResults).errors).toHaveLength(1);
    expect(resultArgs(importResults).errors[0].message).toContain(
      'Dwarf Runner',
    );
  });

  it('never resurrects a dropped rules set from a later authoritative roster', async () => {
    const { service, importResults } = await makeService(
      upsertAndSyncMocks(70),
    );

    const { characteristicsByPositionId } = await service.importPositions(
      [
        // Two legacy rosters disagree: unresolvable, rules set 900 dropped.
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
        // An authoritative roster arriving afterwards does not bring it back.
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf_BB2020',
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

    expect(characteristicsByPositionId.has(70)).toBe(false);
    expect(resultArgs(importResults).errors).toHaveLength(1);
  });

  it('treats no roster as authoritative when its era declares several rules sets', async () => {
    const multiRulesSetEras: EraDataConfig[] = [
      {
        name: 'Fourth era',
        dataSubdir: 'fourth-era',
        rulesSets: ['BB2020', 'BB2025'],
        startDate: '2020-01-01',
      },
    ];
    const { service, importResults } = await makeService({
      ...upsertAndSyncMocks(70),
      getEras: () => multiRulesSetEras,
      eraIdsByName: new Map([['Fourth era', 100]]),
      rulesSetIdByEraName: new Map([['Fourth era', 900]]),
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
          teamRace: 'Dwarf_BB2020',
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

    expect(characteristicsByPositionId.has(70)).toBe(false);
    expect(resultArgs(importResults).errors).toHaveLength(1);
  });
});
